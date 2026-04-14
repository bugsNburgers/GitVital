// Prompt 4.2: Key database queries (raw SQL)
// This module is DB-client agnostic: pass any adapter that implements query().

export interface QueryResult<T> {
    rows: T[];
    rowCount?: number;
}

export interface Queryable {
    query<T>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
}

export interface RepoMetricRow {
    id: string;
    repo_id: string;
    job_id: string | null;
    analyzed_at: string;
    health_score: string;
    bus_factor: number | null;
    top_contributor_pct: string | null;
    avg_pr_merge_time_hrs: string | null;
    median_pr_merge_hrs: string | null;
    p90_pr_merge_hrs: string | null;
    commit_velocity_change: string | null;
    open_issue_count: number | null;
    avg_issue_age_days: string | null;
    unresponded_issue_pct: string | null;
    churn_score: string | null;
    total_commits_analyzed: number | null;
    total_prs_analyzed: number | null;
    total_issues_analyzed: number | null;
    risk_flags: unknown;
    ai_advice: string | null;
    metrics_json: unknown;
}

export interface InFlightJobRow {
    id: string;
}

export interface LeaderboardRow {
    username: string;
    avatar_url: string | null;
    developer_score: string;
    global_rank: number | null;
    percentile: string | null;
    primary_language: string | null;
    repos_count: number;
}

export const GET_LATEST_REPO_METRICS_SQL = `
SELECT * FROM repo_metrics
WHERE repo_id = $1
ORDER BY analyzed_at DESC
LIMIT 1;
`;

export const GET_IN_FLIGHT_JOB_SQL = `
SELECT id FROM analysis_jobs
WHERE repo_id = $1 AND status IN ('queued', 'processing')
LIMIT 1;
`;

export const GET_LEADERBOARD_WITH_LANGUAGE_FILTER_SQL = `
WITH repo_totals AS (
    SELECT r.owner AS username, COUNT(*)::int AS repos_count
    FROM repos r
    GROUP BY r.owner
),
repo_language_counts AS (
    SELECT
        r.owner AS username,
        COALESCE(NULLIF(r.language, ''), 'Unknown') AS language,
        COUNT(*)::int AS language_count
    FROM repos r
    GROUP BY r.owner, COALESCE(NULLIF(r.language, ''), 'Unknown')
),
primary_languages AS (
    SELECT username, language
    FROM (
        SELECT
            rlc.username,
            rlc.language,
            ROW_NUMBER() OVER (
                PARTITION BY rlc.username
                ORDER BY rlc.language_count DESC, rlc.language ASC
            ) AS row_num
        FROM repo_language_counts rlc
    ) ranked_languages
    WHERE ranked_languages.row_num = 1
)
SELECT
    lr.username,
    lr.avatar_url,
    lr.developer_score::text AS developer_score,
    lr.global_rank,
    lr.percentile::text AS percentile,
    pl.language AS primary_language,
    COALESCE(rt.repos_count, 0) AS repos_count
FROM (
    SELECT
        u.username,
        u.avatar_url,
        u.developer_score,
        RANK() OVER (ORDER BY u.developer_score DESC) AS global_rank,
        (PERCENT_RANK() OVER (ORDER BY u.developer_score ASC) * 100) AS percentile
    FROM users u
    WHERE u.developer_score > 0
) lr
LEFT JOIN repo_totals rt ON rt.username = lr.username
LEFT JOIN primary_languages pl ON pl.username = lr.username
WHERE ($1::text IS NULL OR EXISTS (
    SELECT 1
    FROM repos r
    WHERE r.owner = lr.username AND LOWER(COALESCE(r.language, '')) = LOWER($1)
))
ORDER BY lr.developer_score DESC
LIMIT 100;
`;

export const REFRESH_LEADERBOARD_MATERIALIZED_VIEW_SQL = `
REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_rankings;
`;

export async function getLatestMetricsForRepo(
    db: Queryable,
    repoId: string,
): Promise<RepoMetricRow | null> {
    const result = await db.query<RepoMetricRow>(GET_LATEST_REPO_METRICS_SQL, [repoId]);
    return result.rows[0] ?? null;
}

export async function getInFlightAnalysisJob(
    db: Queryable,
    repoId: string,
): Promise<InFlightJobRow | null> {
    const result = await db.query<InFlightJobRow>(GET_IN_FLIGHT_JOB_SQL, [repoId]);
    return result.rows[0] ?? null;
}

export async function getLeaderboardWithLanguageFilter(
    db: Queryable,
    language?: string | null,
): Promise<LeaderboardRow[]> {
    const normalizedLanguage = language && language.trim().length > 0 ? language.trim() : null;
    const result = await db.query<LeaderboardRow>(GET_LEADERBOARD_WITH_LANGUAGE_FILTER_SQL, [normalizedLanguage]);
    return result.rows;
}

export async function refreshLeaderboardMaterializedView(db: Queryable): Promise<void> {
    await db.query(REFRESH_LEADERBOARD_MATERIALIZED_VIEW_SQL);
}
