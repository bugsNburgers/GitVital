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
import { JobData, JobStatus } from '../types';

// ═══════════════════════════════════════════════════════════════
// SECTION 2: CREATE THE EXPRESS APP
// ═══════════════════════════════════════════════════════════════
// express() creates a new application instance.
// Think of it as building an empty restaurant — no tables, no menu yet.

const app = express();

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

// 3d. Session middleware — manages login sessions using Redis
// After a user logs in via GitHub, this creates a session stored in Redis
// and sends a cookie to the browser so the user stays logged in.
const sessionStore = new RedisStore({
  client: redis,    // Reuse our existing Redis connection
  prefix: 'sess:',  // All session keys in Redis will start with "sess:"
});

app.use(session({
  store: sessionStore,
  secret: config.sessionSecret,    // Used to encrypt the session cookie
  resave: false,                   // Don't re-save session if nothing changed (performance)
  saveUninitialized: false,        // Don't create a session until the user actually logs in
  cookie: {
    secure: config.nodeEnv === 'production', // HTTPS only in production
    httpOnly: true,                          // JavaScript can't read this cookie (prevents XSS)
    maxAge: 1000 * 60 * 60 * 24 * 7,       // Session lasts 7 days
    sameSite: 'lax',                         // Basic CSRF protection
  },
}));

// 3e. Rate limiter for the /api/analyze endpoint
// Prevents a single user from spamming repo analysis requests
const analyzeLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,       // 1-minute window
  max: config.rateLimit.maxRequests,          // Max 30 requests per minute
  standardHeaders: true,                      // Return rate limit info in headers
  legacyHeaders: false,                       // Disable old-style X-RateLimit headers
  message: { error: 'Too many requests, please try again later.' },
});

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
  analyzeLimiter,  // Rate limit this route specifically
  [
    // Validate that "owner" and "repo" are non-empty strings with only safe characters
    body('owner')
      .isString().trim().notEmpty()
      .matches(/^[a-zA-Z0-9_.-]+$/)
      .withMessage('owner must be a valid GitHub username'),
    body('repo')
      .isString().trim().notEmpty()
      .matches(/^[a-zA-Z0-9_.-]+$/)
      .withMessage('repo must be a valid GitHub repo name'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.body as { owner: string; repo: string };
      const jobKey = `job:${owner}/${repo}`;

      // ── IDEMPOTENCY CHECK ──
      // Before creating a new job, check if one already exists for this repo.
      // This prevents queue spam (e.g., user clicks "Analyze" 10 times).
      const existingJobId = await redis.get(jobKey);

      if (existingJobId) {
        // A job already exists — return the existing jobId instead of creating a duplicate
        const existingStatus = await redis.get(`jobstatus:${existingJobId}`);
        if (existingStatus === 'queued' || existingStatus === 'processing') {
          res.json({ jobId: existingJobId, status: existingStatus, deduplicated: true });
          return;
        }
        // If the old job is "done" or "failed", we allow re-analysis
      }

      // ── CREATE NEW JOB ──
      const job = await analysisQueue.add(
        'analyze-repo',                           // Job name (for logging/filtering)
        { owner, repo, userId: (req.session as any)?.userId },  // Job data
        {
          attempts: 3,                            // Retry up to 3 times on failure
          backoff: { type: 'exponential', delay: 5000 }, // Wait longer between each retry
          removeOnComplete: { age: 3600 },       // Clean up completed jobs after 1 hour
          removeOnFail: { age: 86400 },          // Keep failed jobs for 24 hours (for debugging)
        },
      );

      // Store the job mapping in Redis so we can do idempotency checks later
      await redis.set(jobKey, job.id!, 'EX', 3600); // Expires after 1 hour
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

      // Map BullMQ states to our simpler JobStatus type
      let status: JobStatus;
      switch (state) {
        case 'waiting':
        case 'delayed':
          status = 'queued';
          break;
        case 'active':
          status = 'processing';
          break;
        case 'completed':
          status = 'done';
          break;
        case 'failed':
          status = 'failed';
          break;
        default:
          status = 'queued';
      }

      res.json({
        jobId,
        status,
        progress,
        error: state === 'failed' ? job.failedReason : undefined,
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
// 6e. GET /api/user/:username — Get a developer's profile/score
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
// 6f. GET /api/leaderboard — Get top developers
// ─────────────────────────────────────────────────────────────
// Optional filter: ?lang=typescript (filter by primary language)
// Returns: top 100 developers sorted by their developer score

app.get(
  '/api/leaderboard',
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
// 6g. GET /badge/:owner/:repo — Generate an embeddable SVG badge
// ─────────────────────────────────────────────────────────────
// Returns an SVG image that can be embedded in a README.md:
// ![GitVital Score](https://gitvital.com/badge/facebook/react)

app.get(
  '/badge/:owner/:repo',
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
// 6h. GET /badge/user/:username — Generate a developer SVG badge
// ─────────────────────────────────────────────────────────────

app.get(
  '/badge/user/:username',
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
// 6i. GET /auth/github — Start GitHub OAuth login flow
// ─────────────────────────────────────────────────────────────
// Redirects the user to GitHub's authorization page

app.get('/auth/github', (_req: Request, res: Response) => {
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    scope: 'read:user',  // We only need basic profile info
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});


// ─────────────────────────────────────────────────────────────
// 6j. GET /auth/github/callback — Handle GitHub OAuth callback
// ─────────────────────────────────────────────────────────────
// After the user approves on GitHub, GitHub redirects here with a ?code=
// We exchange that code for an access_token, create a session, and redirect.

app.get('/auth/github/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing authorization code' });
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

    // Store user info in the session
    (req.session as any).userId = userData.id;
    (req.session as any).githubUsername = userData.login;
    (req.session as any).accessToken = tokenData.access_token;

    // TODO: Upsert user in PostgreSQL via Prisma
    // await prisma.user.upsert({
    //   where: { githubId: userData.id },
    //   update: { accessToken: tokenData.access_token },
    //   create: { githubId: userData.id, username: userData.login, ... },
    // });

    // Redirect back to the frontend
    res.redirect(config.frontendUrl);
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
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

  // 3. Close the Redis connection
  redis.disconnect();
  console.log('   ✅ Redis disconnected');

  // 4. Close Prisma (database) connection
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
