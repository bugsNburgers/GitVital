// src/db/userQueries.ts — SQL helpers for developer score computation & leaderboard

import { dbQuery } from './pool';
import type { LeaderboardRepoEvidence, LeaderboardUserScoreInput } from '../leaderboard/protection';
import {
  computeDeveloperScoreFromVerifiedRepoMetrics,
  shouldFlagScoreChangeForManualReview,
} from '../leaderboard/protection';
import { refreshLeaderboardMaterializedView } from './keyQueries';

// ── Raw row shapes ──
interface UserScoreRow {
  id: string;
  username: string;
  developer_score: string;
  updated_at: string;
}

interface RepoMetricEvidenceRow {
  repo_id_text: string;   // repos.owner/repos.name
  health_score: string;
  stars: number;
  bus_factor: number | null;
  is_fork: boolean;
  is_archived: boolean;
  commit_count: number | null;
}

// ── Fetch all users with existing scores ──
async function getAllUsersForScoring(): Promise<UserScoreRow[]> {
  const rows = await dbQuery<UserScoreRow>(
    `SELECT id, username, developer_score, updated_at FROM users ORDER BY username`,
  );
  return rows ?? [];
}

// ── Fetch repo evidence for a user (repos they own, with latest metric) ──
async function getRepoEvidenceForUser(username: string): Promise<LeaderboardRepoEvidence[]> {
  const rows = await dbQuery<RepoMetricEvidenceRow>(
    `SELECT
       r.owner || '/' || r.name AS repo_id_text,
       rm.health_score,
       r.stars,
       rm.bus_factor,
       r.is_fork,
       r.is_archived,
       rm.total_commits_analyzed AS commit_count
     FROM repos r
     JOIN LATERAL (
       SELECT health_score, bus_factor, total_commits_analyzed
       FROM repo_metrics
       WHERE repo_id = r.id
       ORDER BY analyzed_at DESC
       LIMIT 1
     ) rm ON true
     WHERE LOWER(r.owner) = LOWER($1)`,
    [username],
  );
  if (!rows) return [];
  return rows.map((row) => ({
    repoId: row.repo_id_text,
    healthScore: Number(row.health_score),
    stars: row.stars,
    busFactor: row.bus_factor,
    isFork: row.is_fork,
    isArchived: row.is_archived,
    userCommitCount: row.commit_count ?? 0,
    verifiedFromGitHub: true,
  }));
}

// ── Batch-update developer score for one user ──
async function updateUserDeveloperScore(userId: string, score: number): Promise<void> {
  await dbQuery(
    `UPDATE users SET developer_score = $1 WHERE id = $2`,
    [score, userId],
  );
}

// ── Full recompute: all users → update scores → refresh materialized view ──
export async function recomputeAllDeveloperScores(now: Date): Promise<{
  recomputedUsers: number;
  manualReviewAlerts: number;
}> {
  const users = await getAllUsersForScoring();
  let recomputedUsers = 0;
  let manualReviewAlerts = 0;

  for (const user of users) {
    const repos = await getRepoEvidenceForUser(user.username);
    if (repos.length === 0) continue;

    const input: LeaderboardUserScoreInput = {
      userId: user.id,
      username: user.username,
      previousDeveloperScore: Number(user.developer_score),
      previousScoreUpdatedAt: user.updated_at ? new Date(user.updated_at) : null,
      repos,
    };

    const result = computeDeveloperScoreFromVerifiedRepoMetrics(input);

    if (shouldFlagScoreChangeForManualReview(
      input.previousDeveloperScore,
      result.developerScore,
      input.previousScoreUpdatedAt,
      now,
    )) {
      manualReviewAlerts += 1;
      console.warn('[CRON 03:00][ALERT] Score jump >20 pts in one day', {
        userId: user.id,
        username: user.username,
        previousScore: input.previousDeveloperScore,
        nextScore: result.developerScore,
      });
    }

    await updateUserDeveloperScore(user.id, result.developerScore);
    recomputedUsers += 1;
  }

  // Refresh ranks + percentiles via materialized view
  const db = {
    async query<T>(sql: string, params?: readonly unknown[]) {
      const rows = await dbQuery<T>(sql, params ? [...params] : []);
      return { rows: rows ?? [], rowCount: rows?.length ?? 0 };
    },
  };
  await refreshLeaderboardMaterializedView(db);

  return { recomputedUsers, manualReviewAlerts };
}

// ── Get leaderboard last-updated timestamp ──
export async function getLeaderboardLastUpdated(): Promise<string | null> {
  const rows = await dbQuery<{ max_updated: string }>(
    `SELECT MAX(updated_at)::text AS max_updated FROM users WHERE developer_score > 0`,
  );
  return rows?.[0]?.max_updated ?? null;
}

// ── Get live leaderboard stats (for frontend stat cards) ──
export async function getLeaderboardStats(): Promise<{
  totalDevelopers: number;
  totalRepos: number;
}> {
  const [devRows, repoRows, ownerRows] = await Promise.all([
    dbQuery<{ count: string }>(`SELECT COUNT(*)::text AS count FROM users WHERE developer_score > 0`),
    dbQuery<{ count: string }>(`SELECT COUNT(*)::text AS count FROM repos`),
    dbQuery<{ count: string }>(`SELECT COUNT(DISTINCT LOWER(owner))::text AS count FROM repos`),
  ]);

  const scoredDevelopers = Number(devRows?.[0]?.count ?? 0);
  const repoOwners = Number(ownerRows?.[0]?.count ?? 0);

  return {
    totalDevelopers: scoredDevelopers > 0 ? scoredDevelopers : repoOwners,
    totalRepos: Number(repoRows?.[0]?.count ?? 0),
  };
}
