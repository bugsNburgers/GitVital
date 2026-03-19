// src/server/index.ts — The main Express API server
// This is the "entry point" — the file you run to start the backend.

// ═══════════════════════════════════════════════════════════════
// SECTION 1: IMPORTS
// ═══════════════════════════════════════════════════════════════
// Every package we installed in Prompt 0.4 gets imported here.

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import { rateLimit } from 'express-rate-limit';
import { body, param, query, validationResult } from 'express-validator';
import { Queue } from 'bullmq';
import { RedisStore } from 'connect-redis';

// Our own files
import { config } from '../config';
import { redis } from '../config/redis';
import { JobData, JobStatus, UserJobData } from '../types';
import { decryptAccessToken, encryptAccessToken } from '../security/tokenCrypto';

// ═══════════════════════════════════════════════════════════════
// SECTION 2: CREATE THE EXPRESS APP
// ═══════════════════════════════════════════════════════════════
// express() creates a new application instance.
// Think of it as building an empty restaurant — no tables, no menu yet.

const app = express();

if (config.session.secureCookies) {
  // Required behind reverse proxies so secure cookies are preserved.
  app.set('trust proxy', 1);
}

const OAUTH_TOKEN_TTL_SECONDS = Math.floor(config.session.ttlMs / 1000);
const REDACTED_VALUE = '[REDACTED]';
const DAILY_LIMIT_TTL_SECONDS = 60 * 60 * 24 + 60 * 60;
const MAX_PENDING_ANALYSES_PER_USER = 5;
const MAX_UNIQUE_REPOS_PER_USER_PER_DAY = 20;
const MAX_UNIQUE_REPOS_PER_IP_PER_DAY = 10;
const RAPID_FIRE_WINDOW_SECONDS = 60;
const RAPID_FIRE_ALERT_THRESHOLD = 8;
const SENSITIVE_RESPONSE_KEYS = new Set([
  'access_token',
  'accessToken',
  'token',
  'authorization',
  'client_secret',
  'clientSecret',
]);

function getTokenCacheKeyForUser(userId: number | string): string {
  return `oauth:github:token:user:${String(userId)}`;
}

async function storeEncryptedGitHubToken(userId: number | string, plainToken: string): Promise<void> {
  const encrypted = encryptAccessToken(plainToken, config.encryptionKey);
  await redis.set(getTokenCacheKeyForUser(userId), encrypted, 'EX', OAUTH_TOKEN_TTL_SECONDS);
}

async function getDecryptedGitHubToken(userId: number | string): Promise<string | null> {
  const encrypted = await redis.get(getTokenCacheKeyForUser(userId));
  if (!encrypted) {
    return null;
  }

  return decryptAccessToken(encrypted, config.encryptionKey);
}

async function removeGitHubToken(userId: number | string): Promise<void> {
  await redis.del(getTokenCacheKeyForUser(userId));
}

function redactSensitivePayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitivePayload(entry));
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const redacted: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(record)) {
      if (SENSITIVE_RESPONSE_KEYS.has(key)) {
        redacted[key] = REDACTED_VALUE;
      } else {
        redacted[key] = redactSensitivePayload(nested);
      }
    }

    return redacted;
  }

  return value;
}

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown-ip';
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: MIDDLEWARE (the "security checkpoints")
// ═══════════════════════════════════════════════════════════════
// Middleware runs on EVERY request, in the order we define it here.
// Think: every customer at the restaurant passes through the same door.

// 3a. Helmet — sets security headers automatically
// Protects against: XSS attacks, clickjacking, MIME sniffing, etc.
app.use(helmet());

// 3b. CORS — allow ONLY our frontend to talk to this API
// Without this, the browser would block all requests from localhost:3000
app.use(cors({
  origin: config.frontendUrl,   // Only allow requests from our Next.js frontend
  credentials: true,            // Allow cookies to be sent with requests (needed for sessions)
}));

// 3c. JSON body parser — tells Express to understand JSON in request bodies
// When the frontend sends { "url": "facebook/react" }, Express needs this to read it
app.use(express.json());

// Never leak tokens or secrets in API JSON responses.
app.use((req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);
  res.json = ((body?: unknown) => originalJson(redactSensitivePayload(body))) as typeof res.json;
  next();
});

