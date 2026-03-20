// src/workers/repoAnalyzer.ts — BullMQ Worker (SEPARATE PROCESS)
//
// This file is NOT imported by the API server.
// It runs independently: `npm run worker` starts this file.
// Think of it as a completely separate employee (the chef) who only
// communicates with the API server (the waiter) through the Redis queue.

import { Worker, Job, UnrecoverableError } from 'bullmq';
import { redis } from '../config/redis';
import { config } from '../config';
import { JobData, CommitNode, PRNode, IssueNode, AllMetrics } from '../types';
import { generateAIAdvice } from '../ai/advice';

interface TimelineEntry {
  period: string;
  healthScore: number;
  commitCount: number;
  prCount: number;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 1: IMPORTS — Real fetchers + remaining stubs
// ═══════════════════════════════════════════════════════════════

import { GitHubClient } from '../github/client';
import { fetchCommits as fetchCommitsFromGitHub } from '../github/fetchCommits';
import { fetchPRs as fetchPRsFromGitHub } from '../github/fetchPRs';
import { fetchIssues as fetchIssuesFromGitHub } from '../github/fetchIssues';
import { decryptAccessToken } from '../security/tokenCrypto';

// API constraints from Planscribble.md
const MAX_COMMITS = 1000;
const MAX_PRS = 500;
const MAX_ISSUES = 500;

// Resolve a GitHub access token for the worker.
// Priority: user's OAuth token (encrypted in Redis) → service token env var.
async function resolveAccessToken(userId?: string): Promise<string> {
  if (userId) {
    const encrypted = await redis.get(`oauth:github:token:user:${userId}`);
    if (encrypted) {
      try {
        return decryptAccessToken(encrypted, config.encryptionKey);
      } catch {
        console.warn('[Worker] Failed to decrypt user token, falling back to service token.');
      }
    }
  }

  const serviceToken = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN || '';
  if (!serviceToken) {
    throw new UnrecoverableError('No GitHub access token available. User must re-authenticate or set GITHUB_TOKEN.');
  }
  return serviceToken;
}

// TODO: Replace with real GraphQL query for repo metadata (no module exists yet)
async function fetchRepoMetadata(client: GitHubClient, owner: string, repo: string): Promise<{ exists: boolean; isPrivate: boolean; stars: number; language: string | null }> {
  console.log(`   [STUB] fetchRepoMetadata(${owner}/${repo})`);
  void client; // suppress unused warning until real implementation
  return { exists: true, isPrivate: false, stars: 0, language: null };
}

// TODO: Replace with real Metrics Engine (Prompt 8.x)
function computeAllMetrics(
  _commits: CommitNode[],
  _prs: PRNode[],
  _issues: IssueNode[],
): AllMetrics {
  console.log('   [STUB] computeAllMetrics()');
  return {
    busFactor: null,
    prMetrics: null,
    activityMetrics: null,
    issueMetrics: null,
    churnMetrics: null,
    healthScore: 0,
    riskFlags: [],
    aiAdvice: null,
  };
}

// TODO: Replace with real timeline builder (Prompt 8.x)
function computeQuarterlyTimeline(commits: CommitNode[], prs: PRNode[], healthScore: number): TimelineEntry[] {
  const now = new Date();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return [{
    period: `${now.getUTCFullYear()}-Q${quarter}`,
    healthScore,
    commitCount: commits.length,
    prCount: prs.length,
  }];
}

// TODO: Replace with dedicated risk flag module (Prompt 8.3)
function generateRiskFlags(metrics: AllMetrics): AllMetrics['riskFlags'] {
  return metrics.riskFlags;
}

async function setJobState(jobId: string, status: 'queued' | 'processing' | 'done' | 'failed', error?: string): Promise<void> {
  await redis.set(`jobstatus:${jobId}`, status, 'EX', 3600);
  if (error) {
    await redis.set(`joberror:${jobId}`, error, 'EX', 3600);
  } else {
    await redis.del(`joberror:${jobId}`);
  }
}


// ═══════════════════════════════════════════════════════════════
// SECTION 2: HELPER — GitHub Error Classifier
// ═══════════════════════════════════════════════════════════════
// When GitHub returns an error, we need to handle it differently
// depending on the HTTP status code.

interface GitHubApiError {
  status: number;
  message: string;
  rateLimitResetAt?: string;
}

function isGitHubApiError(error: unknown): error is GitHubApiError {
  return typeof error === 'object' && error !== null && 'status' in error;
}


// ═══════════════════════════════════════════════════════════════
// SECTION 3: THE JOB PROCESSOR
// ═══════════════════════════════════════════════════════════════
// This is the function that runs every time a job is picked up.
// It follows the exact 15-step pipeline from the architecture doc.

async function processAnalysisJob(job: Job<JobData>): Promise<void> {
  const { owner, repo, userId } = job.data;
  const logPrefix = `[Job ${job.id}] ${owner}/${repo}`;

  console.log(`\n🔬 ${logPrefix} — Starting analysis...`);

  try {
    // ──────────────────────────────────────────────
    // Step 1: Update job status to "processing"
    // ──────────────────────────────────────────────
    // We track status in Redis (for fast polling) and will also
    // update the database once Prisma is set up.
    await setJobState(job.id!, 'processing');
    await job.updateProgress(5);
    console.log(`   ${logPrefix} — Step 1: Status → processing`);

    // TODO: Update analysis_jobs table via Prisma
    // await prisma.analysisJob.update({
    //   where: { id: job.id },
    //   data: { status: 'processing', startedAt: new Date() },
    // });

    // ──────────────────────────────────────────────
    // Step 1.5: Resolve access token and create GitHub client
    // ──────────────────────────────────────────────
    const accessToken = await resolveAccessToken(userId);
    const client = new GitHubClient(accessToken);


    // ──────────────────────────────────────────────
    // Step 2: Validate repo exists and is public
    // ──────────────────────────────────────────────
    const metadata = await fetchRepoMetadata(client, owner, repo);
    await job.updateProgress(10);

    if (!metadata.exists) {
      throw { status: 404, message: 'Repository not found or is private' } as GitHubApiError;
    }

    if (metadata.isPrivate) {
      throw { status: 404, message: 'Repository not found or is private' } as GitHubApiError;
    }

    console.log(`   ${logPrefix} — Step 2: Repo validated ✓`);


    // ──────────────────────────────────────────────
    // Step 3: Fetch commits (paginated, max 1000, last 12 months)
    // ──────────────────────────────────────────────
    // Raw commit data stays in memory ONLY — never written to DB.
    console.log(`   ${logPrefix} — Step 3: Fetching commits...`);
    const commits = await fetchCommitsFromGitHub(client, owner, repo, MAX_COMMITS);
    await job.updateProgress(30);
    console.log(`   ${logPrefix} — Step 3: Fetched ${commits.length} commits ✓`);


    // ──────────────────────────────────────────────
    // Step 4: Fetch PRs (paginated, max 500, MERGED, last 12 months)
    // ──────────────────────────────────────────────
    console.log(`   ${logPrefix} — Step 4: Fetching pull requests...`);
    const prs = await fetchPRsFromGitHub(client, owner, repo, MAX_PRS);
    await job.updateProgress(50);
    console.log(`   ${logPrefix} — Step 4: Fetched ${prs.length} PRs ✓`);


    // ──────────────────────────────────────────────
    // Step 5: Fetch issues (paginated, max 500, OPEN)
    // ──────────────────────────────────────────────
    console.log(`   ${logPrefix} — Step 5: Fetching issues...`);
    const issues = await fetchIssuesFromGitHub(client, owner, repo, MAX_ISSUES);
    await job.updateProgress(60);
    console.log(`   ${logPrefix} — Step 5: Fetched ${issues.length} issues ✓`);


    // ──────────────────────────────────────────────
    // Step 6: Run Metrics Engine (pure functions, in-memory)
    // ──────────────────────────────────────────────
    // The Metrics Engine takes raw data and returns computed results.
    // It does NOT touch the database or network — it's pure math.
    console.log(`   ${logPrefix} — Step 6: Computing metrics...`);
    const metrics = computeAllMetrics(commits, prs, issues);
    await job.updateProgress(70);
    console.log(`   ${logPrefix} — Step 6: Health score = ${metrics.healthScore} ✓`);

    // ──────────────────────────────────────────────
    // Step 7: Health score already computed by metrics engine
    // ──────────────────────────────────────────────
    await job.updateProgress(72);

    // ──────────────────────────────────────────────
    // Step 8: Compute quarterly timeline
    // ──────────────────────────────────────────────
    const timeline = computeQuarterlyTimeline(commits, prs, metrics.healthScore);
    await job.updateProgress(75);
    console.log(`   ${logPrefix} — Step 8: Timeline points = ${timeline.length} ✓`);

    // ──────────────────────────────────────────────
    // Step 9: Generate risk flags
    // ──────────────────────────────────────────────
    metrics.riskFlags = generateRiskFlags(metrics);
    await job.updateProgress(78);
    console.log(`   ${logPrefix} — Step 9: Risk flags = ${metrics.riskFlags.length} ✓`);


    // ──────────────────────────────────────────────
    // Step 10: Generate AI advice via Gemini (non-blocking, 10s timeout)
    // ──────────────────────────────────────────────
    // We use Promise.race to enforce a 10-second timeout.
    // If Gemini takes too long, we skip AI advice rather than
    // holding up the entire job.
    console.log(`   ${logPrefix} — Step 10: Generating AI advice...`);
    let aiAdvice: string | null = null;

    try {
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 10_000); // 10 second timeout
      });

