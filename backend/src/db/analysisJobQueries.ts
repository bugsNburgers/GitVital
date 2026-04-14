import { dbQuery } from './pool';

export type AnalysisJobStatus = 'queued' | 'processing' | 'done' | 'failed';

interface UpsertAnalysisJobInput {
    repoId: string;
    userId?: string;
    bullJobId: string;
    status: AnalysisJobStatus;
    progress: number;
    error?: string | null;
    completedAt?: string | null;
}

// Upsert by BullMQ job ID: update existing row when present, otherwise create one.
export async function upsertAnalysisJobByBullId(input: UpsertAnalysisJobInput): Promise<string | null> {
    const rows = await dbQuery<{ id: string }>(
        `WITH updated AS (
       UPDATE analysis_jobs
       SET repo_id = $1,
           user_id = $2,
           status = $4,
           progress = $5,
           error = $6,
           completed_at = $7
       WHERE bull_job_id = $3
       RETURNING id
     ),
     inserted AS (
       INSERT INTO analysis_jobs (repo_id, user_id, status, bull_job_id, progress, error, completed_at)
       SELECT $1, $2, $4, $3, $5, $6, $7
       WHERE NOT EXISTS (SELECT 1 FROM updated)
       RETURNING id
     )
     SELECT id FROM updated
     UNION ALL
     SELECT id FROM inserted
     LIMIT 1`,
        [
            input.repoId,
            input.userId ?? null,
            input.bullJobId,
            input.status,
            Math.max(0, Math.min(100, input.progress)),
            input.error ?? null,
            input.completedAt ?? null,
        ],
    );

    return rows?.[0]?.id ?? null;
}
