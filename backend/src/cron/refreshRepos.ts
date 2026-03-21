import cron from 'node-cron';
import { Queue } from 'bullmq';
import { config } from '../config';
import { JobData } from '../types';
import { getGeminiQuotaCooldownInfo } from '../ai/quotaTelemetry';
import {
    computeDeveloperScoreFromVerifiedRepoMetrics,
    shouldFlagScoreChangeForManualReview,
    type LeaderboardUserScoreInput,
} from '../leaderboard/protection';

interface RepoRefreshCandidate {
    owner: string;
    repo: string;
    lastAnalyzedAt: Date;
}

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

    // Leaderboard anti-manipulation policy (Prompt 5.4):
    // 1) Scores are computed server-side only.
    // 2) Scores are derived from verified GitHub data and repo_metrics (never user-submitted scores).
    // 3) Significant contributor rule: user_commit_count > 10.
    // 4) Legitimacy weighting:
    //    - stars < 5 and bus_factor = 1 => reduced weight
    //    - forked repos => 50% weight
    //    - archived repos => excluded
    // 5) Runs only on cron (03:00), not on-demand endpoints.
    // 6) Score jumps > 20 points in the same UTC day are logged for manual review.

    // TODO: Replace with Prisma/SQL data load when DB wiring is active.
    // Intended source shape for each user:
    // - user id/username
    // - current developer_score and updated_at
    // - repo evidence rows from verified GitHub-derived tables:
    //   health_score, stars, bus_factor, is_fork, is_archived, user_commit_count, verified flag
    const candidates: LeaderboardUserScoreInput[] = [];

    let recomputedUsers = 0;
    let manualReviewAlerts = 0;

    for (const candidate of candidates) {
        const result = computeDeveloperScoreFromVerifiedRepoMetrics(candidate);

        if (shouldFlagScoreChangeForManualReview(
            candidate.previousDeveloperScore,
            result.developerScore,
            candidate.previousScoreUpdatedAt,
            startedAt,
        )) {
            manualReviewAlerts += 1;
            console.warn('[CRON 03:00][ALERT] Developer score jump exceeds 20 points in one day', {
                userId: candidate.userId,
                username: candidate.username,
                previousScore: candidate.previousDeveloperScore,
                nextScore: result.developerScore,
                consideredRepos: result.breakdown.consideredRepos,
                ignoredRepos: result.breakdown.ignoredRepos,
            });
        }

        // TODO: Persist computed server-side score (never from user input)
        // await prisma.user.update({
        //   where: { id: candidate.userId },
        //   data: { developerScore: result.developerScore },
        // });

        recomputedUsers += 1;
    }

    // TODO: Recompute ranks/percentiles after score updates.
    // Example SQL shape:
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

    console.log(
        `[CRON 03:00] Score recompute finished. users=${recomputedUsers}, reviewAlerts=${manualReviewAlerts}. DB persistence/rank refresh pending wiring.`,
    );
}

const refreshTask = cron.schedule('0 2 * * *', () => {
    void queueRepoRefreshJobs();
});

const recomputeTask = cron.schedule('0 3 * * *', () => {
    void recomputeDeveloperScoresAndBadges();
});

//Refresh leaderboard materialized view every 6 hours
const leaderboardViewRefreshTask = cron.schedule('0 */6 * * *', () => {
    const startedAt = new Date();
    console.log(`[CRON] Refreshing leaderboard materialized view at ${startedAt.toISOString()}...`);
    
    // TODO: Refresh via Prisma once DB is connected
    // await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW leaderboard_rankings');
    
    console.log('[CRON] Leaderboard materialized view refresh finished.');
});

console.log('⏱️ Scheduled referesh cron started');
console.log('   Repo refresh: daily at 02:00 server time');
console.log('   Score recompute: daily at 03:00 server time');
console.log('   Leaderboard view refresh: every 6 hours');

async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n⚠️ Cron service received ${signal}. Shutting down gracefully...`);

    refreshTask.stop();
    recomputeTask.stop();
    leaderboardViewRefreshTask.stop();
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
