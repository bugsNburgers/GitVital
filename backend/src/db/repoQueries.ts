// src/db/repoQueries.ts — SQL helpers: upsert repos, metrics, health timeline

import { dbQuery } from './pool';
import type { AllMetrics, RepoMetadata, TimelineEntry } from '../types';

// ── Upsert repo row ──
// Returns the repo UUID, or null on failure.
export async function upsertRepo(
  owner: string,
  repoName: string,
  metadata: RepoMetadata,
): Promise<string | null> {
  const rows = await dbQuery<{ id: string }>(
    `INSERT INTO repos (owner, name, stars, forks, language, is_archived, is_fork)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (owner, name) DO UPDATE
       SET stars       = EXCLUDED.stars,
           forks       = EXCLUDED.forks,
           language    = EXCLUDED.language,
           is_archived = EXCLUDED.is_archived,
           is_fork     = EXCLUDED.is_fork
     RETURNING id`,
    [
      owner.toLowerCase(),
      repoName.toLowerCase(),
      metadata.stars ?? 0,
      metadata.forks ?? 0,
      metadata.language ?? null,
      metadata.isArchived ?? false,
      metadata.isFork ?? false,
    ],
  );
  return rows?.[0]?.id ?? null;
}

// ── Insert a repo_metrics row ──
// We always INSERT (not upsert) to preserve history; cron reads MAX(analyzed_at).
export async function insertRepoMetrics(
  repoId: string,
  metrics: AllMetrics,
): Promise<void> {
  const bf = metrics.busFactor;
  const pr = metrics.prMetrics;
  const act = metrics.activityMetrics;
  const iss = metrics.issueMetrics;
  const churn = metrics.churnMetrics;

  await dbQuery(
    `INSERT INTO repo_metrics (
       repo_id, analyzed_at, health_score,
       bus_factor, top_contributor_pct,
       avg_pr_merge_time_hrs, median_pr_merge_hrs, p90_pr_merge_hrs,
       commit_velocity_change,
       open_issue_count, avg_issue_age_days, unresponded_issue_pct,
       churn_score,
       total_commits_analyzed, total_prs_analyzed, total_issues_analyzed,
       risk_flags, ai_advice, metrics_json
     ) VALUES (
       $1, NOW(), $2,
       $3, $4,
       $5, $6, $7,
       $8,
       $9, $10, $11,
       $12,
       $13, $14, $15,
       $16::jsonb, $17, $18::jsonb
     )`,
    [
      repoId,
      metrics.healthScore,
      bf ? bf.busFactor : null,
      bf ? bf.topContributorPct ?? null : null,
      pr ? pr.avgMergeTimeHours ?? null : null,
      pr ? pr.medianMergeTimeHours ?? null : null,
      pr ? pr.p90MergeTimeHours ?? null : null,
      act ? act.velocityChange ?? null : null,
      iss ? iss.openIssueCount ?? null : null,
      iss ? iss.avgIssueAgeDays ?? null : null,
      iss ? iss.unrespondedIssuePct ?? null : null,
      churn ? churn.churnScore ?? null : null,
      act ? act.totalCommitsAnalyzed ?? null : null,
      pr ? pr.totalPRsAnalyzed ?? null : null,
      iss ? iss.totalIssuesAnalyzed ?? null : null,
      JSON.stringify(metrics.riskFlags ?? []),
      metrics.aiAdvice ?? null,
      JSON.stringify(metrics),
    ],
  );
}

// ── Upsert health_timeline rows ──
export async function upsertHealthTimeline(
  repoId: string,
  timeline: TimelineEntry[],
): Promise<void> {
  for (const entry of timeline) {
    await dbQuery(
      `INSERT INTO health_timeline (repo_id, period, health_score, commit_count, pr_count, computed_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (repo_id, period) DO UPDATE
         SET health_score = EXCLUDED.health_score,
             commit_count = EXCLUDED.commit_count,
             pr_count     = EXCLUDED.pr_count,
             computed_at  = NOW()`,
      [repoId, entry.period, entry.healthScore, entry.commitCount ?? 0, entry.prCount ?? 0],
    );
  }
}

// ── Fetch repos older than 24 hrs for the cron refresh ──
export interface RepoRefreshRow {
  owner: string;
  repo: string;
  lastAnalyzedAt: Date;
}

export async function getStaleReposFromDb(): Promise<RepoRefreshRow[]> {
  const rows = await dbQuery<{ owner: string; name: string; last_analyzed_at: string }>(
    `SELECT r.owner, r.name, MAX(rm.analyzed_at) AS last_analyzed_at
     FROM repos r
     JOIN repo_metrics rm ON rm.repo_id = r.id
     GROUP BY r.owner, r.name`,
  );
  if (!rows) return [];
  return rows.map((row) => ({
    owner: row.owner,
    repo: row.name,
    lastAnalyzedAt: new Date(row.last_analyzed_at),
  }));
}
