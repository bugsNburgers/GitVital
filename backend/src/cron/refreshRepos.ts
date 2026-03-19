import cron from 'node-cron';
import { Queue } from 'bullmq';
import { config } from '../config';
import { JobData } from '../types';
import { getGeminiQuotaCooldownInfo } from '../ai/quotaTelemetry';

interface RepoRefreshCandidate {
    owner: string;
    repo: string;
    lastAnalyzedAt: Date;
}

const REFRESH_CAP = 50;
const REFRESH_CAP_UNDER_AI_LIMIT = 10;
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

const analysisQueue = new Queue<JobData>('repo-analysis', {
    connection: {
        host: new URL(config.redisUrl).hostname || 'localhost',
        port: parseInt(new URL(config.redisUrl).port || '6379', 10),
    },
});

function mapQueueStateToSimpleStatus(state: string): 'queued' | 'processing' | 'done' | 'failed' {
    switch (state) {
        case 'waiting':
        case 'delayed':
            return 'queued';
        case 'active':
            return 'processing';
        case 'completed':
            return 'done';
        case 'failed':
            return 'failed';
        default:
            return 'queued';
    }
}

async function getAnalyzedReposFromDb(): Promise<RepoRefreshCandidate[]> {
    // TODO: Replace with Prisma/SQL once DB wiring is available.
    // Intended query shape:
    // 1) repos that have at least one analysis in repo_metrics
    // 2) latest analysis timestamp per repo
    // 3) return owner, repo, lastAnalyzedAt
    //
    // Example SQL:
    // SELECT r.owner, r.name AS repo, MAX(rm.analyzed_at) AS last_analyzed_at
    // FROM repos r
    // JOIN repo_metrics rm ON rm.repo_id = r.id
    // GROUP BY r.owner, r.name;
    return [];
}

function isOlderThan24Hours(lastAnalyzedAt: Date, nowMs: number): boolean {
    return nowMs - lastAnalyzedAt.getTime() > REFRESH_THRESHOLD_MS;
}

async function queueRepoRefreshJobs(): Promise<void> {
    const startedAt = new Date();
    console.log(`[CRON 02:00] Starting repo refresh scan at ${startedAt.toISOString()}`);

    let refreshCapForRun = REFRESH_CAP;
    if (config.costBudget.degradeGracefullyOnLimit) {
        const cooldown = await getGeminiQuotaCooldownInfo();
        if (cooldown.active) {
            refreshCapForRun = Math.min(REFRESH_CAP, REFRESH_CAP_UNDER_AI_LIMIT);
            const remainingMins = Math.ceil(cooldown.remainingMs / 60_000);
            console.log(
                `[CRON 02:00] Gemini quota cooldown active (~${remainingMins}m remaining). Using reduced refresh cap=${refreshCapForRun}.`,
            );
        }
    }

    const analyzedRepos = await getAnalyzedReposFromDb();
    const nowMs = Date.now();

    const eligibleRepos = analyzedRepos.filter((entry) => isOlderThan24Hours(entry.lastAnalyzedAt, nowMs));

    let queuedCount = 0;
    let skippedInFlight = 0;

    for (const candidate of eligibleRepos.slice(0, refreshCapForRun)) {
        const normalizedOwner = candidate.owner.toLowerCase();
        const normalizedRepo = candidate.repo.toLowerCase();
        const jobId = `analyze:${normalizedOwner}:${normalizedRepo}`;

        const existingJob = await analysisQueue.getJob(jobId);
        if (existingJob) {
            const state = await existingJob.getState();
            const status = mapQueueStateToSimpleStatus(state);
            if (status === 'queued' || status === 'processing') {
                skippedInFlight += 1;
                continue;
            }
        }

        await analysisQueue.add(
            'analyze-repo',
            { owner: candidate.owner, repo: candidate.repo },
            {
                jobId,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { age: 3600 },
                removeOnFail: { age: 86400 },
            },
        );

        queuedCount += 1;
    }

    console.log(
        `[CRON 02:00] Refresh finished. scanned=${analyzedRepos.length}, eligible=${eligibleRepos.length}, queued=${queuedCount}, skippedInFlight=${skippedInFlight}, cap=${refreshCapForRun}`,
    );
}

async function recomputeDeveloperScoresAndBadges(): Promise<void> {
    const startedAt = new Date();
    console.log(`[CRON 03:00] Starting developer score + rank recomputation at ${startedAt.toISOString()}`);

    // TODO: Replace with Prisma/SQL update workflow once DB wiring is available.
    // Required behavior:
    // - Recompute users.developer_score
    // - Recompute users.global_rank and users.percentile via PERCENT_RANK window function
    // - Recompute achievements/badges for all users
    //
    // Example percentile SQL shape:
    // WITH ranked AS (
    //   SELECT id,
    //          PERCENT_RANK() OVER (ORDER BY developer_score ASC) * 100 AS percentile,
    //          RANK() OVER (ORDER BY developer_score DESC) AS global_rank
    //   FROM users
    // )
    // UPDATE users u
    // SET percentile = r.percentile,
    //     global_rank = r.global_rank
    // FROM ranked r
    // WHERE u.id = r.id;

    console.log('[CRON 03:00] Recompute job is currently scaffolded (DB wiring pending).');
}

const refreshTask = cron.schedule('0 2 * * *', () => {
    void queueRepoRefreshJobs();
});

const recomputeTask = cron.schedule('0 3 * * *', () => {
    void recomputeDeveloperScoresAndBadges();
});

console.log('⏱️ Scheduled refresh cron started');
console.log('   Repo refresh: daily at 02:00 server time');
console.log('   Score recompute: daily at 03:00 server time');

async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n⚠️ Cron service received ${signal}. Shutting down gracefully...`);

    refreshTask.stop();
    recomputeTask.stop();
    console.log('   ✅ Cron schedules stopped');

    await analysisQueue.close();
    console.log('   ✅ Queue connection closed');

    process.exit(0);
}

process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
});

export {
    queueRepoRefreshJobs,
    recomputeDeveloperScoresAndBadges,
};