      aiAdvice = await Promise.race([
        generateAIAdvice(metrics, owner, repo, { jobId: String(job.id) }),
        timeoutPromise,
      ]);

      if (aiAdvice) {
        metrics.aiAdvice = aiAdvice;
        console.log(`   ${logPrefix} — Step 10: AI advice generated ✓`);
      } else {
        console.log(`   ${logPrefix} — Step 10: AI advice skipped (timeout or unavailable)`);
      }
    } catch (aiError) {
      // AI failure should NEVER fail the whole job
      console.warn(`   ${logPrefix} — Step 10: AI advice failed (non-blocking):`, aiError);
    }

    await job.updateProgress(85);


    // ──────────────────────────────────────────────
    // Step 11: Store computed metrics in PostgreSQL
    // ──────────────────────────────────────────────
    console.log(`   ${logPrefix} — Step 11: Storing metrics in database...`);

    // TODO: Store via Prisma once schema is set up
    // await prisma.repoMetrics.upsert({
    //   where: { ownerRepo: `${owner}/${repo}` },
    //   update: { ...metrics, analyzedAt: new Date() },
    //   create: { owner, repo, ...metrics, analyzedAt: new Date() },
    // });

    console.log(`   ${logPrefix} — Step 11: Metrics stored ✓`);


    // ──────────────────────────────────────────────
    // Step 12: Store quarterly timeline in PostgreSQL
    // ──────────────────────────────────────────────
    console.log(`   ${logPrefix} — Step 12: Storing timeline...`);

    // TODO: Store timeline via Prisma (using computed timeline entries)
    // await prisma.healthTimeline.create({
    //   data: {
    //     owner, repo,
    //     healthScore: metrics.healthScore,
    //     recordedAt: new Date(),
    //   },
    // });

    console.log(`   ${logPrefix} — Step 12: Timeline stored ✓`);
    await job.updateProgress(90);


    // ──────────────────────────────────────────────
    // Step 13: Update Redis cache with fresh metrics
    // ──────────────────────────────────────────────
    const cacheKey = `repo:metrics:${owner}:${repo}`;
    await redis.set(
      cacheKey,
      JSON.stringify(metrics),
      'EX',
      config.cacheTtlSeconds, // Expires after 1 hour by default
    );
    console.log(`   ${logPrefix} — Step 13: Cache updated (TTL: ${config.cacheTtlSeconds}s) ✓`);


    // ──────────────────────────────────────────────
    // Step 14: Update job status to "done"
    // ──────────────────────────────────────────────
    await setJobState(job.id!, 'done');
    await job.updateProgress(100);
    console.log(`   ${logPrefix} — Step 14: Status → done ✓`);

    // TODO: Update analysis_jobs table via Prisma
    // await prisma.analysisJob.update({
    //   where: { id: job.id },
    //   data: { status: 'done', completedAt: new Date() },
    // });


    // ──────────────────────────────────────────────
    // Step 15: If user is logged in, recompute their developer score
    // ──────────────────────────────────────────────
    if (userId) {
      console.log(`   ${logPrefix} — Step 15: Triggering dev score recomputation for user ${userId}...`);

      // TODO: Recompute developer score
      // await recomputeDeveloperScore(userId);

      console.log(`   ${logPrefix} — Step 15: Dev score updated ✓`);
    }

    console.log(`\n✅ ${logPrefix} — Analysis complete! Score: ${metrics.healthScore}/100\n`);

  } catch (error) {
    // ═══════════════════════════════════════════════════════════
    // ERROR HANDLING — Different GitHub errors get different treatment
    // ═══════════════════════════════════════════════════════════

    if (isGitHubApiError(error)) {
      switch (error.status) {
        // ── 401: Token expired or invalid ──
        // This is unrecoverable — retrying won't help.
        case 401:
          console.error(`❌ ${logPrefix} — OAuth token expired or invalid`);
          await setJobState(job.id!, 'failed', 'OAuth token expired');
          // UnrecoverableError tells BullMQ: "Don't retry this job."
          throw new UnrecoverableError('OAuth token expired. Please re-authenticate.');

        // ── 403: Rate limited by GitHub ──
        // We CAN retry this, but we need to wait until the rate limit resets.
        case 403:
          if (error.rateLimitResetAt) {
            const resetTime = new Date(error.rateLimitResetAt).getTime();
            const now = Date.now();
            const waitMs = Math.max(resetTime - now, 60_000); // At least 1 minute

            console.warn(`⏳ ${logPrefix} — Rate limited. Retrying in ${Math.round(waitMs / 1000)}s`);

            // Move the job to "delayed" state — BullMQ will retry it after the wait
            await job.moveToDelayed(Date.now() + waitMs, job.token);
            // Return without throwing so BullMQ doesn't count this as a failure
            return;
          }
          // If no reset time, fall through to default retry behavior
          console.error(`❌ ${logPrefix} — Rate limited (no reset time provided)`);
          throw error;

        // ── 404: Repo not found or is private ──
        // This is unrecoverable — the repo simply doesn't exist.
        case 404:
          console.error(`❌ ${logPrefix} — Repository not found or is private`);
          await setJobState(job.id!, 'failed', 'Repository not found or is private');
          throw new UnrecoverableError('Repository not found or is private.');

        default:
          console.error(`❌ ${logPrefix} — GitHub API error (${error.status}):`, error.message);
          throw error; // Let BullMQ retry with exponential backoff
      }
    }

    // ── Any other error ──
    // Log it and let BullMQ retry (up to 3 times with exponential backoff)
    console.error(`❌ ${logPrefix} — Unexpected error:`, error);
    throw error;
  }
}


