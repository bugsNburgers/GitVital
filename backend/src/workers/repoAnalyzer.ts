// src/workers/repoAnalyzer.ts — BullMQ Worker (SEPARATE PROCESS)
//
// This file is NOT imported by the API server.
// It runs independently: `npm run worker` starts this file.
// Think of it as a completely separate employee (the chef) who only
// communicates with the API server (the waiter) through the Redis queue.

import { Worker, Job, UnrecoverableError } from 'bullmq';
import { redis, getBullRedisConnection } from '../config/redis';
import { config } from '../config';
import { JobData, CommitNode, PRNode, IssueNode, AllMetrics, RepoMetadata, RiskFlag, TimelineEntry } from '../types';
import { generateAIAdvice, generateFallbackAdvice, type AdviceResult } from '../ai/advice';

// ── Real Metrics Engine imports (Prompt 8.1) ──
import { computeBusFactor } from '../metrics/busFactor';
import { computePRMetrics } from '../metrics/prMetrics';
import { computeActivityMetrics } from '../metrics/activityMetrics';
import { computeIssueMetrics } from '../metrics/issueMetrics';
import { computeChurnMetrics } from '../metrics/churnMetrics';
import { computeHealthScore } from '../metrics/healthScore';
import { generateRiskFlags as generatePromptRiskFlags } from '../metrics/riskFlags';
import { computeTimeline } from '../metrics/timeline';

// ═══════════════════════════════════════════════════════════════
// SECTION 1: IMPORTS — Real fetchers + remaining stubs
// ═══════════════════════════════════════════════════════════════

import { GitHubClient } from '../github/client';
import { fetchCommits as fetchCommitsFromGitHub } from '../github/fetchCommits';
import { fetchPRs as fetchPRsFromGitHub } from '../github/fetchPRs';
import { fetchIssues as fetchIssuesFromGitHub } from '../github/fetchIssues';
import { fetchMetadata as fetchRepoMetadata } from '../github/fetchMetadata';
import { setRepoMetricsCache } from '../cache/repoCache';
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

// ── Real Metrics Engine (Prompt 8.1 + 6.1 edge cases) ──
// Each metrics function is pure: no DB, no API, no side effects — just math.
// Prompt 6.1: This function now handles metadata-driven suppression and data integrity.
function computeAllMetrics(
  commits: CommitNode[],
  prs: PRNode[],
  issues: IssueNode[],
  metadata: RepoMetadata,
): AllMetrics {
  const riskFlags: RiskFlag[] = [];

  // ── Prompt 6.1: < 50 commits → suppress bus factor & velocity ──
  let busFactor = null;
  let activityMetrics = null;
  if (commits.length < 50) {
    riskFlags.push({
      level: 'info',
      title: 'LIMITED COMMIT HISTORY',
      detail: 'Not enough commit history for full analysis.',
    });
    // Still compute activity for commits_last_30_days, but suppress velocity
    activityMetrics = computeActivityMetrics(commits);
    // busFactor stays null (suppressed)
  } else {
    busFactor = computeBusFactor(commits);
    activityMetrics = computeActivityMetrics(commits);
  }

  // ── PR Metrics ──
  const prMetrics = computePRMetrics(prs);
  // Prompt 6.1: < 10 merged PRs → add info flag (prMetrics already returns null)
  if (prMetrics === null) {
    riskFlags.push({
      level: 'info',
      title: 'NO PR WORKFLOW',
      detail: 'This repo doesn\'t use a PR workflow.',
    });
  }

  // ── Issue & Churn Metrics — Prompt 8.2 ──
  const issueMetrics = computeIssueMetrics(issues);
  const churnMetrics = computeChurnMetrics(commits);

  // ── Prompt 6.1: Unusual commit patterns ──
  if (commits.length > 0) {
    // All commits in a single day → IRREGULAR COMMIT PATTERN
    const commitDates = new Set(commits.map((c) => c.committedDate.substring(0, 10)));
    if (commitDates.size === 1 && commits.length > 5) {
      riskFlags.push({
        level: 'warning',
        title: 'IRREGULAR COMMIT PATTERN',
        detail: `All ${commits.length} commits were made on a single day. This may indicate a code dump.`,
      });
    }

    // 100% merge commits → MERGE-ONLY HISTORY
    // Merge commits typically have 0 additions and 0 deletions
    const mergeCommits = commits.filter((c) => c.additions === 0 && c.deletions === 0);
    if (mergeCommits.length === commits.length && commits.length > 5) {
      riskFlags.push({
        level: 'warning',
        title: 'MERGE-ONLY HISTORY',
        detail: 'All commits appear to be merge commits. This may indicate unusual repository usage.',
      });
    }
  }

  // ── Prompt 6.1: > 50K commits → info flag ──
  if (metadata.totalCommitCount > 50000) {
    riskFlags.push({
      level: 'info',
      title: 'LARGE REPOSITORY',
      detail: `Analyzed last ${MAX_COMMITS} of ${metadata.totalCommitCount.toLocaleString()}+ commits`,
    });
  }

  // ── Prompt 6.1: Archived repo → banner flag ──
  if (metadata.isArchived) {
    riskFlags.push({
      level: 'warning',
      title: 'ARCHIVED REPOSITORY',
      detail: 'This repository is archived and no longer maintained.',
    });
  }

  // ── Prompt 6.1: Forked repo → warning flag ──
  if (metadata.isFork) {
    riskFlags.push({
      level: 'warning',
      title: 'FORKED REPOSITORY',
      detail: 'This is a fork. Metrics reflect fork activity only.',
    });
  }

  // ── Health Score (weighted composite, 0-100) ──
  const healthScore = computeHealthScore({
    activityMetrics,
    contributorMetrics: busFactor,
    prMetrics,
    issueMetrics,
    churnMetrics,
    isArchived: metadata.isArchived, // Prompt 6.1: cap at 30 for archived
  });

  return {
    busFactor,
    prMetrics,
    activityMetrics,
    issueMetrics,
    churnMetrics,
    healthScore,
    riskFlags,      // Pre-populated with 6.1 edge case flags
    aiAdvice: null,  // Populated in Step 10 by generateAIAdvice()
    aiAdviceModel: null,
  };
}

