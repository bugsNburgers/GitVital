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