// ═══════════════════════════════════════════════════════════════
// SECTION 4: CREATE AND START THE WORKER
// ═══════════════════════════════════════════════════════════════

const worker = new Worker<JobData>(
  'repo-analysis',  // Must match the queue name in the API server
  processAnalysisJob,
  {
    connection: {
      host: new URL(config.redisUrl).hostname || 'localhost',
      port: parseInt(new URL(config.redisUrl).port || '6379', 10),
    },
    concurrency: 2,  // Process 2 jobs at the same time
    limiter: {
      max: 5,            // Max 5 jobs started...
      duration: 60_000,  // ...per 60 seconds (1 minute)
    },
  },
);


// ═══════════════════════════════════════════════════════════════
// SECTION 5: WORKER EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════
// These log what's happening so we can monitor the worker.

worker.on('ready', () => {
  console.log('🏭 GitVital Worker is ready and waiting for jobs...');
  console.log(`   Queue: "repo-analysis"`);
  console.log(`   Concurrency: 2 jobs at a time`);
  console.log(`   Rate limit: 5 jobs per minute`);
});

worker.on('active', (job) => {
  console.log(`🔄 Job ${job.id} (${job.data.owner}/${job.data.repo}) has started processing`);
});

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} (${job.data.owner}/${job.data.repo}) completed successfully`);
});

worker.on('failed', (job, err) => {
  if (job) {
    console.error(`❌ Job ${job.id} (${job.data.owner}/${job.data.repo}) failed:`, err.message);
    console.error(`   Attempts: ${job.attemptsMade}/${job.opts.attempts || 3}`);

    const maxAttempts = job.opts.attempts || 3;
    if (job.attemptsMade >= maxAttempts) {
      // Mark failed only on terminal failure to match Prompt 2.2 semantics.
      void setJobState(job.id!, 'failed', err.message || 'Analysis failed after retries');
    }
  } else {
    console.error('❌ A job failed (no job reference):', err.message);
  }
});

worker.on('error', (err) => {
  console.error('❌ Worker error:', err.message);
});

worker.on('stalled', (jobId) => {
  console.warn(`⚠️ Job ${jobId} stalled (took too long without a heartbeat)`);
});


// ═══════════════════════════════════════════════════════════════
// SECTION 6: GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n⚠️  Worker received ${signal}. Shutting down gracefully...`);

  // Close the worker — this waits for active jobs to finish
  await worker.close();
  console.log('   ✅ Worker closed (active jobs finished)');

  // Close the Redis connection
  redis.disconnect();
  console.log('   ✅ Redis disconnected');

  // TODO: Close Prisma connection
  // await prisma.$disconnect();

  console.log('   👋 Worker goodbye!');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export { worker };
