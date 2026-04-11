import cron from 'node-cron';
import { Queue } from 'bullmq';
import { config } from '../config';
import { getBullRedisConnection } from '../config/redis';
import { JobData } from '../types';
import { getGeminiQuotaCooldownInfo } from '../ai/quotaTelemetry';
import { getStaleReposFromDb } from '../db/repoQueries';
import type { RepoRefreshRow } from '../db/repoQueries';
import { recomputeAllDeveloperScores } from '../db/userQueries';

type RepoRefreshCandidate = RepoRefreshRow;

const REFRESH_CAP = 50;
const REFRESH_CAP_UNDER_AI_LIMIT = 10;
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

//Thundering herd prevention
// Stagger job additions by 2 seconds each so we don't hammer Redis + GitHub
// with 50 analysis jobs at once the moment the cron fires at 02:00.
const STAGGER_DELAY_MS = 2_000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const analysisQueue = new Queue<JobData>('repo-analysis', {
    connection: getBullRedisConnection(),
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
    return getStaleReposFromDb();
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

        // Stagger — wait 2 seconds before adding the next job ──
        // This prevents a thundering herd where 50 jobs slam GitHub API + Redis at once.
        if (queuedCount < eligibleRepos.slice(0, refreshCapForRun).length) {
            await sleep(STAGGER_DELAY_MS);
        }
    }

    // ── Prompt 7.1: Queue cleanup — remove completed jobs older than 7 days ──
    // Keeps Redis memory lean; BullMQ stores job data indefinitely unless cleaned.
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const cleaned = await analysisQueue.clean(sevenDaysMs, 1000, 'completed');
    console.log(`[CRON 02:00] Cleaned ${cleaned.length} completed jobs older than 7 days.`);

    console.log(
        `[CRON 02:00] Refresh finished. scanned=${analyzedRepos.length}, eligible=${eligibleRepos.length}, queued=${queuedCount}, skippedInFlight=${skippedInFlight}, cap=${refreshCapForRun}`,
    );
}

async function recomputeDeveloperScoresAndBadges(): Promise<void> {
    const startedAt = new Date();
    console.log(`[CRON 03:00] Starting developer score + rank recomputation at ${startedAt.toISOString()}`);

    try {
        const { recomputedUsers, manualReviewAlerts } = await recomputeAllDeveloperScores(startedAt);
        console.log(
            `[CRON 03:00] Score recompute finished. users=${recomputedUsers}, reviewAlerts=${manualReviewAlerts}. Leaderboard materialized view refreshed.`,
        );
    } catch (err) {
        console.error('[CRON 03:00] Developer score recomputation failed:', err);
    }
}

const refreshTask = cron.schedule('0 2 * * *', () => {
    void queueRepoRefreshJobs();
});

const recomputeTask = cron.schedule('0 3 * * *', () => {
    void recomputeDeveloperScoresAndBadges();
});

console.log('⏱️ Scheduled referesh cron started');
console.log('   Score recompute + leaderboard refresh: daily at 03:00 server time');

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
