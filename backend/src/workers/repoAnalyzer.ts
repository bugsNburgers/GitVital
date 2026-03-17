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

// ═══════════════════════════════════════════════════════════════
// SECTION 1: STUB IMPORTS
// ═══════════════════════════════════════════════════════════════
// These modules will be built in later prompts.
// For now, we define placeholder functions so the worker's structure
// is complete and TypeScript doesn't complain.

// TODO: Replace with real GitHub GraphQL fetcher (Prompt 2.3)
async function fetchRepoMetadata(owner: string, repo: string, _token?: string): Promise<{ exists: boolean; isPrivate: boolean; stars: number; language: string | null }> {
  console.log(`   [STUB] fetchRepoMetadata(${owner}/${repo})`);
  return { exists: true, isPrivate: false, stars: 0, language: null };
}

async function fetchCommits(owner: string, repo: string, _token?: string): Promise<CommitNode[]> {
  console.log(`   [STUB] fetchCommits(${owner}/${repo})`);
  return [];
}

async function fetchPullRequests(owner: string, repo: string, _token?: string): Promise<PRNode[]> {
  console.log(`   [STUB] fetchPullRequests(${owner}/${repo})`);
  return [];
}

async function fetchIssues(owner: string, repo: string, _token?: string): Promise<IssueNode[]> {
  console.log(`   [STUB] fetchIssues(${owner}/${repo})`);
  return [];
}

// TODO: Replace with real Metrics Engine (Prompt 3.x)
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

// TODO: Replace with real Gemini AI advice generator (Prompt 4.x)
async function generateAIAdvice(_metrics: AllMetrics, _owner: string, _repo: string): Promise<string | null> {
  console.log('   [STUB] generateAIAdvice()');
  return null;
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
    await redis.set(`jobstatus:${job.id}`, 'processing', 'EX', 3600);
    await job.updateProgress(5);
    console.log(`   ${logPrefix} — Step 1: Status → processing`);

    // TODO: Update analysis_jobs table via Prisma
    // await prisma.analysisJob.update({
    //   where: { id: job.id },
    //   data: { status: 'processing', startedAt: new Date() },
    // });


    // ──────────────────────────────────────────────
    // Step 2: Validate repo exists and is public
    // ──────────────────────────────────────────────
    const metadata = await fetchRepoMetadata(owner, repo);
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
    const commits = await fetchCommits(owner, repo);
    await job.updateProgress(30);
    console.log(`   ${logPrefix} — Step 3: Fetched ${commits.length} commits ✓`);


    // ──────────────────────────────────────────────
    // Step 4: Fetch PRs (paginated, max 500, MERGED, last 12 months)
    // ──────────────────────────────────────────────
    console.log(`   ${logPrefix} — Step 4: Fetching pull requests...`);
    const prs = await fetchPullRequests(owner, repo);
    await job.updateProgress(50);
    console.log(`   ${logPrefix} — Step 4: Fetched ${prs.length} PRs ✓`);


    // ──────────────────────────────────────────────
    // Step 5: Fetch issues (paginated, max 500, OPEN)
    // ──────────────────────────────────────────────
    console.log(`   ${logPrefix} — Step 5: Fetching issues...`);
    const issues = await fetchIssues(owner, repo);
    await job.updateProgress(60);
    console.log(`   ${logPrefix} — Step 5: Fetched ${issues.length} issues ✓`);


    // ──────────────────────────────────────────────
    // Steps 6–9: Run Metrics Engine (pure functions, in-memory)
    // ──────────────────────────────────────────────
    // The Metrics Engine takes raw data and returns computed results.
    // It does NOT touch the database or network — it's pure math.
    console.log(`   ${logPrefix} — Steps 6-9: Computing metrics...`);
    const metrics = computeAllMetrics(commits, prs, issues);
    await job.updateProgress(75);
    console.log(`   ${logPrefix} — Steps 6-9: Health score = ${metrics.healthScore} ✓`);


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
        generateAIAdvice(metrics, owner, repo),
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

    // TODO: Store timeline via Prisma
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
    const cacheKey = `metrics:${owner}/${repo}`;
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
    await redis.set(`jobstatus:${job.id}`, 'done', 'EX', 3600);
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
          await redis.set(`jobstatus:${job.id}`, 'failed', 'EX', 3600);
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
          await redis.set(`jobstatus:${job.id}`, 'failed', 'EX', 3600);
          throw new UnrecoverableError('Repository not found or is private.');

        default:
          console.error(`❌ ${logPrefix} — GitHub API error (${error.status}):`, error.message);
          throw error; // Let BullMQ retry with exponential backoff
      }
    }

    // ── Any other error ──
    // Log it and let BullMQ retry (up to 3 times with exponential backoff)
    console.error(`❌ ${logPrefix} — Unexpected error:`, error);
    await redis.set(`jobstatus:${job.id}`, 'failed', 'EX', 3600);
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
