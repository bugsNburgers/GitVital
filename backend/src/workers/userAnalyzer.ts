import { Worker, Job, UnrecoverableError } from 'bullmq';
import { redis } from '../config/redis';
import { config } from '../config';
import { UserJobData, UserMergedPRNode, UserContributionMetrics } from '../types';
import { GitHubClient, AuthExpiredError, RateLimitError } from '../github/client';
import { fetchUserMergedPRs as fetchUserMergedPRsFromGitHub } from '../github/fetchUserMergedPRs';

const MAX_USER_PRS = 500;

async function setUserJobState(jobId: string, status: 'processing' | 'done' | 'failed', error?: string): Promise<void> {
    await redis.set(`userjobstatus:${jobId}`, status, 'EX', 3600);
    if (error) {
        await redis.set(`userjoberror:${jobId}`, error, 'EX', 3600);
    } else {
        await redis.del(`userjoberror:${jobId}`);
    }
}

function getServiceToken(): string {
    const token = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN || '';
    if (!token) {
        throw new UnrecoverableError('Missing GitHub service token for user analysis worker');
    }
    return token;
}

function computeUserContributionMetrics(username: string, mergedPRs: UserMergedPRNode[]): UserContributionMetrics {
    const normalizedUser = username.toLowerCase();

    const strictExternal = mergedPRs.filter((pr) => {
        const authorLogin = pr.author?.login?.toLowerCase();
        const ownerLogin = pr.repository.owner?.login?.toLowerCase();

        if (!authorLogin || !ownerLogin) {
            return false;
        }

        // Strict definition: merged PR, authored by the user, merged into non-owned repos.
        return pr.mergedAt !== null && authorLogin === normalizedUser && ownerLogin !== normalizedUser;
    });

    const externalPRCount = strictExternal.length;
    const externalMergedPRCount = strictExternal.length;
    // TODO: contributionAcceptanceRate is always 0% or 100% because the GraphQL query
    // only fetches MERGED PRs. To compute a meaningful rate, also fetch CLOSED (non-merged)
    // external PRs and use: mergedCount / (mergedCount + closedCount) * 100.
    // This requires a second GraphQL query which doubles API point usage.
    const contributionAcceptanceRate = externalPRCount === 0
        ? 0
        : Number(((externalMergedPRCount / externalPRCount) * 100).toFixed(2));

    return {
        externalPRCount,
        externalMergedPRCount,
        contributionAcceptanceRate,
    };
}

async function processUserAnalysisJob(job: Job<UserJobData>): Promise<void> {
    const { username } = job.data;
    const logPrefix = `[UserJob ${job.id}] ${username}`;

    try {
        await setUserJobState(job.id!, 'processing');
        await job.updateProgress(5);

        // Create GitHub client with service token
        const token = getServiceToken();
        const client = new GitHubClient(token);

        // Fetch user's merged PRs using the shared module
        // Prompt 6.1: Deleted/inaccessible repository references in PR history → skip safely
        // The GraphQL response naturally omits nodes with deleted repos, but network errors
        // or partial failures are caught here to return 0 metrics instead of crashing.
        let mergedPRs: UserMergedPRNode[] = [];
        try {
            mergedPRs = await fetchUserMergedPRsFromGitHub(client, username, MAX_USER_PRS);
        } catch (fetchError) {
            console.warn(`   ${logPrefix} — PR fetch failed, returning zero metrics:`, fetchError);
            // Continue with empty array — all metrics will be 0
        }
        await job.updateProgress(55);

        // Compute contribution metrics
        // Prompt 6.1: 0 merged PRs → all metrics as 0 (handled naturally by computeUserContributionMetrics)
        // Prompt 6.1: Only own-repo PRs → external counts = 0 (handled by strictExternal filter)
        // Prompt 6.1: Missing author/owner login → skip safely (handled by null checks in filter)
        const metrics = computeUserContributionMetrics(username, mergedPRs);
        await job.updateProgress(80);

        // Step 6: Persist metrics to users table (TODO Prisma wiring in later prompt).
        // await prisma.user.update({
        //   where: { username },
        //   data: {
        //     externalPrCount: metrics.externalPRCount,
        //     externalMergedPrCount: metrics.externalMergedPRCount,
        //     contributionAcceptanceRate: metrics.contributionAcceptanceRate,
        //   },
        // });

        await job.updateProgress(95);

        // Step 7: Mark complete.
        await setUserJobState(job.id!, 'done');
        await job.updateProgress(100);

        console.log(`✅ ${logPrefix} complete: externalPRs=${metrics.externalPRCount}, acceptance=${metrics.contributionAcceptanceRate}%`);
    } catch (error) {
        if (error instanceof UnrecoverableError) {
            await setUserJobState(job.id!, 'failed', error.message);
            throw error;
        }

        // Use shared typed errors from GitHubClient instead of inline HttpError
        if (error instanceof AuthExpiredError) {
            await setUserJobState(job.id!, 'failed', 'OAuth token expired');
            throw new UnrecoverableError('OAuth token expired');
        }

        if (error instanceof RateLimitError) {
            if (error.resetAt) {
                const waitMs = Math.max(new Date(error.resetAt).getTime() - Date.now() + 5000, 1000);
                await job.moveToDelayed(Date.now() + waitMs, job.token);
                return;
            }
        }

        throw error;
    }
}

const userWorker = new Worker<UserJobData>(
    'user-analysis',
    processUserAnalysisJob,
    {
        connection: {
            host: new URL(config.redisUrl).hostname || 'localhost',
            port: parseInt(new URL(config.redisUrl).port || '6379', 10),
            password: new URL(config.redisUrl).password ? decodeURIComponent(new URL(config.redisUrl).password) : undefined,
            tls: config.redisUrl.startsWith('rediss://') ? {} : undefined,
        },
        concurrency: 2,
        limiter: {
            max: 10,
            duration: 60_000,
        },
        // Attempts/backoff are set at enqueue time in POST /api/user/analyze.
    },
);

userWorker.on('ready', () => {
    console.log('🏭 User contribution worker ready');
    console.log('   Queue: "user-analysis"');
    console.log('   Concurrency: 2');
    console.log('   Limiter: 10 jobs/minute');
});

userWorker.on('active', (job) => {
    console.log(`🔄 User job ${job.id} (${job.data.username}) started`);
});

userWorker.on('completed', (job) => {
    console.log(`✅ User job ${job.id} (${job.data.username}) completed`);
});

userWorker.on('failed', (job, err) => {
    if (!job) {
        console.error('❌ User job failed (missing job reference):', err.message);
        return;
    }

    console.error(`❌ User job ${job.id} (${job.data.username}) failed:`, err.message);
    console.error(`   Attempts: ${job.attemptsMade}/${job.opts.attempts || 3}`);

    const maxAttempts = job.opts.attempts || 3;
    if (job.attemptsMade >= maxAttempts) {
        void setUserJobState(job.id!, 'failed', err.message || 'User contribution analysis failed after retries');
    }
});

userWorker.on('stalled', (jobId) => {
    console.warn(`⚠️ User job ${jobId} stalled`);
});

userWorker.on('error', (err) => {
    console.error('❌ User worker error:', err.message);
});

async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n⚠️ User worker received ${signal}. Shutting down gracefully...`);
    await userWorker.close();
    console.log('   ✅ User worker closed');
    redis.disconnect();
    console.log('   ✅ Redis disconnected');
    process.exit(0);
}

process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
});

export { userWorker };
