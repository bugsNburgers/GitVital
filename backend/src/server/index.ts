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
import { Pool } from 'pg';

// Our own files
import { config } from '../config';
import { redis, getBullRedisConnection } from '../config/redis';
import { getLeaderboardWithLanguageFilter, type Queryable } from '../db';
import { getLeaderboardLastUpdated, getLeaderboardStats } from '../db/userQueries';
import { getFreshRepoMetricsCache, clearRepoMetricsCache } from '../cache/repoCache';
import {
  clearUserContributionCache,
  getFreshUserContributionCache,
  UserContributionMetricsCacheValue,
} from '../cache/userCache';
import { JobData, JobStatus, UserJobData } from '../types';
import { decryptAccessToken, encryptAccessToken } from '../security/tokenCrypto';
import { resetGeminiCooldown, getGeminiModelCandidates } from '../ai/advice';
import { generateUserInsights } from '../ai/userInsights';
import type { UserProfileData } from '../ai/userInsights';
import { generateIssueRecommendations } from '../ai/issueRecommender';
import type { RepoIssue, UserProfileSnippet } from '../ai/issueRecommender';
import { generateCompareInsights } from '../ai/compareInsights';
import type { RepoMetricsForCompare } from '../ai/compareInsights';
import { checkAndIncrementGlobalDailyQuota } from '../ai/globalQuotaGate';

// Analysis helpers + optional inline workers.
// Workers only boot inline when EMBED_WORKERS_IN_API=true.
import { runDirectRepoAnalysis } from '../workers/repoAnalyzer';
import '../workers/userAnalyzer';

// ═══════════════════════════════════════════════════════════════
// SECTION 2: CREATE THE EXPRESS APP
// ═══════════════════════════════════════════════════════════════
// express() creates a new application instance.
// Think of it as building an empty restaurant — no tables, no menu yet.

const app = express();

// Always trust the reverse proxy (Render, Railway, Nginx) so `req.secure` and `req.ip` are correct.
app.set('trust proxy', 1);

const OAUTH_TOKEN_TTL_SECONDS = Math.floor(config.session.ttlMs / 1000);
const REDACTED_VALUE = '[REDACTED]';
const DAILY_LIMIT_TTL_SECONDS = 60 * 60 * 24 + 60 * 60;
const MAX_PENDING_ANALYSES_PER_USER = 5;
const MAX_ANALYZE_REQUESTS_PER_WINDOW_AUTH = 20;
const MAX_ANALYZE_REQUESTS_PER_WINDOW_ANON = 10;
const MAX_UNIQUE_REPOS_PER_USER_PER_DAY = 20;
const MAX_UNIQUE_REPOS_PER_IP_PER_DAY = 10;
const MAX_GEMINI_ANALYSES_PER_USER_PER_DAY = 20;
const MAX_GEMINI_ANALYSES_PER_IP_PER_DAY = 10;
const RAPID_FIRE_WINDOW_SECONDS = 60;
const RAPID_FIRE_ALERT_THRESHOLD = 8;
const GITHUB_REST_BASE_URL = 'https://api.github.com';
const MAX_USER_PROFILE_REPOS = 9;
const SENSITIVE_RESPONSE_KEYS = new Set([
  'access_token',
  'accessToken',
  'token',
  'authorization',
  'client_secret',
  'clientSecret',
]);

const databaseUrl = process.env.DATABASE_URL?.trim() || null;
const databaseRequiresSsl = databaseUrl ? databaseUrl.includes('sslmode=require') : false;
const pgPool = databaseUrl
  ? new Pool({
    connectionString: databaseUrl,
    ssl: databaseRequiresSsl ? { rejectUnauthorized: false } : undefined,
  })
  : null;

const sqlDb: Queryable | null = pgPool
  ? {
    async query<T>(sql: string, params?: readonly unknown[]) {
      const queryResult = await pgPool.query(sql, params ? [...params] : []);
      return {
        rows: queryResult.rows as T[],
        rowCount: queryResult.rowCount ?? undefined,
      };
    },
  }
  : null;

function getTokenCacheKeyForUser(userId: number | string): string {
  return `oauth:github:token:user:${String(userId)}`;
}

