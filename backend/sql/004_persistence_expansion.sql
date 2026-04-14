-- 004_persistence_expansion.sql
-- Purpose:
-- 1) Expand persistence for new compare/profile/AI fields without editing prior migrations.
-- 2) Keep migration idempotent and safe to re-run.
-- 3) Auto-populate added repo_metrics columns from metrics_json so existing app writes continue to work.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- REPO_METRICS EXPANSION (denormalized compare/profile fields)
-- ============================================================
ALTER TABLE repo_metrics
  ADD COLUMN IF NOT EXISTS closed_issue_count INTEGER,
  ADD COLUMN IF NOT EXISTS total_issue_count INTEGER,
  ADD COLUMN IF NOT EXISTS commits_last_30_days INTEGER,
  ADD COLUMN IF NOT EXISTS total_weeks_active INTEGER,
  ADD COLUMN IF NOT EXISTS avg_weekly_churn NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS total_churn NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS stars_to_forks_ratio NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS avg_reviews_per_pr NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS issue_response_score NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS community_score NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS ai_advice_source TEXT,
  ADD COLUMN IF NOT EXISTS ai_advice_model TEXT,
  ADD COLUMN IF NOT EXISTS metadata_json JSONB,
  ADD COLUMN IF NOT EXISTS metrics_version TEXT;

CREATE INDEX IF NOT EXISTS idx_repo_metrics_ai_source ON repo_metrics (ai_advice_source);
CREATE INDEX IF NOT EXISTS idx_repo_metrics_community_score ON repo_metrics (community_score);
CREATE INDEX IF NOT EXISTS idx_repo_metrics_closed_issue_count ON repo_metrics (closed_issue_count);
CREATE INDEX IF NOT EXISTS idx_repo_metrics_metrics_json_gin ON repo_metrics USING GIN (metrics_json);
CREATE INDEX IF NOT EXISTS idx_repo_metrics_metadata_json_gin ON repo_metrics USING GIN (metadata_json);

