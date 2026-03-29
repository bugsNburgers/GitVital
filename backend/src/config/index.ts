// src/config/index.ts — Central configuration, reads from environment variables

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

export const config = {
  // ──────────────────────────────────────────────
  // Server
  // ──────────────────────────────────────────────
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // The URL of your frontend app — used by CORS to only allow YOUR frontend to talk to this API
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://gitvital.com',
    'https://www.gitvital.com',
    'https://api.gitvital.com',
    'https://1pi.gitvital.com',
    'https://api.1pi.gitvital.com',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])
  ],

  // ──────────────────────────────────────────────
  // Redis — used by BullMQ (job queue) and session store
  // ──────────────────────────────────────────────
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // ──────────────────────────────────────────────
  // Session — the secret key used to encrypt session cookies
  // ──────────────────────────────────────────────
  sessionSecret: getRequiredEnv('SESSION_SECRET'),
  encryptionKey: getRequiredEnv('ENCRYPTION_KEY'),

  session: {
    cookieName: process.env.SESSION_COOKIE_NAME || 'gitvital.sid',
    sameSite: ((process.env.NODE_ENV === 'production' || process.env.RENDER || process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT_NAME) ? 'none' : 'lax') as 'none' | 'lax',
    secureCookies: !!(process.env.NODE_ENV === 'production' || process.env.RENDER || process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT_NAME),
    ttlMs: 1000 * 60 * 60 * 24 * 7,
  },

  // ──────────────────────────────────────────────
  // GitHub OAuth — credentials from your GitHub Developer Settings
  // ──────────────────────────────────────────────
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:4000/auth/github/callback',
  },

  // ──────────────────────────────────────────────
  // Gemini AI — your API key for Google's Gemini model
  // ──────────────────────────────────────────────
  geminiApiKey: process.env.GEMINI_API_KEY || '',

  // Cost-budget policy guardrails (Prompt 3.3)
  // Keep usage on free tiers and degrade gracefully on quota pressure.
  costBudget: {
    monthlyTargetUsd: parseFloat(process.env.MONTHLY_COST_TARGET_USD || '0'),
    freeTierOnly: (process.env.FREE_TIER_ONLY || 'true').toLowerCase() === 'true',
    degradeGracefullyOnLimit: (process.env.DEGRADE_GRACEFULLY_ON_LIMIT || 'true').toLowerCase() === 'true',
  },

  // ──────────────────────────────────────────────
  // Rate Limiting
  // ──────────────────────────────────────────────
  rateLimit: {
    windowMs: 1 * 60 * 1000, // 1 minute window
    maxRequests: 30,          // 30 requests per window per IP
  },

  // ──────────────────────────────────────────────
  // Cache TTL (Time To Live) — how long cached data stays valid
  // ──────────────────────────────────────────────
  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '86400', 10), // 24 hours default (Guidesrc §9)
};
