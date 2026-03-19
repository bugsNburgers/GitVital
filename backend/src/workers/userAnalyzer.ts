import { Worker, Job, UnrecoverableError } from 'bullmq';
import { redis } from '../config/redis';
import { config } from '../config';
import { UserJobData, UserMergedPRNode, UserContributionMetrics } from '../types';

const MAX_PRS = 500;
const PAGE_SIZE = 100;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const RETRY_BACKOFF_MS = [1000, 3000, 9000];

interface RateLimitInfo {
    remaining: number;
    resetAt: string;
}

interface GraphQLPage {
    user: {
        pullRequests: {
            pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
            };
            nodes: UserMergedPRNode[];
        };
    } | null;
    rateLimit: RateLimitInfo;
}

interface HttpError {
    status: number;
    message: string;
    rateLimitResetAt?: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHttpError(error: unknown): error is HttpError {
    return typeof error === 'object' && error !== null && 'status' in error;
}

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

async function queryGitHubGraphQL(token: string, query: string, variables: Record<string, unknown>): Promise<GraphQLPage> {
    for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt += 1) {
        const response = await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, variables }),
        });

        if (response.status >= 500) {
            if (attempt < RETRY_BACKOFF_MS.length) {
                await sleep(RETRY_BACKOFF_MS[attempt]);
                continue;
            }
            throw { status: response.status, message: `GitHub 5xx after retries (${response.status})` } as HttpError;
        }

        const payload = await response.json() as {
            data?: GraphQLPage;
            errors?: Array<{ message?: string; type?: string; extensions?: { code?: string } }>;
        };

        if (response.status === 401) {
            throw { status: 401, message: 'OAuth token expired' } as HttpError;
        }

        if (response.status === 403) {
            const resetAt = payload.data?.rateLimit?.resetAt;
            throw { status: 403, message: 'Rate limit exceeded', rateLimitResetAt: resetAt } as HttpError;
        }

        if (payload.errors && payload.errors.length > 0) {
            const combined = payload.errors.map((e) => e.message || e.extensions?.code || e.type || 'GraphQL error').join('; ');
            const looksLikeRateLimit = payload.errors.some((e) =>
                (e.extensions?.code || '').toUpperCase().includes('RATE_LIMITED') ||
                (e.message || '').toLowerCase().includes('rate limit')
            );

            if (looksLikeRateLimit) {
                throw {
                    status: 403,
                    message: combined || 'Rate limit exceeded',
                    rateLimitResetAt: payload.data?.rateLimit?.resetAt,
                } as HttpError;
            }

            throw { status: 400, message: combined } as HttpError;
        }

        if (!payload.data) {
            throw { status: 502, message: 'Missing GraphQL response data' } as HttpError;
        }

        return payload.data;
    }

    throw { status: 500, message: 'Unexpected retry loop exit' } as HttpError;
}

async function fetchUserMergedPRs(username: string): Promise<UserMergedPRNode[]> {
    const token = getServiceToken();
    const query = `
    query UserMergedPRs($username: String!, $first: Int!, $after: String) {
      user(login: $username) {
        pullRequests(first: $first, after: $after, states: MERGED, orderBy: { field: CREATED_AT, direction: DESC }) {
          pageInfo { hasNextPage endCursor }
          nodes {
            createdAt
            mergedAt
            author { login }
            repository { owner { login } }
          }
        }
      }
      rateLimit { remaining resetAt }
    }
  `;

    const results: UserMergedPRNode[] = [];
    let cursor: string | null = null;
    let lastCursor: string | null = null;
    const cutoff = Date.now() - ONE_YEAR_MS;

    while (results.length < MAX_PRS) {
        const data = await queryGitHubGraphQL(token, query, {
            username,
            first: PAGE_SIZE,
            after: cursor,
        });

        if (data.rateLimit.remaining < 200) {
            const reset = new Date(data.rateLimit.resetAt).getTime();
            const waitMs = Math.max(reset - Date.now() + 5000, 1000);
            await sleep(waitMs);
        }

        const prConnection = data.user?.pullRequests;
        if (!prConnection) {
            break;
        }

        const nodes = prConnection.nodes || [];

        // Required safety guard: empty page means stop.
        if (nodes.length === 0) {
            break;
        }

        let reachedOlderThanCutoff = false;
        for (const node of nodes) {
            const createdAtMs = new Date(node.createdAt).getTime();
            if (!Number.isFinite(createdAtMs) || createdAtMs < cutoff) {
                reachedOlderThanCutoff = true;
                break;
            }
            results.push(node);
            if (results.length >= MAX_PRS) {
                break;
            }
        }

        if (reachedOlderThanCutoff || results.length >= MAX_PRS) {
            break;
        }

        if (!prConnection.pageInfo.hasNextPage) {
            break;
        }

        const nextCursor = prConnection.pageInfo.endCursor;

        // Required safety guard: unchanged cursor protection.
        if (!nextCursor || nextCursor === cursor || nextCursor === lastCursor) {
            break;
        }

        lastCursor = cursor;
        cursor = nextCursor;
    }

    return results.slice(0, MAX_PRS);
}

function computeUserContributionMetrics(username: string, mergedPRs: UserMergedPRNode[]): UserContributionMetrics {
    const normalizedUser = username.toLowerCase();

    const strictExternal = mergedPRs.filter((pr) => {
        const authorLogin = pr.author?.login?.toLowerCase();
        const ownerLogin = pr.repository.owner.login?.toLowerCase();

        if (!authorLogin || !ownerLogin) {
            return false;
        }

        // Strict definition: merged PR, authored by the user, merged into non-owned repos.
        return pr.mergedAt !== null && authorLogin === normalizedUser && ownerLogin !== normalizedUser;
    });

    const externalPRCount = strictExternal.length;
    const externalMergedPRCount = strictExternal.length;
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

        // Step 1/2/3 with safeguards happens inside the fetcher.
        const mergedPRs = await fetchUserMergedPRs(username);
        await job.updateProgress(55);

        // Step 4/5
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

        if (isHttpError(error)) {
            if (error.status === 401) {
                await setUserJobState(job.id!, 'failed', 'OAuth token expired');
                throw new UnrecoverableError('OAuth token expired');
            }

            if (error.status === 403 && error.rateLimitResetAt) {
                const waitMs = Math.max(new Date(error.rateLimitResetAt).getTime() - Date.now() + 5000, 1000);
                await job.moveToDelayed(Date.now() + waitMs, job.token);
                return;
            }

            throw error;
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