-- Backfill existing rows from metrics_json where possible.
UPDATE repo_metrics rm
SET
  closed_issue_count = COALESCE(
    rm.closed_issue_count,
    CASE WHEN (rm.metrics_json #>> '{issueMetrics,closedIssueCount}') ~ '^-?[0-9]+$'
      THEN (rm.metrics_json #>> '{issueMetrics,closedIssueCount}')::INTEGER
      ELSE NULL
    END
  ),
  total_issue_count = COALESCE(
    rm.total_issue_count,
    CASE WHEN (rm.metrics_json #>> '{issueMetrics,totalIssueCount}') ~ '^-?[0-9]+$'
      THEN (rm.metrics_json #>> '{issueMetrics,totalIssueCount}')::INTEGER
      ELSE NULL
    END
  ),
  commits_last_30_days = COALESCE(
    rm.commits_last_30_days,
    CASE WHEN (rm.metrics_json #>> '{activityMetrics,commitsLast30Days}') ~ '^-?[0-9]+$'
      THEN (rm.metrics_json #>> '{activityMetrics,commitsLast30Days}')::INTEGER
      ELSE NULL
    END
  ),
  total_weeks_active = COALESCE(
    rm.total_weeks_active,
    CASE WHEN (rm.metrics_json #>> '{activityMetrics,totalWeeksActive}') ~ '^-?[0-9]+$'
      THEN (rm.metrics_json #>> '{activityMetrics,totalWeeksActive}')::INTEGER
      ELSE NULL
    END
  ),
  avg_weekly_churn = COALESCE(
    rm.avg_weekly_churn,
    CASE WHEN (rm.metrics_json #>> '{churnMetrics,avgWeeklyChurn}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (rm.metrics_json #>> '{churnMetrics,avgWeeklyChurn}')::NUMERIC
      ELSE NULL
    END
  ),
  total_churn = COALESCE(
    rm.total_churn,
    CASE WHEN (rm.metrics_json #>> '{churnMetrics,totalChurn}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (rm.metrics_json #>> '{churnMetrics,totalChurn}')::NUMERIC
      ELSE NULL
    END
  ),
  stars_to_forks_ratio = COALESCE(
    rm.stars_to_forks_ratio,
    CASE WHEN (rm.metrics_json #>> '{communityMetrics,starsToForksRatio}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (rm.metrics_json #>> '{communityMetrics,starsToForksRatio}')::NUMERIC
      ELSE NULL
    END
  ),
  avg_reviews_per_pr = COALESCE(
    rm.avg_reviews_per_pr,
    CASE WHEN (rm.metrics_json #>> '{communityMetrics,avgReviewsPerPR}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (rm.metrics_json #>> '{communityMetrics,avgReviewsPerPR}')::NUMERIC
      ELSE NULL
    END
  ),
  issue_response_score = COALESCE(
    rm.issue_response_score,
    CASE WHEN (rm.metrics_json #>> '{communityMetrics,issueResponseScore}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (rm.metrics_json #>> '{communityMetrics,issueResponseScore}')::NUMERIC
      ELSE NULL
    END
  ),
  community_score = COALESCE(
    rm.community_score,
    CASE WHEN (rm.metrics_json #>> '{communityMetrics,communityScore}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (rm.metrics_json #>> '{communityMetrics,communityScore}')::NUMERIC
      ELSE NULL
    END
  ),
  ai_advice_source = COALESCE(
    rm.ai_advice_source,
    NULLIF(rm.metrics_json #>> '{aiAdviceSource}', '')
  ),
  ai_advice_model = COALESCE(
    rm.ai_advice_model,
    NULLIF(rm.metrics_json #>> '{aiAdviceModel}', '')
  ),
  metadata_json = COALESCE(
    rm.metadata_json,
    CASE
      WHEN jsonb_typeof(rm.metrics_json -> 'metadata') = 'object' THEN rm.metrics_json -> 'metadata'
      ELSE NULL
    END
  )
WHERE rm.metrics_json IS NOT NULL;

-- Keep denormalized columns synchronized for new inserts/updates.
CREATE OR REPLACE FUNCTION sync_repo_metrics_denormalized_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.metrics_json IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.closed_issue_count := COALESCE(
    NEW.closed_issue_count,
    CASE WHEN (NEW.metrics_json #>> '{issueMetrics,closedIssueCount}') ~ '^-?[0-9]+$'
      THEN (NEW.metrics_json #>> '{issueMetrics,closedIssueCount}')::INTEGER
      ELSE NULL
    END
  );

  NEW.total_issue_count := COALESCE(
    NEW.total_issue_count,
    CASE WHEN (NEW.metrics_json #>> '{issueMetrics,totalIssueCount}') ~ '^-?[0-9]+$'
      THEN (NEW.metrics_json #>> '{issueMetrics,totalIssueCount}')::INTEGER
      ELSE NULL
    END
  );

  NEW.commits_last_30_days := COALESCE(
    NEW.commits_last_30_days,
    CASE WHEN (NEW.metrics_json #>> '{activityMetrics,commitsLast30Days}') ~ '^-?[0-9]+$'
      THEN (NEW.metrics_json #>> '{activityMetrics,commitsLast30Days}')::INTEGER
      ELSE NULL
    END
  );

  NEW.total_weeks_active := COALESCE(
    NEW.total_weeks_active,
    CASE WHEN (NEW.metrics_json #>> '{activityMetrics,totalWeeksActive}') ~ '^-?[0-9]+$'
      THEN (NEW.metrics_json #>> '{activityMetrics,totalWeeksActive}')::INTEGER
      ELSE NULL
    END
  );

  NEW.avg_weekly_churn := COALESCE(
    NEW.avg_weekly_churn,
    CASE WHEN (NEW.metrics_json #>> '{churnMetrics,avgWeeklyChurn}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (NEW.metrics_json #>> '{churnMetrics,avgWeeklyChurn}')::NUMERIC
      ELSE NULL
    END
  );

  NEW.total_churn := COALESCE(
    NEW.total_churn,
    CASE WHEN (NEW.metrics_json #>> '{churnMetrics,totalChurn}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (NEW.metrics_json #>> '{churnMetrics,totalChurn}')::NUMERIC
      ELSE NULL
    END
  );

  NEW.stars_to_forks_ratio := COALESCE(
    NEW.stars_to_forks_ratio,
    CASE WHEN (NEW.metrics_json #>> '{communityMetrics,starsToForksRatio}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (NEW.metrics_json #>> '{communityMetrics,starsToForksRatio}')::NUMERIC
      ELSE NULL
    END
  );

  NEW.avg_reviews_per_pr := COALESCE(
    NEW.avg_reviews_per_pr,
    CASE WHEN (NEW.metrics_json #>> '{communityMetrics,avgReviewsPerPR}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (NEW.metrics_json #>> '{communityMetrics,avgReviewsPerPR}')::NUMERIC
      ELSE NULL
    END
  );

  NEW.issue_response_score := COALESCE(
    NEW.issue_response_score,
    CASE WHEN (NEW.metrics_json #>> '{communityMetrics,issueResponseScore}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (NEW.metrics_json #>> '{communityMetrics,issueResponseScore}')::NUMERIC
      ELSE NULL
    END
  );

  NEW.community_score := COALESCE(
    NEW.community_score,
    CASE WHEN (NEW.metrics_json #>> '{communityMetrics,communityScore}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (NEW.metrics_json #>> '{communityMetrics,communityScore}')::NUMERIC
      ELSE NULL
    END
  );

  NEW.ai_advice_source := COALESCE(NEW.ai_advice_source, NULLIF(NEW.metrics_json #>> '{aiAdviceSource}', ''));
  NEW.ai_advice_model := COALESCE(NEW.ai_advice_model, NULLIF(NEW.metrics_json #>> '{aiAdviceModel}', ''));

  IF NEW.metadata_json IS NULL AND jsonb_typeof(NEW.metrics_json -> 'metadata') = 'object' THEN
    NEW.metadata_json := NEW.metrics_json -> 'metadata';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_repo_metrics_sync_denormalized ON repo_metrics;

CREATE TRIGGER trg_repo_metrics_sync_denormalized
BEFORE INSERT OR UPDATE ON repo_metrics
FOR EACH ROW
EXECUTE FUNCTION sync_repo_metrics_denormalized_fields();

-- ============================================================
-- USER CONTRIBUTION HISTORY (user profile persistence)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_contribution_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  external_pr_count INTEGER NOT NULL DEFAULT 0,
  external_merged_pr_count INTEGER NOT NULL DEFAULT 0,
  contribution_acceptance_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'user-analysis-worker',
  payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_user_contrib_history_username_time
  ON user_contribution_history (LOWER(username), analyzed_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_contrib_history_user_id_time
  ON user_contribution_history (user_id, analyzed_at DESC);

-- ============================================================
-- USER PROFILE SNAPSHOTS (optional durable profile snapshots)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profile_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  developer_score NUMERIC(6,2),
  reliability_pct NUMERIC(6,2),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profile_snapshots_username_time
  ON user_profile_snapshots (LOWER(username), captured_at DESC);

-- ============================================================
-- AI OUTPUT HISTORY TABLES (compare/profile/recommendations)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_user_insights_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  source TEXT NOT NULL,
  model TEXT,
  input_profile JSONB,
  output_insight JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_user_insights_username_time
  ON ai_user_insights_history (LOWER(username), generated_at DESC);

CREATE TABLE IF NOT EXISTS ai_compare_insights_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_by_username TEXT,
  repos TEXT[] NOT NULL,
  source TEXT NOT NULL,
  model TEXT,
  input_metrics JSONB,
  output_insight JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ai_compare_repos_count CHECK (cardinality(repos) BETWEEN 2 AND 4)
);

CREATE INDEX IF NOT EXISTS idx_ai_compare_insights_user_time
  ON ai_compare_insights_history (requested_by_user_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_compare_insights_repos_gin
  ON ai_compare_insights_history USING GIN (repos);

CREATE TABLE IF NOT EXISTS ai_issue_recommendations_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_by_username TEXT,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  source TEXT NOT NULL,
  model TEXT,
  input_payload JSONB,
  output_recommendations JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_issue_rec_repo_time
  ON ai_issue_recommendations_history (LOWER(owner), LOWER(repo), generated_at DESC);

COMMIT;