// 3d. Session middleware — manages login sessions using Redis
// After a user logs in via GitHub, this creates a session stored in Redis
// and sends a cookie to the browser so the user stays logged in.
const sessionStore = new RedisStore({
  client: redis,    // Reuse our existing Redis connection
  prefix: 'sess:',  // All session keys in Redis will start with "sess:"
});

app.use(session({
  store: sessionStore,
  name: config.session.cookieName,
  secret: config.sessionSecret,
  resave: false,                   // Don't re-save session if nothing changed (performance)
  saveUninitialized: false,        // Don't create a session until the user actually logs in
  rolling: true,
  cookie: {
    secure: config.session.secureCookies,
    httpOnly: true,
    maxAge: config.session.ttlMs,
    sameSite: config.session.sameSite,
  },
}));

// 3e. Global and route-specific abuse protection rate limiters
const defaultLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down and try again shortly.' },
});

const analyzeAuthenticatedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: (req) => !(req.session as any)?.userId,
  keyGenerator: (req) => `auth-user:${String((req.session as any).userId)}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analysis requests for this account. Try again later.' },
});

const analyzeUnauthenticatedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  skip: (req) => Boolean((req.session as any)?.userId),
  keyGenerator: (req) => `anon-ip:${getClientIp(req)}`,
  standardHeaders: true,                      // Return rate limit info in headers
  legacyHeaders: false,                       // Disable old-style X-RateLimit headers
  message: { error: 'Too many unauthenticated analysis requests from this IP. Try again later.' },
});

const leaderboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Leaderboard rate limit exceeded. Try again shortly.' },
});

const badgeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Badge rate limit exceeded. Try again shortly.' },
});

app.use(defaultLimiter);

// ═══════════════════════════════════════════════════════════════
// SECTION 4: BULLMQ QUEUE SETUP
// ═══════════════════════════════════════════════════════════════
// Create a BullMQ queue named "repo-analysis".
// This is the "order ticket rail" — we add jobs here, workers pick them up.

const analysisQueue = new Queue<JobData>('repo-analysis', {
  connection: {
    host: new URL(config.redisUrl).hostname || 'localhost',
    port: parseInt(new URL(config.redisUrl).port || '6379', 10),
  },
});

const userAnalysisQueue = new Queue<UserJobData>('user-analysis', {
  connection: {
    host: new URL(config.redisUrl).hostname || 'localhost',
    port: parseInt(new URL(config.redisUrl).port || '6379', 10),
  },
});

// ═══════════════════════════════════════════════════════════════
// SECTION 5: HELPER — Validation Error Handler
// ═══════════════════════════════════════════════════════════════
// This helper checks if express-validator found any problems with the input.
// If there are errors, it sends a 400 Bad Request response immediately.

function handleValidationErrors(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  next();
}

const GITHUB_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
const STRICT_GITHUB_REPO_URL_REGEX = /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;
const MAX_GITHUB_NAME_LENGTH = 100;

function isValidGitHubNameSegment(input: string): boolean {
  if (!input || input.length > MAX_GITHUB_NAME_LENGTH) {
    return false;
  }

  if (input.includes('..')) {
    return false;
  }

  return GITHUB_NAME_REGEX.test(input);
}

function currentDayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDailyUniqueRepoKey(scope: 'user' | 'ip', id: string): string {
  return `abuse:unique-repos:${scope}:${id}:${currentDayBucket()}`;
}

function getRapidFireKey(ip: string): string {
  return `abuse:rapid-fire:${ip}:${Math.floor(Date.now() / 1000 / RAPID_FIRE_WINDOW_SECONDS)}`;
}

async function enforceDailyUniqueRepoLimit(
  scope: 'user' | 'ip',
  subjectId: string,
  normalizedRepo: string,
  maxUniqueReposPerDay: number,
): Promise<{ allowed: boolean; count: number }> {
  const key = getDailyUniqueRepoKey(scope, subjectId);
  const wasAdded = await redis.sadd(key, normalizedRepo);
  await redis.expire(key, DAILY_LIMIT_TTL_SECONDS);

  const count = await redis.scard(key);
  const allowed = count <= maxUniqueReposPerDay;

  if (!allowed && wasAdded === 1) {
    await redis.srem(key, normalizedRepo);
  }

  return { allowed, count };
}

async function trackRapidFireAndAlert(ip: string, normalizedRepo: string): Promise<void> {
  const rapidKey = getRapidFireKey(ip);
  const count = await redis.incr(rapidKey);
  if (count === 1) {
    await redis.expire(rapidKey, RAPID_FIRE_WINDOW_SECONDS);
  }

  if (count >= RAPID_FIRE_ALERT_THRESHOLD) {
    console.warn('[ALERT] Suspicious rapid-fire analyze requests detected', {
      ip,
      normalizedRepo,
      windowSeconds: RAPID_FIRE_WINDOW_SECONDS,
      requestCount: count,
    });
  }
}

async function countPendingJobsForUser(userId: string): Promise<number> {
  const jobs = await analysisQueue.getJobs(['waiting', 'delayed', 'active'], 0, 999);
  let pendingCount = 0;

  for (const job of jobs) {
    if (String((job.data as JobData)?.userId ?? '') === userId) {
      pendingCount += 1;
      if (pendingCount >= MAX_PENDING_ANALYSES_PER_USER) {
        return pendingCount;
      }
    }
  }

  return pendingCount;
}

function parseRepoInput(payload: { url?: string; owner?: string; repo?: string }): { owner: string; repo: string } | null {
  if (typeof payload.owner === 'string' && typeof payload.repo === 'string') {
    const owner = payload.owner.trim();
    const repo = payload.repo.trim();
    if (isValidGitHubNameSegment(owner) && isValidGitHubNameSegment(repo)) {
      return { owner, repo };
    }
  }

  if (typeof payload.url !== 'string') {
    return null;
  }

  const normalized = payload.url.trim().replace(/\/+$/, '');

  if (!STRICT_GITHUB_REPO_URL_REGEX.test(normalized)) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.hostname !== 'github.com') {
      return null;
    }

    if (parsed.search || parsed.hash) {
      return null;
    }

    const [owner, repo] = parsed.pathname.split('/').filter(Boolean);
    if (!owner || !repo || !isValidGitHubNameSegment(owner) || !isValidGitHubNameSegment(repo)) {
      return null;
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

function mapQueueStateToJobStatus(state: string): JobStatus {
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

// ═══════════════════════════════════════════════════════════════
// SECTION 6: ROUTES
// ═══════════════════════════════════════════════════════════════
// Each route is a "menu item" — a specific URL that the frontend can call.

// ─────────────────────────────────────────────────────────────
// 6a. POST /api/analyze — Start analyzing a GitHub repository
// ─────────────────────────────────────────────────────────────
// The frontend sends: { "owner": "facebook", "repo": "react" }
// This route validates the input, checks for duplicate jobs, and queues the work.

app.post(
  '/api/analyze',
  analyzeAuthenticatedLimiter,
  analyzeUnauthenticatedLimiter,
  [
    body('url').optional().isString().trim().matches(STRICT_GITHUB_REPO_URL_REGEX)
      .withMessage('url must match https://github.com/{owner}/{repo}'),
    body('owner').optional().isString().trim().isLength({ min: 1, max: MAX_GITHUB_NAME_LENGTH }).matches(GITHUB_NAME_REGEX),
    body('repo').optional().isString().trim().isLength({ min: 1, max: MAX_GITHUB_NAME_LENGTH }).matches(GITHUB_NAME_REGEX),
    body().custom((value) => {
      if (!parseRepoInput(value as { url?: string; owner?: string; repo?: string })) {
        throw new Error('Provide a valid GitHub repository URL or valid owner/repo values.');
      }
      return true;
    }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = parseRepoInput(req.body as { url?: string; owner?: string; repo?: string });
      if (!parsed) {
        res.status(400).json({ error: 'Invalid repository input' });
        return;
      }

      const owner = parsed.owner;
      const repo = parsed.repo;
      const normalizedOwner = owner.toLowerCase();
      const normalizedRepo = repo.toLowerCase();
      const normalizedRepoRef = `${normalizedOwner}/${normalizedRepo}`;
      const jobId = `analyze:${normalizedOwner}:${normalizedRepo}`;
      const userId = (req.session as any)?.userId as string | number | undefined;
      const requesterIp = getClientIp(req);

      await trackRapidFireAndAlert(requesterIp, normalizedRepoRef);

      if (userId !== undefined && userId !== null) {
        const pendingJobs = await countPendingJobsForUser(String(userId));
        if (pendingJobs >= MAX_PENDING_ANALYSES_PER_USER) {
          res.status(429).json({ error: 'Too many pending analyses' });
          return;
        }

        const userDaily = await enforceDailyUniqueRepoLimit(
          'user',
          String(userId),
          normalizedRepoRef,
          MAX_UNIQUE_REPOS_PER_USER_PER_DAY,
        );

        if (!userDaily.allowed) {
          console.warn('[ALERT] Daily unique repo limit exceeded for authenticated user', {
            userId: String(userId),
            ip: requesterIp,
            count: userDaily.count,
            maxAllowed: MAX_UNIQUE_REPOS_PER_USER_PER_DAY,
          });
          res.status(429).json({ error: 'Daily repository analysis limit reached for this account.' });
          return;
        }
      } else {
        const ipDaily = await enforceDailyUniqueRepoLimit(
          'ip',
          requesterIp,
          normalizedRepoRef,
          MAX_UNIQUE_REPOS_PER_IP_PER_DAY,
        );

        if (!ipDaily.allowed) {
          console.warn('[ALERT] Daily unique repo limit exceeded for unauthenticated IP', {
            ip: requesterIp,
            count: ipDaily.count,
            maxAllowed: MAX_UNIQUE_REPOS_PER_IP_PER_DAY,
          });
          res.status(429).json({ error: 'Daily repository analysis limit reached for this IP.' });
          return;
        }
      }

      // Idempotency: reuse in-flight job for the same repo.
      const existingJob = await analysisQueue.getJob(jobId);
      if (existingJob) {
        const existingState = await existingJob.getState();
        const existingStatus = mapQueueStateToJobStatus(existingState);
        if (existingStatus === 'queued' || existingStatus === 'processing') {
          res.status(200).json({ jobId: existingJob.id, status: existingStatus, deduplicated: true });
          return;
        }
      }

      // ── CREATE NEW JOB ──
      const job = await analysisQueue.add(
        'analyze-repo',                           // Job name (for logging/filtering)
        { owner, repo, userId: userId !== undefined && userId !== null ? String(userId) : undefined },  // Job data
        {
          jobId,
          attempts: 3,                            // Retry up to 3 times on failure
          backoff: { type: 'exponential', delay: 5000 }, // Wait longer between each retry
          removeOnComplete: { age: 3600 },       // Clean up completed jobs after 1 hour
          removeOnFail: { age: 86400 },          // Keep failed jobs for 24 hours (for debugging)
        },
      );

      await redis.set(`jobstatus:${job.id}`, 'queued', 'EX', 3600);

      res.status(202).json({ jobId: job.id, status: 'queued' });
    } catch (error) {
      console.error('Error queuing analysis job:', error);
      res.status(500).json({ error: 'Failed to queue analysis' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6b. GET /api/status/:jobId — Check the status of an analysis job
// ─────────────────────────────────────────────────────────────
// The frontend polls this every 3 seconds after submitting a job.
// Returns: { status: "queued" | "processing" | "done" | "failed", progress?, error? }

app.get(
  '/api/status/:jobId',
  [param('jobId').isString().trim().notEmpty()],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { jobId } = req.params;
      const job = await analysisQueue.getJob(jobId);

      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const state = await job.getState();
      const progress = job.progress;
      const status = mapQueueStateToJobStatus(state);

      res.json({
        jobId,
        status,
        progress,
        error: state === 'failed' ? job.failedReason : null,
      });
    } catch (error) {
      console.error('Error checking job status:', error);
      res.status(500).json({ error: 'Failed to check job status' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6c. GET /api/repo/:owner/:repo — Get latest metrics for a repository
// ─────────────────────────────────────────────────────────────
// Returns the full dashboard data: health score, bus factor, PR metrics,
// risk flags, AI advice, etc.

app.get(
  '/api/repo/:owner/:repo',
  [
    param('owner').isString().trim().notEmpty().matches(/^[a-zA-Z0-9_.-]+$/),
    param('repo').isString().trim().notEmpty().matches(/^[a-zA-Z0-9_.-]+$/),
  ],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;

      // Step 1: Check the Redis cache first (fast path)
      const cacheKey = `metrics:${owner}/${repo}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }

      // Step 2: If not cached, fetch from PostgreSQL via Prisma
      // TODO: Replace with actual Prisma query once the schema is set up
      // const metrics = await prisma.repoMetrics.findFirst({
      //   where: { owner, repo },
      //   orderBy: { analyzedAt: 'desc' },
      // });

      // For now, return a placeholder to indicate the route works
      res.status(404).json({
        error: 'No metrics found for this repository. Submit an analysis first.',
      });
    } catch (error) {
      console.error('Error fetching repo metrics:', error);
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6d. GET /api/compare — Compare multiple repositories side by side
// ─────────────────────────────────────────────────────────────
// Query: ?repos=owner1/repo1,owner2/repo2
// Returns: array of metrics for each repo

app.get(
  '/api/compare',
  [
    query('repos')
      .isString().trim().notEmpty()
      .withMessage('repos query parameter is required (comma-separated owner/repo pairs)'),
    query('repos').custom((value) => {
      if (typeof value !== 'string') {
        throw new Error('repos must be a string');
      }

      const allValid = value
        .split(',')
        .map((entry) => entry.trim())
        .every((entry) => /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/.test(entry));

      if (!allValid) {
        throw new Error('repos must be comma-separated owner/repo values');
      }
      return true;
    }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const reposParam = req.query.repos;
      if (typeof reposParam !== 'string') {
        res.status(400).json({ error: 'repos must be a single string' });
        return;
      }
      const repoPairs = reposParam.split(',').map((r) => {
        const [owner, repo] = r.trim().split('/');
        return { owner, repo };
      });

      // Validate each pair
      for (const pair of repoPairs) {
        if (!pair.owner || !pair.repo) {
          res.status(400).json({ error: `Invalid repo format: "${pair.owner}/${pair.repo}". Use owner/repo.` });
          return;
        }
      }

      // Fetch metrics for each repo from cache or DB
      const results = await Promise.all(
        repoPairs.map(async ({ owner, repo }) => {
          const cacheKey = `metrics:${owner}/${repo}`;
          const cached = await redis.get(cacheKey);
          if (cached) {
            return { owner, repo, metrics: JSON.parse(cached) };
          }
          // TODO: Fetch from Prisma when schema is set up
          return { owner, repo, metrics: null };
        }),
      );

      res.json({ comparisons: results });
    } catch (error) {
      console.error('Error comparing repos:', error);
      res.status(500).json({ error: 'Failed to compare repositories' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6e. POST /api/user/analyze — Queue a user-level contribution analysis
// ─────────────────────────────────────────────────────────────

app.post(
  '/api/user/analyze',
  [body('username').isString().trim().notEmpty().matches(/^[a-zA-Z0-9_-]+$/)],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const username = String(req.body.username).trim();
      const jobId = `analyze-user:${username.toLowerCase()}`;

      const existingJob = await userAnalysisQueue.getJob(jobId);
      if (existingJob) {
        const existingState = await existingJob.getState();
        const existingStatus = mapQueueStateToJobStatus(existingState);
        if (existingStatus === 'queued' || existingStatus === 'processing') {
          res.status(200).json({ jobId: existingJob.id, status: existingStatus, deduplicated: true });
          return;
        }
      }

      const job = await userAnalysisQueue.add(
        'analyzeUser',
        { username },
        {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        },
      );

      res.status(202).json({ jobId: job.id, status: 'queued' });
    } catch (error) {
      console.error('Error queuing user analysis job:', error);
      res.status(500).json({ error: 'Failed to queue user analysis' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6f. GET /api/user/:username — Get a developer's profile/score
// ─────────────────────────────────────────────────────────────
// Returns: developer score, badges, percentile ranking

app.get(
  '/api/user/:username',
  [param('username').isString().trim().notEmpty().matches(/^[a-zA-Z0-9_-]+$/)],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { username } = req.params;

      // TODO: Fetch from Prisma when user profile schema is set up
      // const profile = await prisma.developerProfile.findUnique({
      //   where: { githubUsername: username },
      // });

      res.status(404).json({
        error: `Developer profile for "${username}" not found. Analyze their repos first.`,
      });
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ error: 'Failed to fetch user profile' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6g. GET /api/leaderboard — Get top developers
// ─────────────────────────────────────────────────────────────
// Optional filter: ?lang=typescript (filter by primary language)
// Returns: top 100 developers sorted by their developer score

app.get(
  '/api/leaderboard',
  leaderboardLimiter,
  [query('lang').optional().isString().trim()],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const lang = req.query.lang as string | undefined;

      // TODO: Fetch precomputed leaderboard from Prisma
      // const leaderboard = await prisma.leaderboardEntry.findMany({
      //   where: lang ? { primaryLanguage: lang } : {},
      //   orderBy: { score: 'desc' },
      //   take: 100,
      // });

      res.json({ leaderboard: [], filter: lang || 'all' });
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6h. GET /badge/:owner/:repo — Generate an embeddable SVG badge
// ─────────────────────────────────────────────────────────────
// Returns an SVG image that can be embedded in a README.md:
// ![GitVital Score](https://gitvital.com/badge/facebook/react)

app.get(
  '/badge/:owner/:repo',
  badgeLimiter,
  [
    param('owner').isString().trim().notEmpty().matches(/^[a-zA-Z0-9_.-]+$/),
    param('repo').isString().trim().notEmpty().matches(/^[a-zA-Z0-9_.-]+$/),
  ],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;

      // TODO: Fetch actual score from DB
      const score = 0; // Placeholder
      const color = score >= 70 ? '#4caf50' : score >= 40 ? '#ff9800' : '#f44336';

      // Generate a simple SVG badge
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="160" height="28" role="img" aria-label="GitVital: ${score}">
          <title>GitVital: ${score}</title>
          <linearGradient id="s" x2="0" y2="100%">
            <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
            <stop offset="1" stop-opacity=".1"/>
          </linearGradient>
          <clipPath id="r"><rect width="160" height="28" rx="5" fill="#fff"/></clipPath>
          <g clip-path="url(#r)">
            <rect width="90" height="28" fill="#555"/>
            <rect x="90" width="70" height="28" fill="${color}"/>
            <rect width="160" height="28" fill="url(#s)"/>
          </g>
          <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
            <text x="45" y="19.5" fill="#010101" fill-opacity=".3">GitVital</text>
            <text x="45" y="18.5">GitVital</text>
            <text x="125" y="19.5" fill="#010101" fill-opacity=".3">${score}/100</text>
            <text x="125" y="18.5">${score}/100</text>
          </g>
        </svg>`;

      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache badge for 1 hour
      res.send(svg.trim());
    } catch (error) {
      console.error('Error generating badge:', error);
      res.status(500).json({ error: 'Failed to generate badge' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6i. GET /badge/user/:username — Generate a developer SVG badge
// ─────────────────────────────────────────────────────────────

app.get(
  '/badge/user/:username',
  badgeLimiter,
  [param('username').isString().trim().notEmpty().matches(/^[a-zA-Z0-9_-]+$/)],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { username } = req.params;

      // TODO: Fetch actual developer score from DB
      const score = 0; // Placeholder
      const color = score >= 70 ? '#4caf50' : score >= 40 ? '#ff9800' : '#f44336';

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="28" role="img" aria-label="Dev Score: ${score}">
          <title>${username} Dev Score: ${score}</title>
          <linearGradient id="s" x2="0" y2="100%">
            <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
            <stop offset="1" stop-opacity=".1"/>
          </linearGradient>
          <clipPath id="r"><rect width="200" height="28" rx="5" fill="#fff"/></clipPath>
          <g clip-path="url(#r)">
            <rect width="130" height="28" fill="#555"/>
            <rect x="130" width="70" height="28" fill="${color}"/>
            <rect width="200" height="28" fill="url(#s)"/>
          </g>
          <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
            <text x="65" y="19.5" fill="#010101" fill-opacity=".3">${username}</text>
            <text x="65" y="18.5">${username}</text>
            <text x="165" y="19.5" fill="#010101" fill-opacity=".3">${score}/100</text>
            <text x="165" y="18.5">${score}/100</text>
          </g>
        </svg>`;

      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(svg.trim());
    } catch (error) {
      console.error('Error generating user badge:', error);
      res.status(500).json({ error: 'Failed to generate user badge' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6j. GET /auth/github — Start GitHub OAuth login flow
// ─────────────────────────────────────────────────────────────
// Redirects the user to GitHub's authorization page

app.get('/auth/github', (_req: Request, res: Response) => {
  if (!config.github.clientId || !config.github.clientSecret) {
    res.status(500).json({ error: 'GitHub OAuth is not configured.' });
    return;
  }

  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    scope: 'read:user',  // We only need basic profile info
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});


// ─────────────────────────────────────────────────────────────
// 6k. GET /auth/github/callback — Handle GitHub OAuth callback
// ─────────────────────────────────────────────────────────────
// After the user approves on GitHub, GitHub redirects here with a ?code=
// We exchange that code for an access_token, create a session, and redirect.

app.get('/auth/github/callback', [query('code').isString().trim().notEmpty()], handleValidationErrors, async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    if (!config.github.clientId || !config.github.clientSecret) {
      res.status(500).json({ error: 'GitHub OAuth is not configured.' });
      return;
    }

    // Exchange the temporary code for a permanent access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
      }),
    });

    const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };

    if (tokenData.error || !tokenData.access_token) {
      res.status(401).json({ error: 'GitHub authentication failed' });
      return;
    }

    // Use the access token to get the user's GitHub profile
    const userResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userData = await userResponse.json() as { login: string; id: number; avatar_url: string; name: string };

    if (!userData || !userData.id || !userData.login) {
      res.status(401).json({ error: 'Unable to load GitHub user profile.' });
      return;
    }

    // Encrypt before persistence and avoid storing plain access tokens in session.
    await storeEncryptedGitHubToken(userData.id, tokenData.access_token);

    // Store user info in the session
    (req.session as any).userId = userData.id;
    (req.session as any).githubUsername = userData.login;

    // TODO: Upsert user in PostgreSQL via Prisma
    // await prisma.user.upsert({
    //   where: { githubId: userData.id },
    //   update: { accessToken: encryptAccessToken(tokenData.access_token, config.encryptionKey) },
    //   create: { githubId: userData.id, username: userData.login, ... },
    // });

    // Redirect back to the frontend
    res.redirect(config.frontendUrl);
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.post('/auth/logout', async (req: Request, res: Response): Promise<void> => {
  const userId = (req.session as any)?.userId as number | string | undefined;

  req.session.destroy(async (err) => {
    if (err) {
      console.error('Logout error:', err);
      res.status(500).json({ error: 'Logout failed' });
      return;
    }

    if (userId !== undefined && userId !== null) {
      await removeGitHubToken(userId);
    }

    res.clearCookie(config.session.cookieName, {
      httpOnly: true,
      secure: config.session.secureCookies,
      sameSite: config.session.sameSite,
    });

    res.status(200).json({ success: true });
  });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 7: HEALTH CHECK
// ═══════════════════════════════════════════════════════════════
// A simple endpoint that deployment platforms (Render, Railway) use
// to check if our server is alive and healthy.

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});


// ═══════════════════════════════════════════════════════════════
// SECTION 8: START SERVER + GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════

const server = app.listen(config.port, () => {
  console.log(`🚀 GitVital API server running on http://localhost:${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
});

// Graceful shutdown — when the server is stopped (Ctrl+C, deployment restart),
// we cleanly close all connections instead of abruptly dropping them.
// This prevents data corruption and lost jobs.

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n⚠️  Received ${signal}. Shutting down gracefully...`);

  // 1. Stop accepting new HTTP requests
  server.close(() => {
    console.log('   ✅ HTTP server closed');
  });

  // 2. Close the BullMQ queue connection
  await analysisQueue.close();
  console.log('   ✅ BullMQ queue closed');

  // 3. Close user-analysis queue connection
  await userAnalysisQueue.close();
  console.log('   ✅ User analysis queue closed');

  // 4. Close the Redis connection
  redis.disconnect();
  console.log('   ✅ Redis disconnected');

  // 5. Close Prisma (database) connection
  // TODO: Uncomment when Prisma is set up
  // await prisma.$disconnect();
  // console.log('   ✅ Prisma disconnected');

  console.log('   👋 Goodbye!');
  process.exit(0);
}

// Listen for shutdown signals from the OS / hosting platform
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Docker/Render/Railway stop

// Export the app for testing purposes
export { app, server };
export { getDecryptedGitHubToken };
