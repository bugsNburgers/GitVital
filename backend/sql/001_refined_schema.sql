-- GitVital Prompt 4.1: Refined Schema with Indexes
-- PostgreSQL schema script
-- Notes:
-- 1) Requires pgcrypto for gen_random_uuid().
-- 2) Designed for a clean first-time bootstrap in a fresh database.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id                          TEXT UNIQUE NOT NULL,
  username                           TEXT UNIQUE NOT NULL,
  avatar_url                         TEXT,
  access_token                       TEXT NOT NULL,
  developer_score                    NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (developer_score >= 0 AND developer_score <= 100),
  global_rank                        INTEGER,
  percentile                         NUMERIC(5,2) CHECK (percentile IS NULL OR (percentile >= 0 AND percentile <= 100)),
  external_pr_count                  INTEGER NOT NULL DEFAULT 0 CHECK (external_pr_count >= 0),
  external_merged_pr_count           INTEGER NOT NULL DEFAULT 0 CHECK (external_merged_pr_count >= 0),
  contribution_acceptance_rate       NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (contribution_acceptance_rate >= 0 AND contribution_acceptance_rate <= 100),
  achievements                       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at                         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

CREATE INDEX IF NOT EXISTS idx_users_developer_score ON users (developer_score DESC);

CREATE INDEX IF NOT EXISTS idx_users_global_rank ON users (global_rank ASC);

-- ============================================================
-- REPOS
-- ============================================================
CREATE TABLE IF NOT EXISTS repos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    stars INTEGER NOT NULL DEFAULT 0 CHECK (stars >= 0),
    forks INTEGER NOT NULL DEFAULT 0 CHECK (forks >= 0),
    language TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    is_fork BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner, name)
);

CREATE INDEX IF NOT EXISTS idx_repos_owner_name ON repos (owner, name);

CREATE INDEX IF NOT EXISTS idx_repos_language ON repos (language);

-- ============================================================
-- ANALYSIS JOBS
-- ============================================================
CREATE TABLE IF NOT EXISTS analysis_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    repo_id UUID NOT NULL REFERENCES repos (id) ON DELETE CASCADE,
    user_id UUID REFERENCES users (id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (
        status IN (
            'queued',
            'processing',
            'done',
            'failed'
        )
    ),
    bull_job_id TEXT,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (
        progress >= 0
        AND progress <= 100
    ),
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_repo_status ON analysis_jobs (repo_id, status);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON analysis_jobs (status)
WHERE
    status IN ('queued', 'processing');

-- ============================================================
-- REPO METRICS (one row per completed analysis)
-- ============================================================
CREATE TABLE IF NOT EXISTS repo_metrics (
  id                                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id                            UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  job_id                             UUID REFERENCES analysis_jobs(id) ON DELETE SET NULL,
  analyzed_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

-- Composite score
health_score NUMERIC(5, 2) NOT NULL CHECK (
    health_score >= 0
    AND health_score <= 100
),

-- Core metrics
bus_factor INTEGER,
top_contributor_pct NUMERIC(5, 2),
avg_pr_merge_time_hrs NUMERIC(10, 2),
median_pr_merge_hrs NUMERIC(10, 2),
p90_pr_merge_hrs NUMERIC(10, 2),
commit_velocity_change NUMERIC(10, 2),
open_issue_count INTEGER,
avg_issue_age_days NUMERIC(10, 2),
unresponded_issue_pct NUMERIC(5, 2),
churn_score NUMERIC(10, 2),

-- Raw counts
total_commits_analyzed INTEGER,
total_prs_analyzed INTEGER,
total_issues_analyzed INTEGER,

-- Risk flags + AI advice stored as JSON
risk_flags                         JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_advice                          TEXT,
  metrics_json                       JSONB
);

CREATE INDEX IF NOT EXISTS idx_metrics_repo_latest ON repo_metrics (repo_id, analyzed_at DESC);

-- ============================================================
-- HEALTH TIMELINE
-- ============================================================
CREATE TABLE IF NOT EXISTS health_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    repo_id UUID NOT NULL REFERENCES repos (id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    health_score NUMERIC(5, 2),
    commit_count INTEGER,
    pr_count INTEGER,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (repo_id, period)
);

CREATE INDEX IF NOT EXISTS idx_timeline_repo ON health_timeline (repo_id, period);

-- ============================================================
-- LEADERBOARD MATERIALIZED VIEW (recomputed by cron)
-- ============================================================
DROP MATERIALIZED VIEW IF EXISTS leaderboard_rankings;

CREATE MATERIALIZED VIEW leaderboard_rankings AS
SELECT
    u.id,
    u.username,
    u.avatar_url,
    u.developer_score,
    RANK() OVER (
        ORDER BY u.developer_score DESC
    ) AS global_rank,
    PERCENT_RANK() OVER (
        ORDER BY u.developer_score ASC
    ) * 100 AS percentile
FROM users u
WHERE
    u.developer_score > 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_id ON leaderboard_rankings (id);

-- Keep users.updated_at current on row updates.
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;

CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

COMMIT;