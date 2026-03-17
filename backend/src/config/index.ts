// src/config/index.ts — Central configuration, reads from environment variables

// We use process.env to read environment variables.
// These are set in a .env file (which is gitignored) or by the hosting platform.
// The "|| 'fallback'" pattern provides a default value for local development.

export const config = {
  // ──────────────────────────────────────────────
  // Server
  // ──────────────────────────────────────────────
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // The URL of your frontend app — used by CORS to only allow YOUR frontend to talk to this API
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // ──────────────────────────────────────────────
  // Redis — used by BullMQ (job queue) and session store
  // ──────────────────────────────────────────────
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // ──────────────────────────────────────────────
  // Session — the secret key used to encrypt session cookies
  // ──────────────────────────────────────────────
  sessionSecret: process.env.SESSION_SECRET || 'repopulse-dev-secret-change-me',

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
  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '3600', 10), // 1 hour default
};
