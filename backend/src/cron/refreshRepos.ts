import cron from 'node-cron';
import { Queue } from 'bullmq';
import { getBullRedisConnection } from '../config/redis';
import { JobData } from '../types';

const analysisQueue = new Queue<JobData>('repo-analysis', {
    connection: getBullRedisConnection(),
});

async function queueRepoRefreshJobs(): Promise<void> {
    const startedAt = new Date();
    console.log(`[CRON 02:00] Repo queue cleanup cron fired at ${startedAt.toISOString()}`);

    // Queue cleanup — remove completed jobs older than 7 days to keep Redis lean.
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const cleaned = await analysisQueue.clean(sevenDaysMs, 1000, 'completed');
    console.log(`[CRON 02:00] Cleaned ${cleaned.length} completed jobs older than 7 days.`);
}

const refreshTask = cron.schedule('0 2 * * *', () => {
    void queueRepoRefreshJobs();
});

console.log('⏱️ Scheduled queue cleanup cron started (runs daily at 02:00)');

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
