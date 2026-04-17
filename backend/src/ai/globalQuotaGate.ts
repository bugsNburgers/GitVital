// src/ai/globalQuotaGate.ts — Shared daily Gemini call quota across ALL AI endpoints

import { redis } from '../config/redis';

// ── Constants ─────────────────────────────────────────────────────────────────

const GLOBAL_DAILY_CAP = 800;   // Total Gemini calls per UTC day across all users
const USER_DAILY_CAP = 20;    // Per logged-in user per UTC day

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD in UTC. */
function utcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Seconds remaining until end of current UTC day. */
function secondsUntilMidnightUtc(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

function globalKey(date: string): string {
  return `ai:global:daily:${date}`;
}

function userKey(username: string, date: string): string {
  return `ai:user:daily:${username.toLowerCase()}:${date}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuotaCheckResult {
  allowed: boolean;
  /** How many requests the user has left today (0 when denied). */
  remaining: number;
  /** ISO string for when the quota resets (start of next UTC day). */
  resetAt: string;
  /** Which limit was hit: 'user' | 'global' | null */
  limitHit: 'user' | 'global' | null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Atomically checks and increments the global + per-user daily Gemini call counters.
 *
 * Call this at the START of every AI endpoint handler (after auth check).
 * If `allowed` is false, the caller should return HTTP 429 immediately.
 *
 * @param username  The logged-in GitHub username. Pass empty string for anonymous
 *                  (anonymous requests will only be checked against the global cap).
 */
export async function checkAndIncrementGlobalDailyQuota(
  username: string,
): Promise<QuotaCheckResult> {
  const date = utcDateKey();
  const ttl = secondsUntilMidnightUtc();
  const resetAt = new Date(
    Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate() + 1,
    ),
  ).toISOString();

  try {
    const gKey = globalKey(date);
    const uKey = username ? userKey(username, date) : null;

    // Read current counts without incrementing first (to avoid over-counting on deny)
    const [rawGlobal, rawUser] = await Promise.all([
      redis.get(gKey),
      uKey ? redis.get(uKey) : Promise.resolve(null),
    ]);

    const globalCount = Number(rawGlobal ?? 0);
    const userCount = Number(rawUser ?? 0);

    // Global cap check
    if (globalCount >= GLOBAL_DAILY_CAP) {
      console.warn(`[QuotaGate] Global daily cap (${GLOBAL_DAILY_CAP}) reached.`);
      return { allowed: false, remaining: 0, resetAt, limitHit: 'global' };
    }

    // Per-user cap check
    if (uKey && userCount >= USER_DAILY_CAP) {
      console.warn(`[QuotaGate] User "${username}" daily cap (${USER_DAILY_CAP}) reached.`);
      return { allowed: false, remaining: 0, resetAt, limitHit: 'user' };
    }

    // Increment atomically (INCR sets to 1 if key doesn't exist)
    const pipeline = redis.pipeline();
    pipeline.incr(gKey);
    pipeline.expire(gKey, ttl);
    if (uKey) {
      pipeline.incr(uKey);
      pipeline.expire(uKey, ttl);
    }
    await pipeline.exec();

    const remaining = Math.max(0, USER_DAILY_CAP - (userCount + 1));
    return { allowed: true, remaining, resetAt, limitHit: null };

  } catch (err) {
    // Redis failure — fail open (allow the request) to avoid blocking users
    console.error('[QuotaGate] Redis error — failing open:', err);
    return { allowed: true, remaining: USER_DAILY_CAP, resetAt, limitHit: null };
  }
}

/**
 * Returns current usage stats without modifying any counters.
 * Useful for debug endpoints or admin views.
 */
export async function getQuotaStatus(username?: string): Promise<{
  globalUsed: number;
  globalCap: number;
  userUsed: number;
  userCap: number;
  resetAt: string;
}> {
  const date = utcDateKey();
  const resetAt = new Date(
    Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate() + 1,
    ),
  ).toISOString();

  try {
    const [rawGlobal, rawUser] = await Promise.all([
      redis.get(globalKey(date)),
      username ? redis.get(userKey(username, date)) : Promise.resolve(null),
    ]);
    return {
      globalUsed: Number(rawGlobal ?? 0),
      globalCap: GLOBAL_DAILY_CAP,
      userUsed: Number(rawUser ?? 0),
      userCap: USER_DAILY_CAP,
      resetAt,
    };
  } catch {
    return { globalUsed: 0, globalCap: GLOBAL_DAILY_CAP, userUsed: 0, userCap: USER_DAILY_CAP, resetAt };
  }
}
