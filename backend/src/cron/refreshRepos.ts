import cron from 'node-cron';
import { Queue } from 'bullmq';
import { config } from '../config';
import { getBullRedisConnection } from '../config/redis';
import { JobData } from '../types';
import { getGeminiQuotaCooldownInfo } from '../ai/quotaTelemetry';

const REFRESH_CAP = 50;
const REFRESH_CAP_UNDER_AI_LIMIT = 10;
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

async function queueRepoRefreshJobs(): Promise<void> {
    const startedAt = new Date();
    console.log(`[CRON 02:00] Repo refresh cron fired at ${startedAt.toISOString()} — no DB source available, skipping stale-repo scan.`);

    let refreshCapForRun = REFRESH_CAP;
    if (config.costBudget.degradeGracefullyOnLimit) {
        const cooldown = await getGeminiQuotaCooldownInfo();
        if (cooldown.active) {
            refreshCapForRun = Math.min(REFRESH_CAP, REFRESH_CAP_UNDER_AI_LIMIT);
            const remainingMins = Math.ceil(cooldown.remainingMs / 60_000);
            console.log(
                `[CRON 02:00] Gemini quota cooldown active (~${remainingMins}m remaining). Cap=${refreshCapForRun}.`,
            );
        }
    }

    // Queue cleanup — remove completed jobs older than 7 days to keep Redis lean.
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const cleaned = await analysisQueue.clean(sevenDaysMs, 1000, 'completed');
    console.log(`[CRON 02:00] Cleaned ${cleaned.length} completed jobs older than 7 days.`);

    console.log(
        `[CRON 02:00] Refresh finished. No persistent store — queued=0, cap=${refreshCapForRun}`,
    );
}

const refreshTask = cron.schedule('0 2 * * *', () => {
    void queueRepoRefreshJobs();
});

console.log('⏱️ Scheduled refresh cron started');

async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n⚠️ Cron service received ${signal}. Shutting down gracefully...`);

    refreshTask.stop();
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
};