async function storeEncryptedGitHubToken(userId: number | string, plainToken: string): Promise<void> {
  try {
    const encrypted = encryptAccessToken(plainToken, config.encryptionKey);
    await redis.set(getTokenCacheKeyForUser(userId), encrypted, 'EX', OAUTH_TOKEN_TTL_SECONDS);
  } catch (error) {
    console.warn('[Auth] Failed to cache encrypted GitHub token in Redis. Continuing without cached token.', {
      userId: String(userId),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function getDecryptedGitHubToken(userId: number | string): Promise<string | null> {
  try {
    const encrypted = await redis.get(getTokenCacheKeyForUser(userId));
    if (!encrypted) {
      return null;
    }

    return decryptAccessToken(encrypted, config.encryptionKey);
  } catch (error) {
    console.warn('[Auth] Failed to read/decrypt cached GitHub token from Redis. Falling back to service token.', {
      userId: String(userId),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function removeGitHubToken(userId: number | string): Promise<void> {
  try {
    await redis.del(getTokenCacheKeyForUser(userId));
  } catch (error) {
    console.warn('[Auth] Failed to delete cached GitHub token from Redis during logout.', {
      userId: String(userId),
      error: error instanceof Error ? error.message : String(error),
    });
  }
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

function normalizeUrlToOrigin(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isApiSubdomain(hostname: string): boolean {
  return hostname.startsWith('api.');
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

// OAuth redirects should only go to the web app, not API hosts.
const frontendRedirectOrigins: string[] = (() => {
  const candidates = [config.frontendUrl, ...config.corsOrigins];
  const unique = new Set<string>();

  for (const candidate of candidates) {
    const origin = normalizeUrlToOrigin(candidate);
    if (!origin) {
      continue;
    }

    const hostname = getHostname(origin);
    if (!hostname || isApiSubdomain(hostname)) {
      continue;
    }

    unique.add(origin);
  }

  return Array.from(unique);
})();

const frontendRedirectOriginSet = new Set(frontendRedirectOrigins);

const defaultFrontendRedirectOrigin: string = (() => {
  const configuredOrigin = normalizeUrlToOrigin(config.frontendUrl);
  if (configuredOrigin) {
    const configuredHost = getHostname(configuredOrigin);
    if (configuredHost && !isApiSubdomain(configuredHost)) {
      return configuredOrigin;
    }
  }

  const preferredNonLocal = frontendRedirectOrigins.find((origin) => {
    const hostname = getHostname(origin);
    return Boolean(hostname && !isLocalHostname(hostname));
  });

  if (preferredNonLocal) {
    return preferredNonLocal;
  }

  return frontendRedirectOrigins[0] || 'http://localhost:3000';
})();

function getSafeFrontendRedirectOrigin(value: string | undefined | null): string {
  const candidateOrigin = normalizeUrlToOrigin(value);
  if (!candidateOrigin) {
    return defaultFrontendRedirectOrigin;
  }

  if (frontendRedirectOriginSet.has(candidateOrigin)) {
    return candidateOrigin;
  }

  return defaultFrontendRedirectOrigin;
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
app.use(cors({
  origin: config.corsOrigins,   // Allow multiple origins (localhost, gitvital.com, etc)
  credentials: true,            // Allow cookies to be sent with requests
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

const sessionStore = new RedisStore({
  client: {
    get: async (key: string) => redis.get(key),
    set: async (key: string, val: string, opts?: { EX?: number, PX?: number }) => {
      if (opts?.EX) return redis.set(key, val, 'EX', opts.EX) as any;
      if (opts?.PX) return redis.set(key, val, 'PX', opts.PX) as any;
      return redis.set(key, val) as any;
    },
    del: async (key: string) => redis.del(key) as any,
    expire: async (key: string, seconds: number) => redis.expire(key, seconds) as any,
    pexpire: async (key: string, ms: number) => redis.pexpire(key, ms) as any,
  } as any,
  prefix: 'sess:',
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
    domain: config.session.cookieDomain,
  },
}));

// 3e. Global and route-specific abuse protection rate limiters
const defaultLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down and try again shortly.' },
});

const analyzeAuthenticatedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: MAX_ANALYZE_REQUESTS_PER_WINDOW_AUTH,
  skip: (req) => !(req.session as any)?.userId,
  keyGenerator: (req) => `auth-user:${String((req.session as any).userId)}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analysis requests for this account. Try again later.' },
});

const analyzeUnauthenticatedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: MAX_ANALYZE_REQUESTS_PER_WINDOW_ANON,
  skip: (req) => Boolean((req.session as any)?.userId),
  keyGenerator: (req) => `anon-ip:${getClientIp(req)}`,
  standardHeaders: true,                      // Return rate limit info in headers
  legacyHeaders: false,                       // Disable old-style X-RateLimit headers
  message: { error: 'Too many unauthenticated analysis requests from this IP. Please login to view more!.' },
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

const aiInsightsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => `ai-insights:${getClientIp(req)}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI insights rate limit exceeded. Please wait a minute before trying again.' },
});

const issueRecommendationsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => `issue-rec:${getClientIp(req)}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Issue recommendations rate limit exceeded. Please wait a minute.' },
});

const compareInsightsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => `compare-insights:${getClientIp(req)}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Compare insights rate limit exceeded. Please wait a minute before trying again.' },
});

app.use(defaultLimiter);

// ═══════════════════════════════════════════════════════════════
// SECTION 4: BULLMQ QUEUE SETUP
// ═══════════════════════════════════════════════════════════════
// Create a BullMQ queue named "repo-analysis".
// This is the "order ticket rail" — we add jobs here, workers pick them up.

const bullConnection = getBullRedisConnection();

const analysisQueue = new Queue<JobData>('repo-analysis', {
  connection: bullConnection,
});

const userAnalysisQueue = new Queue<UserJobData>('user-analysis', {
  connection: bullConnection,
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

// Defense-in-depth: escape user-controlled values before interpolating into SVG XML.
function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

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

function getDailyAnalysisCountKey(scope: 'user' | 'ip', id: string): string {
  return `abuse:analysis-count:${scope}:${id}:${currentDayBucket()}`;
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

async function incrementDailyAnalysisCount(scope: 'user' | 'ip', subjectId: string): Promise<number> {
  const key = getDailyAnalysisCountKey(scope, subjectId);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, DAILY_LIMIT_TTL_SECONDS);
  }
  return count;
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
  const normalizeRepoName = (value: string): string => {
    const trimmed = value.trim();
    return trimmed.toLowerCase().endsWith('.git') ? trimmed.slice(0, -4) : trimmed;
  };

  if (typeof payload.owner === 'string' && typeof payload.repo === 'string') {
    const owner = payload.owner.trim();
    const repo = normalizeRepoName(payload.repo);
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

    const [owner, repoRaw] = parsed.pathname.split('/').filter(Boolean);
    const repo = normalizeRepoName(repoRaw || '');
    if (!owner || !repo || !isValidGitHubNameSegment(owner) || !isValidGitHubNameSegment(repo)) {
      return null;
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

async function isQueueInfrastructureAvailable(): Promise<boolean> {
  try {
    const ping = await redis.ping();
    return ping === 'PONG';
  } catch {
    return false;
  }
}

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
  }

  return false;
}

function classifyAnalyzeFailure(error: unknown): { status: number; code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown analysis error');
  const normalized = message.toLowerCase();

  if (normalized.includes('no github access token available')) {
    return {
      status: 503,
      code: 'GITHUB_TOKEN_UNAVAILABLE',
      message: 'GitHub analysis token is unavailable while queue infrastructure is offline. Please retry shortly.',
    };
  }

  if (normalized.includes('rate limit')) {
    return {
      status: 429,
      code: 'GITHUB_RATE_LIMITED',
      message: 'GitHub API rate limit reached. Please retry in a few minutes.',
    };
  }

  if (normalized.includes('repository not found') || normalized.includes('is private')) {
    return {
      status: 404,
      code: 'REPO_NOT_FOUND',
      message: 'Repository not found or is private.',
    };
  }

  if (normalized.includes('oauth token expired') || normalized.includes('authentication expired')) {
    return {
      status: 401,
      code: 'GITHUB_AUTH_EXPIRED',
      message: 'GitHub authentication expired. Please sign in again.',
    };
  }

  return {
    status: 500,
    code: 'ANALYSIS_FALLBACK_FAILED',
    message: 'Failed to queue analysis and fallback analysis failed.',
  };
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

type UserBadgeTone = 'orange' | 'secondary' | 'emerald' | 'orange-light';

interface GitHubUserApiResponse {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  location: string | null;
  company: string | null;
  blog: string;
  twitter_username: string | null;
  followers: number;
  following: number;
  public_repos: number;
  html_url: string;
  created_at: string;
}

interface GitHubRepoApiResponse {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  private: boolean;
  html_url: string;
  fork: boolean;
}

interface UserProfileRepoResponse {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  updatedAt: string;
  healthScore: number | null;
  url: string;
}

interface UserProfileBadgeResponse {
  title: string;
  desc: string;
  level: string;
  icon: string;
  tone: UserBadgeTone;
}

interface UserProfileApiResponse {
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string | null;
  location: string | null;
  company: string | null;
  blog: string | null;
  twitterUsername: string | null;
  profileUrl: string;
  joinedAt: string;
  followers: number;
  following: number;
  publicRepos: number;
  topLanguage: string | null;
  developerScore: number;
  reliabilityPct: number;
  percentile: string;
  needsAnalysis: boolean;
  issuesOpened: number;
  issuesClosed: number;
  issuesOpen: number;
  contribution: {
    externalPRCount: number;
    externalMergedPRCount: number;
    contributionAcceptanceRate: number;
    analyzedAt: string | null;
  };
  badges: UserProfileBadgeResponse[];
  repos: UserProfileRepoResponse[];
  lastAnalyzedAt: string | null;
}

type LeaderboardTier = 'gold' | 'silver' | 'bronze' | 'other';

interface LeaderboardApiEntry {
  rank: number;
  name: string;
  handle: string;
  score: number;
  lang: string;
  repos: number;
  percentile: string;
  tier: LeaderboardTier;
  img: string;
}

function parseScore(value: string | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(2));
  }

  const parsed = Number.parseFloat(String(value ?? '0'));
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Number(parsed.toFixed(2));
}

function getTierFromRank(rank: number): LeaderboardTier {
  if (rank === 1) {
    return 'gold';
  }

  if (rank === 2) {
    return 'silver';
  }

  if (rank === 3) {
    return 'bronze';
  }

  return 'other';
}

function formatPercentileForLeaderboard(percentileRaw: string | null, score: number): string {
  const parsed = Number.parseFloat(String(percentileRaw ?? ''));
  if (!Number.isFinite(parsed)) {
    return computePercentileLabel(score).replace(' Global', '');
  }

  const topPercent = Math.max(0.1, Math.min(99.9, Number((100 - parsed).toFixed(1))));
  const display = Number.isInteger(topPercent) ? String(topPercent) : topPercent.toFixed(1);
  return `Top ${display}%`;
}

function getServiceGitHubToken(): string | null {
  return process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN || null;
}

async function getPreferredGitHubTokenForRequest(req: Request, username: string): Promise<string | null> {
  const sessionUserId = (req.session as any)?.userId as number | string | undefined;
  const sessionUsername = (req.session as any)?.githubUsername as string | undefined;

  if (sessionUserId !== undefined && sessionUserId !== null && typeof sessionUsername === 'string') {
    if (sessionUsername.toLowerCase() === username.toLowerCase()) {
      const personalToken = await getDecryptedGitHubToken(sessionUserId);
      if (personalToken) {
        return personalToken;
      }
    }
  }

  return getServiceGitHubToken();
}

async function buildGitHubRestHeaders(req: Request, username: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'GitVital/1.0',
  };

  const token = await getPreferredGitHubTokenForRequest(req, username);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function normalizeJobStatus(status: string | null): JobStatus | null {
  if (status === 'queued' || status === 'processing' || status === 'done' || status === 'failed') {
    return status;
  }
  return null;
}

function computeAverage(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function computePercentileLabel(score: number): string {
  if (score >= 95) return 'Top 1% Global';
  if (score >= 90) return 'Top 5% Global';
  if (score >= 80) return 'Top 10% Global';
  if (score >= 70) return 'Top 20% Global';
  if (score >= 60) return 'Top 35% Global';
  return 'Top 50% Global';
}

function computeDeveloperScore(
  repoScores: number[],
  contribution: UserContributionMetricsCacheValue | null,
  followers: number,
  publicRepos: number,
): number {
  const repoHealthScore = computeAverage(repoScores);
  const contributionScore = contribution
    ? Math.min(
      100,
      contribution.contributionAcceptanceRate * 0.4 + Math.min(contribution.externalPRCount, 80) * 0.75,
    )
    : 0;
  const socialScore = Math.min(
    100,
    (Math.log10(followers + publicRepos + 1) / Math.log10(1000)) * 100,
  );

  const weightedScore = repoScores.length > 0
    ? repoHealthScore * 0.7 + contributionScore * 0.2 + socialScore * 0.1
    : contributionScore > 0
      ? contributionScore * 0.75 + socialScore * 0.25
      : socialScore * 0.8;

  return Number(Math.max(0, Math.min(100, weightedScore)).toFixed(2));
}

function computeReliabilityPct(analyzedRepoCount: number, hasContributionData: boolean): number {
  const reliability = 55 + Math.min(analyzedRepoCount, 6) * 7 + (hasContributionData ? 12 : 0);
  return Math.max(45, Math.min(99, reliability));
}

function getTopLanguage(repos: GitHubRepoApiResponse[]): string | null {
  const languageCounts = new Map<string, number>();

  for (const repo of repos) {
    if (!repo.language) {
      continue;
    }
    languageCounts.set(repo.language, (languageCounts.get(repo.language) || 0) + 1);
  }

  let topLanguage: string | null = null;
  let topCount = 0;

  for (const [language, count] of languageCounts.entries()) {
    if (count > topCount) {
      topLanguage = language;
      topCount = count;
    }
  }

  return topLanguage;
}

function buildUserBadges(
  score: number,
  contribution: UserContributionMetricsCacheValue | null,
  repos: UserProfileRepoResponse[],
  followers: number,
  publicRepos: number,
): UserProfileBadgeResponse[] {
  const badges: UserProfileBadgeResponse[] = [];

  if (contribution && contribution.externalPRCount >= 50) {
    badges.push({
      title: 'Open Source Pillar',
      level: 'Legendary',
      icon: 'public',
      tone: 'orange',
      desc: `Merged ${contribution.externalPRCount}+ external PRs across public projects.`,
    });
  } else if (contribution && contribution.externalPRCount >= 10) {
    badges.push({
      title: 'External Contributor',
      level: 'Active',
      icon: 'handshake',
      tone: 'secondary',
      desc: `Contributed ${contribution.externalPRCount} merged PRs outside owned repositories.`,
    });
  }

  const highHealthRepoCount = repos.filter((repo) => repo.healthScore !== null && repo.healthScore >= 85).length;
  if (highHealthRepoCount >= 3) {
    badges.push({
      title: 'Healthy Maintainer',
      level: 'Elite',
      icon: 'verified',
      tone: 'emerald',
      desc: `${highHealthRepoCount} repositories are scoring in the high-health band.`,
    });
  }

  if (followers >= 100) {
    badges.push({
      title: 'Community Magnet',
      level: 'Popular',
      icon: 'groups',
      tone: 'orange-light',
      desc: `Built a GitHub audience of ${followers} followers.`,
    });
  }

  if (publicRepos >= 25) {
    badges.push({
      title: 'Prolific Builder',
      level: 'Veteran',
      icon: 'inventory_2',
      tone: 'secondary',
      desc: `Published ${publicRepos} public repositories.`,
    });
  }

  if (score >= 85) {
    badges.push({
      title: 'Quality Champion',
      level: 'Top Tier',
      icon: 'workspace_premium',
      tone: 'orange',
      desc: 'Maintains a consistently high composite developer score.',
    });
  }

  if (badges.length === 0) {
    badges.push({
      title: 'Emerging Maintainer',
      level: 'Rising',
      icon: 'rocket_launch',
      tone: 'secondary',
      desc: 'Run profile analysis to unlock deeper contribution insights.',
    });
  }

  return badges.slice(0, 4);
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
    const parsedForFallback = parseRepoInput(req.body as { url?: string; owner?: string; repo?: string });
    const fallbackOwner = parsedForFallback?.owner;
    const fallbackRepo = parsedForFallback?.repo;
    const fallbackUserId = (req.session as any)?.userId as string | number | undefined;

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
      const dedupeJobId = `analyze__${normalizedOwner}__${normalizedRepo}`;
      const forceReanalyze = parseBooleanFlag((req.body as { force?: unknown })?.force);
      const jobId = forceReanalyze
        ? `reanalyze__${normalizedOwner}__${normalizedRepo}__${Date.now()}__${Math.random().toString(36).slice(2, 8)}`
        : dedupeJobId;
      const userId = (req.session as any)?.userId as string | number | undefined;
      const requesterIp = getClientIp(req);
      const analysisScope = userId !== undefined && userId !== null
        ? {
          scope: 'user' as const,
          id: String(userId),
          geminiLimitPerDay: MAX_GEMINI_ANALYSES_PER_USER_PER_DAY,
        }
        : {
          scope: 'ip' as const,
          id: requesterIp,
          geminiLimitPerDay: MAX_GEMINI_ANALYSES_PER_IP_PER_DAY,
        };

      const queueInfraAvailable = await isQueueInfrastructureAvailable();
      if (!queueInfraAvailable) {
        console.warn('[Analyze Fallback] Redis/queue unavailable. Running direct synchronous analysis.', {
          owner,
          repo,
          requesterIp,
          authenticated: Boolean(userId),
        });

        try {
          const metrics = await runDirectRepoAnalysis({
            owner,
            repo,
            userId: userId !== undefined && userId !== null ? String(userId) : undefined,
            forceFallbackAdvice: false,
          });

          res.status(200).json({
            status: 'done',
            source: 'direct-fallback',
            fallbackReason: 'queue_unavailable',
            metrics,
          });
        } catch (directError) {
          const failure = classifyAnalyzeFailure(directError);
          res.status(failure.status).json({
            error: failure.message,
            code: failure.code,
            source: 'direct-fallback',
            fallbackReason: 'queue_unavailable',
          });
        }
        return;
      }

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

      // Prompt 8.6 + 11.6: Cache short-circuit unless caller explicitly forces a fresh run.
      if (!forceReanalyze) {
        const cachedMetrics = await getFreshRepoMetricsCache<unknown>(normalizedOwner, normalizedRepo);
        if (cachedMetrics) {
          res.status(200).json({
            status: 'done',
            source: 'cache',
            cached: true,
            cacheTtlSeconds: cachedMetrics.ttlSeconds,
            metrics: cachedMetrics.value,
          });
          return;
        }
      }

      // Prompt 8.6: Stale/missing cache path clears any old key before queueing.
      await clearRepoMetricsCache(normalizedOwner, normalizedRepo);

      // Idempotency (normal analyze): reuse an in-flight job for the same repo.
      // Force reanalyze explicitly skips dedupe so each click runs a fresh GitHub fetch.
      if (!forceReanalyze) {
        const existingJob = await analysisQueue.getJob(dedupeJobId);
        if (existingJob) {
          const existingState = await existingJob.getState();
          const existingStatus = mapQueueStateToJobStatus(existingState);
          if (existingStatus === 'queued' || existingStatus === 'processing') {
            res.status(200).json({ jobId: existingJob.id, status: existingStatus, deduplicated: true });
            return;
          }
          // Terminal state (failed/completed but not yet removed) — remove it so
          // BullMQ can create a fresh job with the same deterministic ID.
          try { await existingJob.remove(); } catch { /* ignore */ }
        }
      }

      // Soft daily AI cap: beyond threshold, continue analysis but force rule-based advice.
      // This counter is shared by analyze + reanalyze because both hit the same endpoint.
      const dailyAnalysisCount = await incrementDailyAnalysisCount(analysisScope.scope, analysisScope.id);
      const forceFallbackAdvice = dailyAnalysisCount > analysisScope.geminiLimitPerDay;
      if (forceFallbackAdvice) {
        console.warn('[AI][SOFT-LIMIT] Daily Gemini analysis cap exceeded, forcing fallback advice for this job.', {
          scope: analysisScope.scope,
          subjectId: analysisScope.id,
          dailyAnalysisCount,
          geminiLimitPerDay: analysisScope.geminiLimitPerDay,
          owner: normalizedOwner,
          repo: normalizedRepo,
          forceReanalyze,
        });
      }

      // ── CREATE NEW JOB ──
      let job;
      try {
        job = await analysisQueue.add(
          'analyze-repo',                           // Job name (for logging/filtering)
          {
            owner,
            repo,
            userId: userId !== undefined && userId !== null ? String(userId) : undefined,
            forceFallbackAdvice,
          },  // Job data
          {
            jobId,
            attempts: 3,                            // Retry up to 3 times on failure
            backoff: { type: 'exponential', delay: 5000 }, // Wait longer between each retry
            removeOnComplete: { age: 3600 },       // Clean up completed jobs after 1 hour
            removeOnFail: { age: 86400 },          // Keep failed jobs for 24 hours (for debugging)
          },
        );
      } catch (queueError) {
        console.warn('[Analyze Fallback] Queue add failed. Running direct synchronous analysis.', {
          owner,
          repo,
          error: queueError instanceof Error ? queueError.message : String(queueError),
        });

        try {
          const metrics = await runDirectRepoAnalysis({
            owner,
            repo,
            userId: userId !== undefined && userId !== null ? String(userId) : undefined,
            forceFallbackAdvice,
          });

          res.status(200).json({
            status: 'done',
            source: 'direct-fallback',
            fallbackReason: 'queue_add_failed',
            metrics,
          });
        } catch (directError) {
          const failure = classifyAnalyzeFailure(directError);
          res.status(failure.status).json({
            error: failure.message,
            code: failure.code,
            source: 'direct-fallback',
            fallbackReason: 'queue_add_failed',
          });
        }
        return;
      }

      if (!job.id) {
        res.status(500).json({ error: 'Failed to create analysis job. Please try again.' });
        return;
      }

      await redis.set(`jobstatus:${job.id}`, 'queued', 'EX', 3600);

      res.status(202).json({
        jobId: job.id,
        status: 'queued',
        forced: forceReanalyze,
        fallbackOnly: forceFallbackAdvice,
        dailyAnalysisCount,
      });
    } catch (error) {
      console.error('Error queuing analysis job:', error);
      if (fallbackOwner && fallbackRepo) {
        try {
          console.warn('[Analyze Fallback] Route-level failure. Attempting direct synchronous analysis.', {
            owner: fallbackOwner,
            repo: fallbackRepo,
            error: error instanceof Error ? error.message : String(error),
          });

          const metrics = await runDirectRepoAnalysis({
            owner: fallbackOwner,
            repo: fallbackRepo,
            userId: fallbackUserId !== undefined && fallbackUserId !== null ? String(fallbackUserId) : undefined,
            forceFallbackAdvice: false,
          });

          res.status(200).json({
            status: 'done',
            source: 'direct-fallback',
            fallbackReason: 'route_error',
            metrics,
          });
          return;
        } catch (fallbackError) {
          console.error('Direct fallback analysis failed:', fallbackError);
          const failure = classifyAnalyzeFailure(fallbackError);
          res.status(failure.status).json({
            error: failure.message,
            code: failure.code,
            source: 'direct-fallback',
            fallbackReason: 'route_error',
          });
          return;
        }
      }

      const failure = classifyAnalyzeFailure(error);
      res.status(failure.status).json({ error: failure.message, code: failure.code });
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
      const jobId = req.params.jobId as string;
      const job = await analysisQueue.getJob(jobId);

      if (!job) {
        const [cachedStatusRaw, cachedError] = await Promise.all([
          redis.get(`jobstatus:${jobId}`),
          redis.get(`joberror:${jobId}`),
        ]);

        const cachedStatus = normalizeJobStatus(cachedStatusRaw);
        if (cachedStatus) {
          res.json({
            jobId,
            status: cachedStatus,
            progress: cachedStatus === 'done' ? 100 : 0,
            error: cachedError || null,
          });
          return;
        }

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
      const owner = (req.params.owner as string).trim();
      const repoRaw = (req.params.repo as string).trim();
      const repo = repoRaw.toLowerCase().endsWith('.git') ? repoRaw.slice(0, -4) : repoRaw;

      if (!repo) {
        res.status(400).json({ error: 'Invalid repository name.' });
        return;
      }

      // Step 1: Check the Redis cache first (fast path)
      const cached = await getFreshRepoMetricsCache<unknown>(owner, repo);

      if (cached) {
        const payload = cached.value as Record<string, unknown>;
        const fetchedAt = (payload._fetchedAt as string | undefined) ?? null;
        const cachedAgeHours = fetchedAt
          ? Number(((Date.now() - new Date(fetchedAt).getTime()) / 3_600_000).toFixed(1))
          : null;
        res.json({
          ...payload,
          _meta: {
            source: 'redis_cache',
            fetchedAt,
            ttlSeconds: cached.ttlSeconds,
            cachedAgeHours,
          },
        });
        return;
      }

      // Step 2: If not in Redis, try NeonDB (most recent persisted metrics row)
      if (sqlDb) {
        try {
          const repoRow = await sqlDb.query<{ id: string }>(
            `SELECT id FROM repos WHERE LOWER(owner) = LOWER($1) AND LOWER(name) = LOWER($2) LIMIT 1`,
            [owner, repo],
          );
          if (repoRow.rows[0]) {
            const metricsRow = await sqlDb.query<{ metrics_json: unknown; analyzed_at: string }>(
              `SELECT metrics_json, analyzed_at FROM repo_metrics WHERE repo_id = $1 ORDER BY analyzed_at DESC LIMIT 1`,
              [repoRow.rows[0].id],
            );
            if (metricsRow.rows[0]?.metrics_json) {
              const dbMetrics = metricsRow.rows[0].metrics_json as Record<string, unknown>;
              const fetchedAt = metricsRow.rows[0].analyzed_at;
              const cachedAgeHours = Number(
                ((Date.now() - new Date(fetchedAt).getTime()) / 3_600_000).toFixed(1),
              );
              // Re-seed Redis for 1 hour so next request is fast
              try {
                const { setRepoMetricsCache } = await import('../cache/repoCache');
                await setRepoMetricsCache(owner, repo, dbMetrics, 3600, fetchedAt);
              } catch { /* non-fatal */ }
              res.json({
                ...dbMetrics,
                _meta: { source: 'db_fallback', fetchedAt, ttlSeconds: null, cachedAgeHours },
              });
              return;
            }
          }
        } catch (dbErr) {
          console.warn('[GET /api/repo] DB lookup failed (non-fatal):', dbErr);
        }
      }

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
          const cached = await getFreshRepoMetricsCache<unknown>(owner, repo);
          if (cached) {
            return { owner, repo, metrics: cached.value };
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
  [
    body('username').isString().trim().notEmpty().matches(/^[a-zA-Z0-9_-]+$/),
    body('force').optional().isBoolean().toBoolean(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const username = String(req.body.username).trim();
      const normalizedUsername = username.toLowerCase();
      const sessionUserId = (req.session as any)?.userId;
      const userIdForJob = sessionUserId !== undefined && sessionUserId !== null ? String(sessionUserId) : undefined;
      const forceReanalyze = parseBooleanFlag((req.body as { force?: unknown })?.force);

      if (!forceReanalyze) {
        const cached = await getFreshUserContributionCache<UserContributionMetricsCacheValue>(normalizedUsername);
        if (cached) {
          res.status(200).json({
            status: 'done',
            source: 'cache',
            cached: true,
            cacheTtlSeconds: cached.ttlSeconds,
            metrics: cached.value,
          });
          return;
        }
      } else {
        await clearUserContributionCache(normalizedUsername);
      }

      const dedupeJobId = `analyze-user__${normalizedUsername}`;
      const jobId = forceReanalyze
        ? `reanalyze-user__${normalizedUsername}__${Date.now()}__${Math.random().toString(36).slice(2, 8)}`
        : dedupeJobId;

      if (!forceReanalyze) {
        const existingJob = await userAnalysisQueue.getJob(dedupeJobId);
        if (existingJob) {
          const existingState = await existingJob.getState();
          const existingStatus = mapQueueStateToJobStatus(existingState);
          if (existingStatus === 'queued' || existingStatus === 'processing') {
            res.status(200).json({ jobId: existingJob.id, status: existingStatus, deduplicated: true });
            return;
          }

          try {
            await existingJob.remove();
          } catch {
            // Ignore race-condition cleanup failures.
          }
        }
      }

      const job = await userAnalysisQueue.add(
        'analyzeUser',
        { username, userId: userIdForJob },
        {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        },
      );

      if (!job.id) {
        res.status(500).json({ error: 'Failed to create user analysis job. Please try again.' });
        return;
      }

      await redis.set(`userjobstatus:${job.id}`, 'queued', 'EX', 3600);
      await redis.del(`userjoberror:${job.id}`);
      await redis.del(`userjobdebug:${job.id}`);

      res.status(202).json({ jobId: job.id, status: 'queued', forced: forceReanalyze });
    } catch (error) {
      console.error('Error queuing user analysis job:', error);
      res.status(500).json({ error: 'Failed to queue user analysis' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6f. GET /api/user/status/:jobId — Check user-analysis job status
// ─────────────────────────────────────────────────────────────

app.get(
  '/api/user/status/:jobId',
  [param('jobId').isString().trim().notEmpty()],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const jobId = req.params.jobId as string;
      const job = await userAnalysisQueue.getJob(jobId);

      if (job) {
        const state = await job.getState();
        const status = mapQueueStateToJobStatus(state);

        res.json({
          jobId,
          status,
          progress: job.progress,
          error: state === 'failed' ? job.failedReason : null,
        });
        return;
      }

      const [cachedStatusRaw, cachedError] = await Promise.all([
        redis.get(`userjobstatus:${jobId}`),
        redis.get(`userjoberror:${jobId}`),
      ]);

      const cachedStatus = normalizeJobStatus(cachedStatusRaw);
      if (cachedStatus) {
        res.json({
          jobId,
          status: cachedStatus,
          progress: cachedStatus === 'done' ? 100 : 0,
          error: cachedError || null,
        });
        return;
      }

      res.status(404).json({ error: 'User analysis job not found' });
    } catch (error) {
      console.error('Error checking user analysis job status:', error);
      res.status(500).json({ error: 'Failed to check user analysis job status' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6f-debug. GET /api/user/debug/:jobId — Temporary diagnostics for user-analysis jobs
// ─────────────────────────────────────────────────────────────

app.get(
  '/api/user/debug/:jobId',
  [param('jobId').isString().trim().notEmpty()],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const debugEnabled = process.env.ENABLE_USER_JOB_DEBUG === 'true' || config.nodeEnv !== 'production';
      if (!debugEnabled) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      const jobId = req.params.jobId as string;
      const [job, cachedStatusRaw, cachedError, cachedDebugRaw] = await Promise.all([
        userAnalysisQueue.getJob(jobId),
        redis.get(`userjobstatus:${jobId}`),
        redis.get(`userjoberror:${jobId}`),
        redis.get(`userjobdebug:${jobId}`),
      ]);

      const cachedStatus = normalizeJobStatus(cachedStatusRaw);
      let queueState: string | null = null;
      let progress: number | null = null;
      if (job) {
        queueState = await job.getState();
        progress = typeof job.progress === 'number' ? job.progress : null;
      }

      let debug: unknown = null;
      if (cachedDebugRaw) {
        try {
          debug = JSON.parse(cachedDebugRaw);
        } catch {
          debug = { raw: cachedDebugRaw, parseError: true };
        }
      }

      if (!job && !cachedStatus && !cachedError && !debug) {
        res.status(404).json({ error: 'User analysis job not found' });
        return;
      }

      res.json({
        jobId,
        status: cachedStatus ?? (queueState ? mapQueueStateToJobStatus(queueState) : null),
        queueState,
        progress,
        error: cachedError || null,
        debug,
      });
    } catch (error) {
      console.error('Error fetching user analysis debug payload:', error);
      res.status(500).json({ error: 'Failed to fetch user analysis debug payload' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6g. GET /api/user/:username — Get a developer's profile/score
// ─────────────────────────────────────────────────────────────
// Returns: developer score, badges, percentile ranking

app.get(
  '/api/user/:username',
  [param('username').isString().trim().notEmpty().matches(/^[a-zA-Z0-9_-]+$/)],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const username = req.params.username as string;
      const headers = await buildGitHubRestHeaders(req, username);

      const [userResponse, reposResponse, contributionCache] = await Promise.all([
        fetch(`${GITHUB_REST_BASE_URL}/users/${encodeURIComponent(username)}`, { headers }),
        fetch(
          `${GITHUB_REST_BASE_URL}/users/${encodeURIComponent(username)}/repos?type=owner&sort=updated&per_page=${MAX_USER_PROFILE_REPOS}`,
          { headers },
        ),
        getFreshUserContributionCache<UserContributionMetricsCacheValue>(username),
      ]);

      // Fetch user issue stats (opened + closed)
      let issuesOpened = 0;
      let issuesClosed = 0;
      try {
        const [openedRes, closedRes] = await Promise.all([
          fetch(`${GITHUB_REST_BASE_URL}/search/issues?q=author:${encodeURIComponent(username)}+type:issue&per_page=1`, { headers }),
          fetch(`${GITHUB_REST_BASE_URL}/search/issues?q=author:${encodeURIComponent(username)}+type:issue+is:closed&per_page=1`, { headers }),
        ]);
        if (openedRes.ok) {
          const data = await openedRes.json() as { total_count?: number };
          issuesOpened = data.total_count ?? 0;
        }
        if (closedRes.ok) {
          const data = await closedRes.json() as { total_count?: number };
          issuesClosed = data.total_count ?? 0;
        }
      } catch (e) {
        console.warn('[UserProfile] Failed to fetch issue stats:', e);
      }

      if (userResponse.status === 404) {
        res.status(404).json({ error: `GitHub user "${username}" was not found.` });
        return;
      }

      if (!userResponse.ok) {
        res.status(502).json({ error: `Failed to fetch GitHub profile (HTTP ${userResponse.status}).` });
        return;
      }

      const githubUser = await userResponse.json() as GitHubUserApiResponse;

      let githubRepos: GitHubRepoApiResponse[] = [];
      if (reposResponse.ok) {
        const reposPayload = await reposResponse.json() as unknown;
        if (Array.isArray(reposPayload)) {
          githubRepos = reposPayload.filter((entry) => {
            return Boolean(entry && typeof entry === 'object' && 'name' in entry && 'full_name' in entry);
          }) as GitHubRepoApiResponse[];
        }
      }

      const publicRepos = githubRepos
        .filter((repo) => !repo.private)
        .slice(0, MAX_USER_PROFILE_REPOS);

      const reposWithMetrics = await Promise.all(
        publicRepos.map(async (repo): Promise<UserProfileRepoResponse> => {
          const ownerFromFullName = repo.full_name.split('/')[0] || username;
          const cached = await getFreshRepoMetricsCache<{ healthScore?: unknown }>(ownerFromFullName, repo.name);
          const healthScore = cached && typeof cached.value?.healthScore === 'number'
            ? Number(cached.value.healthScore)
            : null;

          return {
            owner: ownerFromFullName,
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            language: repo.language,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            updatedAt: repo.updated_at,
            healthScore,
            url: repo.html_url,
          };
        }),
      );

      reposWithMetrics.sort((a, b) => {
        if (a.healthScore === null && b.healthScore !== null) return 1;
        if (a.healthScore !== null && b.healthScore === null) return -1;
        if (a.healthScore !== null && b.healthScore !== null) return b.healthScore - a.healthScore;
        return b.stars - a.stars;
      });

      const analyzedScores = reposWithMetrics
        .map((repo) => repo.healthScore)
        .filter((score): score is number => score !== null);

      const contribution = contributionCache?.value ?? null;
      const developerScore = computeDeveloperScore(
        analyzedScores,
        contribution,
        githubUser.followers,
        githubUser.public_repos,
      );

      if (sqlDb) {
        try {
          await sqlDb.query(
            `UPDATE users
             SET developer_score = $1,
                 updated_at = NOW()
             WHERE LOWER(username) = LOWER($2)`,
            [developerScore, githubUser.login],
          );
        } catch (scorePersistErr) {
          console.warn('[UserProfile] Failed to persist developer score snapshot:', scorePersistErr);
        }
      }

      const reliabilityPct = computeReliabilityPct(analyzedScores.length, Boolean(contribution));
      const badges = buildUserBadges(
        developerScore,
        contribution,
        reposWithMetrics,
        githubUser.followers,
        githubUser.public_repos,
      );

      let percentileLabel = computePercentileLabel(developerScore);
      if (sqlDb) {
        try {
          const snapshot = await sqlDb.query<{ percentile_raw: string | null }>(
            `WITH scored_users AS (
               SELECT developer_score
               FROM users
               WHERE developer_score > 0
             )
             SELECT
               CASE
                 WHEN COUNT(*) = 0 THEN NULL
                 WHEN COUNT(*) = 1 THEN '100'
                 ELSE (((SUM(CASE WHEN developer_score <= $1 THEN 1 ELSE 0 END)::numeric - 1) / (COUNT(*) - 1)::numeric) * 100)::text
               END AS percentile_raw
             FROM scored_users`,
            [developerScore],
          );

          if (snapshot.rows.length > 0 && snapshot.rows[0].percentile_raw !== null) {
            percentileLabel = `${formatPercentileForLeaderboard(snapshot.rows[0].percentile_raw, developerScore)} Global`;
          }
        } catch (dbErr) {
          console.warn('[UserProfile] Failed to load DB percentile snapshot:', dbErr);
        }
      }

      const profile: UserProfileApiResponse = {
        username: githubUser.login,
        displayName: githubUser.name || githubUser.login,
        avatarUrl: githubUser.avatar_url,
        bio: githubUser.bio,
        location: githubUser.location,
        company: githubUser.company,
        blog: githubUser.blog || null,
        twitterUsername: githubUser.twitter_username,
        profileUrl: githubUser.html_url,
        joinedAt: githubUser.created_at,
        followers: githubUser.followers,
        following: githubUser.following,
        publicRepos: githubUser.public_repos,
        topLanguage: getTopLanguage(publicRepos),
        developerScore,
        reliabilityPct,
        percentile: percentileLabel,
        needsAnalysis: !contribution,
        issuesOpened,
        issuesClosed,
        issuesOpen: Math.max(0, issuesOpened - issuesClosed),
        contribution: {
          externalPRCount: contribution?.externalPRCount ?? 0,
          externalMergedPRCount: contribution?.externalMergedPRCount ?? 0,
          contributionAcceptanceRate: contribution?.contributionAcceptanceRate ?? 0,
          analyzedAt: contribution?.analyzedAt ?? null,
        },
        badges,
        repos: reposWithMetrics,
        lastAnalyzedAt: contribution?.analyzedAt ?? null,
      };

      res.json(profile);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ error: 'Failed to fetch user profile' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6h. POST /api/user/:username/ai-insights — Gemini profile analysis
// ─────────────────────────────────────────────────────────────
// Returns AI-generated summary, strengths, areas for growth,
// contribution style, and recommended focus areas. Cached 24h.

app.post(
  '/api/user/:username/ai-insights',
  aiInsightsLimiter,
  [param('username').isString().trim().notEmpty().matches(/^[a-zA-Z0-9_-]+$/)],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const username = req.params.username as string;

      // Quota gate — global + per-user daily cap
      const loggedInUser = (req as Request & { user?: { githubUsername?: string } }).user?.githubUsername || username;
      const quota = await checkAndIncrementGlobalDailyQuota(loggedInUser);
      if (!quota.allowed) {
        res.status(429).json({
          error: 'Daily AI limit reached. Come back tomorrow.',
          code: 'QUOTA_EXCEEDED',
          resetAt: quota.resetAt,
          limitHit: quota.limitHit,
        });
        return;
      }

      const headers = await buildGitHubRestHeaders(req, username);

      // Fetch GitHub user + repos + contribution cache in parallel
      const [userResponse, reposResponse, contributionCache] = await Promise.all([
        fetch(`${GITHUB_REST_BASE_URL}/users/${encodeURIComponent(username)}`, { headers }),
        fetch(
          `${GITHUB_REST_BASE_URL}/users/${encodeURIComponent(username)}/repos?type=owner&sort=updated&per_page=${MAX_USER_PROFILE_REPOS}`,
          { headers },
        ),
        getFreshUserContributionCache<UserContributionMetricsCacheValue>(username),
      ]);

      if (userResponse.status === 404) {
        res.status(404).json({ error: `GitHub user "${username}" was not found.` });
        return;
      }

      if (!userResponse.ok) {
        res.status(502).json({ error: `Failed to fetch GitHub profile (HTTP ${userResponse.status}).` });
        return;
      }

      const githubUser = await userResponse.json() as GitHubUserApiResponse;

      let githubRepos: GitHubRepoApiResponse[] = [];
      if (reposResponse.ok) {
        const reposPayload = await reposResponse.json() as unknown;
        if (Array.isArray(reposPayload)) {
          githubRepos = reposPayload.filter((entry) =>
            Boolean(entry && typeof entry === 'object' && 'name' in entry && 'full_name' in entry),
          ) as GitHubRepoApiResponse[];
        }
      }

      const publicRepos = githubRepos
        .filter((repo) => !repo.private)
        .slice(0, MAX_USER_PROFILE_REPOS);

      // Pull health scores from cache for each repo
      const repoHealthScores: number[] = [];
      const repoNames: string[] = [];
      const repoLanguages: (string | null)[] = [];

      await Promise.all(
        publicRepos.map(async (repo) => {
          repoNames.push(repo.name);
          repoLanguages.push(repo.language);
          const ownerFromFullName = repo.full_name.split('/')[0] || username;
          const cached = await getFreshRepoMetricsCache<{ healthScore?: unknown }>(ownerFromFullName, repo.name);
          if (cached && typeof cached.value?.healthScore === 'number') {
            repoHealthScores.push(Number(cached.value.healthScore));
          }
        }),
      );

      const contribution = contributionCache?.value ?? null;

      const profileData: UserProfileData = {
        username: githubUser.login,
        publicRepos: githubUser.public_repos,
        followers: githubUser.followers,
        following: githubUser.following,
        topLanguage: getTopLanguage(publicRepos),
        externalPRCount: contribution?.externalPRCount ?? 0,
        externalMergedPRCount: contribution?.externalMergedPRCount ?? 0,
        contributionAcceptanceRate: contribution?.contributionAcceptanceRate ?? 0,
        issuesOpened: 0, // Not fetched again here — use cached value if available
        issuesClosed: 0,
        repoHealthScores,
        repoNames,
        repoLanguages,
      };

      const insights = await generateUserInsights(profileData);

      res.json(insights);
    } catch (error) {
      console.error('[AI][UserInsights] Error generating user insights:', error);
      res.status(500).json({ error: 'Failed to generate AI profile insights' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6j. GET /api/repo/:owner/:repo/recommendations — AI issue recommendations
// ─────────────────────────────────────────────────────────────
// Query: ?username=octocat  (optional — omit for label-only fallback)
// Fetches open issues from GitHub REST API, then calls Gemini to match
// them to the developer's skill profile.

app.get(
  '/api/repo/:owner/:repo/recommendations',
  issueRecommendationsLimiter,
  [
    param('owner').isString().trim().notEmpty().matches(/^[a-zA-Z0-9_.-]+$/),
    param('repo').isString().trim().notEmpty().matches(/^[a-zA-Z0-9_.-]+$/),
    query('username').optional().isString().trim().matches(/^[a-zA-Z0-9_-]+$/),
  ],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const owner = req.params.owner as string;
      const repo = req.params.repo as string;
      const username = (req.query.username as string | undefined)?.trim() || '';
      const forceRefresh = req.query.refresh === 'true';

      // Auth guard — must be logged in to get personalized recommendations
      const sessionUserId = (req.session as any)?.userId as number | string | undefined;
      const sessionUsername = (req.session as any)?.githubUsername as string | undefined;
      if (!sessionUserId || !sessionUsername) {
        res.status(401).json({ error: 'Login required to get personalized issue recommendations.', code: 'LOGIN_REQUIRED' });
        return;
      }
      const authedUsername = sessionUsername;

      // Quota gate
      const quota = await checkAndIncrementGlobalDailyQuota(authedUsername);
      if (!quota.allowed) {
        res.status(429).json({
          error: 'Daily AI limit reached. Come back tomorrow.',
          code: 'QUOTA_EXCEEDED',
          resetAt: quota.resetAt,
          limitHit: quota.limitHit,
        });
        return;
      }

      // 1. Check repo metrics cache — repo must have been analyzed first.
      const cached = await getFreshRepoMetricsCache<{
        issueMetrics?: { labelBreakdown?: { label: string; count: number; githubFilterUrl: string }[] } | null;
      }>(owner, repo);

      if (!cached) {
        res.status(404).json({
          error: 'No metrics found for this repository. Analyze it first before requesting recommendations.',
        });
        return;
      }

      // 2. Fetch open issues from GitHub REST API (labels + pagination, max 100).
      const headers = await buildGitHubRestHeaders(req, username || owner);
      const issuesRes = await fetch(
        `${GITHUB_REST_BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=open&per_page=100&sort=created&direction=desc`,
        { headers },
      );

      let repoIssues: RepoIssue[] = [];

      if (issuesRes.ok) {
        const rawIssues = await issuesRes.json() as unknown[];
        if (Array.isArray(rawIssues)) {
          repoIssues = rawIssues
            .filter((i): i is Record<string, unknown> =>
              Boolean(i && typeof i === 'object' && 'title' in (i as object) && !('pull_request' in (i as object))),
            )
            .map((i) => ({
              title: String((i as Record<string, unknown>).title ?? ''),
              labels: Array.isArray((i as Record<string, unknown>).labels)
                ? ((i as Record<string, unknown>).labels as Record<string, unknown>[]).map((l) => String(l.name ?? '')).filter(Boolean)
                : [],
              url: String((i as Record<string, unknown>).html_url ?? ''),
              createdAt: String((i as Record<string, unknown>).created_at ?? new Date().toISOString()),
              commentsCount: Number((i as Record<string, unknown>).comments ?? 0),
            }))
            .filter((i) => Boolean(i.title));
        }
      } else {
        console.warn(`[Recommendations] GitHub issues fetch failed (HTTP ${issuesRes.status}) for ${owner}/${repo}`);
      }

      // 3. If no issues found, return empty result early.
      if (repoIssues.length === 0) {
        res.json({ recommendations: [], source: 'rule-based', message: 'No open issues found for this repository.' });
        return;
      }

      // 4. Build user profile snippet (fetch from GitHub if username provided).
      const effectiveUsername = username || authedUsername;
      let userProfile: UserProfileSnippet = {
        username: effectiveUsername,
        topLanguage: null,
        externalPRCount: 0,
        externalMergedPRCount: 0,
        contributionAcceptanceRate: 0,
        followers: 0,
        issuesOpened: 0,
        repoLanguages: [],
        repoNames: [],
      };

      if (effectiveUsername) {
        try {
          const userHeaders = await buildGitHubRestHeaders(req, effectiveUsername);
          const [ghUserRes, ghReposRes, contribCache] = await Promise.all([
            fetch(`${GITHUB_REST_BASE_URL}/users/${encodeURIComponent(effectiveUsername)}`, { headers: userHeaders }),
            fetch(`${GITHUB_REST_BASE_URL}/users/${encodeURIComponent(effectiveUsername)}/repos?type=owner&sort=updated&per_page=${MAX_USER_PROFILE_REPOS}`, { headers: userHeaders }),
            getFreshUserContributionCache<UserContributionMetricsCacheValue>(effectiveUsername),
          ]);

          if (ghUserRes.ok) {
            const ghUserData = await ghUserRes.json() as GitHubUserApiResponse;
            let repoLanguages: (string | null)[] = [];
            let repoNames: string[] = [];

            if (ghReposRes.ok) {
              const rawRepos = await ghReposRes.json() as unknown[];
              if (Array.isArray(rawRepos)) {
                const repos = rawRepos.filter(
                  (r): r is GitHubRepoApiResponse =>
                    Boolean(r && typeof r === 'object' && 'name' in (r as object)),
                ) as GitHubRepoApiResponse[];
                repoLanguages = repos.map((r) => r.language);
                repoNames = repos.map((r) => r.name);
              }
            }

            userProfile = {
              username: ghUserData.login,
              topLanguage: getTopLanguage(
                (await ghReposRes.clone().json().catch(() => [])) as GitHubRepoApiResponse[],
              ),
              externalPRCount: contribCache?.value?.externalPRCount ?? 0,
              externalMergedPRCount: contribCache?.value?.externalMergedPRCount ?? 0,
              contributionAcceptanceRate: contribCache?.value?.contributionAcceptanceRate ?? 0,
              followers: ghUserData.followers ?? 0,
              issuesOpened: 0, // not critical for matching; keep 0 to avoid extra API call
              repoLanguages,
              repoNames,
            };
          }
        } catch (profileErr) {
          console.warn('[Recommendations] Failed to fetch user profile for recommendations:', profileErr);
          // Continue with anonymous profile — will use rule-based fallback
        }
      }

      // 5. Generate recommendations (pass forceRefresh for fresh batch).
      const result = await generateIssueRecommendations(userProfile, repoIssues, owner, repo, forceRefresh);

      res.json(result);
    } catch (error) {
      console.error('[Recommendations] Error generating issue recommendations:', error);
      res.status(500).json({ error: 'Failed to generate issue recommendations' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6k. POST /api/compare/insights — AI-powered repo comparison
// ─────────────────────────────────────────────────────────────
// Body: { repos: string[] }  (2–4 "owner/repo" strings)
// Looks up each repo from Redis cache, passes metrics to Gemini.

app.post(
  '/api/compare/insights',
  compareInsightsLimiter,
  [body('repos').isArray({ min: 2, max: 4 }).withMessage('repos must be an array of 2-4 repo strings')],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawRepos = req.body.repos as unknown[];

      // Auth guard — must be logged in for AI comparison
      const sessionUserId = (req.session as any)?.userId as number | string | undefined;
      const sessionUsername = (req.session as any)?.githubUsername as string | undefined;
      if (!sessionUserId || !sessionUsername) {
        res.status(401).json({ error: 'Login required to generate AI comparison insights.', code: 'LOGIN_REQUIRED' });
        return;
      }

      // Quota gate
      const quota = await checkAndIncrementGlobalDailyQuota(sessionUsername);
      if (!quota.allowed) {
        res.status(429).json({
          error: 'Daily AI limit reached. Come back tomorrow.',
          code: 'QUOTA_EXCEEDED',
          resetAt: quota.resetAt,
          limitHit: quota.limitHit,
        });
        return;
      }

      // Validate each repo string format
      const repoPattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
      const validRepos = rawRepos
        .map((r) => String(r).trim())
        .filter((r) => repoPattern.test(r))
        .slice(0, 4);

      if (validRepos.length < 2) {
        res.status(400).json({ error: 'At least 2 valid "owner/repo" strings are required.' });
        return;
      }

      // Fetch metrics from cache for each repo
      const metricsEntries = await Promise.all(
        validRepos.map(async (repoRef) => {
          const [owner, repoName] = repoRef.split('/');
          if (!owner || !repoName) return null;
          const cached = await getFreshRepoMetricsCache<object>(owner, repoName);
          if (!cached) return null;
          return { repo: repoRef, metrics: cached.value } as RepoMetricsForCompare;
        }),
      );

      const validEntries = metricsEntries.filter((e): e is RepoMetricsForCompare => e !== null);

      if (validEntries.length < 2) {
        res.status(400).json({
          error: 'At least 2 repositories must have been analyzed before generating compare insights. Analyze the missing repos first.',
          analyzedCount: validEntries.length,
          requestedCount: validRepos.length,
        });
        return;
      }

      const result = await generateCompareInsights(validEntries);
      res.json(result);
    } catch (error) {
      console.error('[AI][Compare] Error generating compare insights:', error);
      res.status(500).json({ error: 'Failed to generate comparison insights' });
    }
  },
);


// ─────────────────────────────────────────────────────────────
// 6l. GET /api/leaderboard — Get top developers
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

      if (!sqlDb) {
        res.status(503).json({ error: 'Database is unavailable for leaderboard requests.' });
        return;
      }

      const normalizedLang = lang && lang.toLowerCase() !== 'all languages' ? lang : undefined;
      const rows = await getLeaderboardWithLanguageFilter(sqlDb, normalizedLang);

      const leaderboard: LeaderboardApiEntry[] = rows.map((row, index) => {
        const rank = row.global_rank ?? index + 1;
        const score = parseScore(row.developer_score);
        return {
          rank,
          name: row.username,
          handle: `@${row.username}`,
          score,
          lang: row.primary_language || 'Unknown',
          repos: row.repos_count,
          percentile: formatPercentileForLeaderboard(row.percentile, score),
          tier: getTierFromRank(rank),
          img: row.avatar_url || `https://github.com/${row.username}.png`,
        };
      });

      const [updatedAt, stats] = await Promise.allSettled([
        getLeaderboardLastUpdated(),
        getLeaderboardStats(),
      ]);

      res.json({
        leaderboard,
        filter: normalizedLang || 'all',
        updatedAt: updatedAt.status === 'fulfilled' ? updatedAt.value : null,
        stats: stats.status === 'fulfilled' ? stats.value : { totalDevelopers: leaderboard.length, totalRepos: 0 },
      });
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
      const owner = req.params.owner as string;
      // Strip .svg extension if provided so cache fetch works
      const repo = (req.params.repo as string).replace(/\.svg$/, '');

      // Fetch actual score from Redis Cache (or soon DB)
      let score = 0;
      let statusText = "Unanalyzed";

      const cached = await getFreshRepoMetricsCache<any>(owner, repo);
      if (cached && cached.value && typeof cached.value.healthScore === 'number') {
        score = Math.round(cached.value.healthScore);
        statusText = `${score}/100`;
      }

      // Gray for unanalyzed, else Green/Yellow/Red
      const color = statusText === "Unanalyzed" ? '#9e9e9e' : score >= 80 ? '#4caf50' : score >= 50 ? '#ff9800' : '#f44336';

      // Generate a simple SVG badge
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="170" height="28" role="img" aria-label="GitVital: ${statusText}">
          <title>GitVital: ${statusText}</title>
          <linearGradient id="s" x2="0" y2="100%">
            <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
            <stop offset="1" stop-opacity=".1"/>
          </linearGradient>
          <clipPath id="r"><rect width="170" height="28" rx="5" fill="#fff"/></clipPath>
          <g clip-path="url(#r)">
            <rect width="90" height="28" fill="#555"/>
            <rect x="90" width="80" height="28" fill="${color}"/>
            <rect width="170" height="28" fill="url(#s)"/>
          </g>
          <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
            <text x="45" y="19.5" fill="#010101" fill-opacity=".3">GitVital</text>
            <text x="45" y="18.5">GitVital</text>
            <text x="130" y="19.5" fill="#010101" fill-opacity=".3">${statusText}</text>
            <text x="130" y="18.5">${statusText}</text>
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
      const username = req.params.username as string;

      // TODO: Fetch actual developer score from DB
      const score = 0; // Placeholder
      const color = score >= 70 ? '#4caf50' : score >= 40 ? '#ff9800' : '#f44336';

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="28" role="img" aria-label="Dev Score: ${score}">
          <title>${escapeXml(username)} Dev Score: ${score}</title>
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
            <text x="65" y="19.5" fill="#010101" fill-opacity=".3">${escapeXml(username)}</text>
            <text x="65" y="18.5">${escapeXml(username)}</text>
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

app.get('/auth/github', (req: Request, res: Response) => {
  if (!config.github.clientId || !config.github.clientSecret) {
    res.status(500).json({ error: 'GitHub OAuth is not configured.' });
    return;
  }

  // Store a sanitized frontend origin so callback redirects are deterministic.
  const queryReturnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : null;
  const referer = queryReturnTo || req.get('Referer') || config.frontendUrl;
  (req.session as any).returnTo = getSafeFrontendRedirectOrigin(referer);

  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('host');
  const redirect_uri = `${protocol}://${host}/auth/github/callback`;

  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: redirect_uri,
    scope: 'read:user',  // We only need basic profile info
  });

  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
    }
    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  });
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

    const userData = await userResponse.json() as {
      login: string;
      id: number;
      avatar_url: string;
      name: string;
      followers?: number;
      public_repos?: number;
    };

    if (!userData || !userData.id || !userData.login) {
      res.status(401).json({ error: 'Unable to load GitHub user profile.' });
      return;
    }

    if (!sqlDb) {
      res.status(503).json({ error: 'Database is unavailable for login. Please try again shortly.' });
      return;
    }

    const initialDeveloperScore = computeDeveloperScore(
      [],
      null,
      typeof userData.followers === 'number' ? userData.followers : 0,
      typeof userData.public_repos === 'number' ? userData.public_repos : 0,
    );

    // Keep users table in sync with OAuth logins so leaderboard/dev features have source data.
    const encryptedTokenForDb = encryptAccessToken(tokenData.access_token, config.encryptionKey);
    await sqlDb.query(
      `INSERT INTO users (github_id, username, avatar_url, access_token, developer_score)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (github_id) DO UPDATE SET
         username = EXCLUDED.username,
         avatar_url = EXCLUDED.avatar_url,
         access_token = EXCLUDED.access_token,
         developer_score = GREATEST(users.developer_score, EXCLUDED.developer_score),
         updated_at = NOW()`,
      [String(userData.id), userData.login, userData.avatar_url || null, encryptedTokenForDb, initialDeveloperScore],
    );

    // Encrypt before persistence and avoid storing plain access tokens in session.
    // Redis outages should not block login: we can still keep session auth active.
    await storeEncryptedGitHubToken(userData.id, tokenData.access_token);

    // Store user info in the session
    (req.session as any).userId = userData.id;
    (req.session as any).githubUsername = userData.login;

    // Determine a frontend-only redirect destination.
    const returnTo = getSafeFrontendRedirectOrigin((req.session as any).returnTo || config.frontendUrl);
    delete (req.session as any).returnTo;
    const finalRedirect = `${returnTo.replace(/\/$/, '')}/${encodeURIComponent(userData.login)}`;

    // Race condition prevention: Force session to save before sending 302 Redirect
    req.session.save((err) => {
      if (err) {
        console.error('Session save error inside callback:', err);
      }
      res.redirect(finalRedirect);
    });
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
      domain: config.session.cookieDomain,
    });

    res.status(200).json({ success: true });
  });
});

// ─────────────────────────────────────────────────────────────
// 6l. GET /api/me — Get current user session
// ─────────────────────────────────────────────────────────────
app.get('/api/me', (req: Request, res: Response) => {
  // Prevent aggressive browser/Next.js caching of the session state
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const userId = (req.session as any)?.userId;
  const githubUsername = (req.session as any)?.githubUsername;

  if (userId && githubUsername) {
    res.json({ loggedIn: true, userId, githubUsername });
  } else {
    res.json({ loggedIn: false });
  }
});


// ═══════════════════════════════════════════════════════════════
// SECTION 7: HEALTH CHECK
// ═══════════════════════════════════════════════════════════════
// A simple endpoint that deployment platforms (Render, Railway) use
// to check if our server is alive and healthy.

app.get('/health', async (_req: Request, res: Response) => {
  let redisStatus = 'error';
  try {
    const ping = await redis.ping();
    if (ping === 'PONG') redisStatus = 'ok';
  } catch (err) {
    redisStatus = `error: ${(err as Error).message}`;
  }

  const isHealthy = redisStatus === 'ok';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    redis: redisStatus,
    timestamp: new Date().toISOString(),
    env: config.nodeEnv,
  });
});


// ─────────────────────────────────────────────────────────────
// ADMIN: GET /api/admin/test-ai — Direct Gemini API diagnostic
// Hit this endpoint to see exactly why Gemini may be failing.
// ─────────────────────────────────────────────────────────────
app.get('/api/admin/test-ai', async (req: Request, res: Response): Promise<void> => {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');

  const result: Record<string, unknown> = {
    geminiApiKeyPresent: !!config.geminiApiKey,
    geminiApiKeyLength: config.geminiApiKey?.length ?? 0,
  };

  // Check Redis quota cooldown
  try {
    const cooldownVal = await redis.get('ai:gemini:quota:cooldown-until-ms');
    result.cooldownActive = !!cooldownVal && (Number(cooldownVal) - Date.now()) > 0;
    result.cooldownRemainingMs = cooldownVal ? Math.max(0, Number(cooldownVal) - Date.now()) : 0;
  } catch (e) { result.redisError = String(e); }

  if (!config.geminiApiKey) { res.json({ ...result, error: 'GEMINI_API_KEY missing' }); return; }

  // Probe the same model candidates used in production AI generation.
  const MODELS = getGeminiModelCandidates();
  const API_VERSIONS = ['v1beta', 'v1'];
  const PROMPT = 'SYSTEM: You are a code health advisor. Generate 1 sentence.\nUSER: {"health_score":75}';

  result.modelCandidates = MODELS;

  const probeResults: Record<string, unknown>[] = [];
  let firstSuccess: string | null = null;

  for (const apiVersion of API_VERSIONS) {
    for (const modelName of MODELS) {
      const probe: Record<string, unknown> = { model: modelName, apiVersion };
      try {
        const ai = new GoogleGenerativeAI(config.geminiApiKey);
        const mdl = ai.getGenerativeModel({ model: modelName }, { apiVersion } as any);
        const r = await mdl.generateContent(PROMPT);
        const txt = r.response.text();
        probe.success = true;
        probe.outputSnippet = txt.slice(0, 120);
        if (!firstSuccess) firstSuccess = `${modelName} @ ${apiVersion}`;
      } catch (e) {
        probe.success = false;
        probe.error = e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200);
      }
      probeResults.push(probe);
      // Stop after first success to save quota
      if (probe.success) break;
    }
    if (firstSuccess) break;
  }

  result.firstWorkingModel = firstSuccess;
  result.probeResults = probeResults;
  res.json(result);
});




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

  // 5. Close PostgreSQL connection pool if enabled
  if (pgPool) {
    await pgPool.end();
    console.log('   ✅ PostgreSQL pool disconnected');
  }

  // 6. Close Prisma (database) connection
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