function computeQuarterlyTimeline(commits: CommitNode[], prs: PRNode[], healthScore: number): TimelineEntry[] {
  const timeline = computeTimeline(commits, prs);
  if (timeline.length === 0) {
    const now = new Date();
    const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
    return [{
      period: `${now.getUTCFullYear()}-Q${quarter}`,
      healthScore,
      commitCount: commits.length,
      prCount: prs.length,
    }];
  }

  return timeline.map((entry) => ({ ...entry, healthScore }));
}

function generateRiskFlags(metrics: AllMetrics): AllMetrics['riskFlags'] {
  const promptFlags = generatePromptRiskFlags(metrics);
  const merged = [...metrics.riskFlags];

  for (const flag of promptFlags) {
    const exists = merged.some((existing) => existing.level === flag.level && existing.title === flag.title);
    if (!exists) {
      merged.push(flag);
    }
  }

  return merged;
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

    // ── Prompt 6.1: No default branch → empty repo, early return ──
    if (!metadata.hasDefaultBranch) {
      console.log(`   ${logPrefix} — Step 2: Empty repo (no default branch)`);
      const emptyResult: AllMetrics = {
        busFactor: null, prMetrics: null, activityMetrics: null,
        issueMetrics: null, churnMetrics: null, healthScore: 0,
        riskFlags: [{ level: 'info', title: 'EMPTY REPOSITORY', detail: 'This repository has no commits.' }],
        aiAdvice: null,
        aiAdviceModel: null,
      };
      // Cache the empty result and mark job done
      await setRepoMetricsCache(owner, repo, emptyResult, config.cacheTtlSeconds);
      await setJobState(job.id!, 'done');
      await job.updateProgress(100);
      console.log(`   ${logPrefix} — Empty repo, analysis skipped ✓`);
      return;
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
    // Prompt 6.1: Partial failure — if PR fetch fails, continue with empty array
    let prs: PRNode[] = [];
    try {
      console.log(`   ${logPrefix} — Step 4: Fetching pull requests...`);
      prs = await fetchPRsFromGitHub(client, owner, repo, MAX_PRS);
      console.log(`   ${logPrefix} — Step 4: Fetched ${prs.length} PRs ✓`);
    } catch (prError) {
      console.warn(`   ${logPrefix} — Step 4: PR fetch failed (partial failure, proceeding):`, prError);
      // PR metrics will be null / "unavailable" — still save partial results
    }
    await job.updateProgress(50);


    // ──────────────────────────────────────────────
    // Step 5: Fetch issues (paginated, max 500, OPEN)
    // ──────────────────────────────────────────────
    // Prompt 6.1: Partial failure — if issue fetch fails, continue with empty array
    let issues: IssueNode[] = [];
    try {
      console.log(`   ${logPrefix} — Step 5: Fetching issues...`);
      issues = await fetchIssuesFromGitHub(client, owner, repo, MAX_ISSUES);
      console.log(`   ${logPrefix} — Step 5: Fetched ${issues.length} issues ✓`);
    } catch (issueError) {
      console.warn(`   ${logPrefix} — Step 5: Issue fetch failed (partial failure, proceeding):`, issueError);
      // Issue metrics will be null — still save partial results
    }
    await job.updateProgress(60);


    // ──────────────────────────────────────────────
    // Step 6: Run Metrics Engine (pure functions, in-memory)
    // ──────────────────────────────────────────────
    // Prompt 6.1: Wrap entire metrics computation in try/catch → on error, save partial results
    console.log(`   ${logPrefix} — Step 6: Computing metrics...`);
    let metrics: AllMetrics;
    try {
      metrics = computeAllMetrics(commits, prs, issues, metadata);

      // ── Prompt 6.1: Data integrity — scrub NaN/Infinity ──
      if (!Number.isFinite(metrics.healthScore)) {
        console.warn(`[Data Integrity] healthScore was ${metrics.healthScore}, replacing with 0`);
        metrics.healthScore = 0;
      }
      // Assert: 0 <= score <= 100
      if (metrics.healthScore < 0 || metrics.healthScore > 100) {
        console.warn(`[Data Integrity] healthScore ${metrics.healthScore} out of range, clamping`);
        metrics.healthScore = Math.max(0, Math.min(100, metrics.healthScore));
      }
      // Scrub sub-metrics for NaN/Infinity
      if (metrics.prMetrics) {
        for (const key of Object.keys(metrics.prMetrics) as Array<keyof typeof metrics.prMetrics>) {
          if (!Number.isFinite(metrics.prMetrics[key])) {
            console.warn(`[Data Integrity] prMetrics.${key} was ${metrics.prMetrics[key]}, setting prMetrics to null`);
            metrics.prMetrics = null;
            break;
          }
        }
      }
      if (metrics.activityMetrics) {
        if (!Number.isFinite(metrics.activityMetrics.velocityChange) ||
          !Number.isFinite(metrics.activityMetrics.commitsLast30Days)) {
          console.warn(`[Data Integrity] activityMetrics contains NaN/Infinity, setting to null`);
          metrics.activityMetrics = null;
        }
      }
    } catch (metricsError) {
      // Prompt 6.1: On metrics computation error, save partial results
      console.error(`   ${logPrefix} — Step 6: Metrics computation failed (saving partial):`, metricsError);
      metrics = {
        busFactor: null, prMetrics: null, activityMetrics: null,
        issueMetrics: null, churnMetrics: null, healthScore: 0,
        riskFlags: [{ level: 'danger', title: 'COMPUTATION ERROR', detail: 'Metrics computation failed. Partial results may be available.' }],
        aiAdvice: null,
        aiAdviceModel: null,
      };
    }
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
    let aiAdvice: AdviceResult | null = null;

    try {
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 25_000); // 25 second timeout
      });

      aiAdvice = await Promise.race([
        generateAIAdvice(metrics, owner, repo, { jobId: String(job.id) }),
        timeoutPromise,
      ]);

      if (!aiAdvice) {
        console.warn(`   ${logPrefix} — Step 10: AI timed out, applying rule-based fallback...`);
        aiAdvice = generateFallbackAdvice(metrics, owner, repo);
      }

      metrics.aiAdvice = aiAdvice.advice;
      metrics.aiAdviceSource = aiAdvice.source;
      metrics.aiAdviceModel = aiAdvice.source === 'gemini' ? aiAdvice.model ?? null : null;
      console.log(`   ${logPrefix} — Step 10: AI advice generated ✓ [source: ${aiAdvice.source}]`);
    } catch (aiError) {
      console.warn(`   ${logPrefix} — Step 10: AI advice failed (non-blocking), applying fallback:`, aiError);
      const fallback = generateFallbackAdvice(metrics, owner, repo);
      metrics.aiAdvice = fallback.advice;
      metrics.aiAdviceSource = fallback.source;
      metrics.aiAdviceModel = null;
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
    await setRepoMetricsCache(owner, repo, { ...metrics, metadata }, config.cacheTtlSeconds);
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
    connection: getBullRedisConnection(),
    concurrency: 2,           // Process 2 jobs at the same time
    lockDuration: 300_000,    // 5 minute lock (long-running jobs) — Prompt 7.1
    stalledInterval: 120_000, // Check for stalled jobs every 2 minutes — Prompt 7.1
    maxStalledCount: 2,       // Restart stalled jobs up to 2 times — Prompt 7.1
    limiter: {
      max: 5,            // Max 5 jobs started...
      duration: 60_000,  // ...per 60 seconds (1 minute)
    },
    // NOTE: Retry attempts (3x with exponential backoff) are set at enqueue time
    // in the API server (POST /api/analyze), not at the worker level.
    // BullMQ's default behavior + the 'failed' event handler handles terminal failures.
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
