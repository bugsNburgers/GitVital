/**
 * GitVital Frontend Configuration
 * Centralizing API URLs to support both localhost and production (gitvital.com)
 * Cache-breaker hash for URL binding: 2026-03-29
 */

const getApiBase = () => {
  // We ignore NEXT_PUBLIC_API_URL here because it was caching an old onrender.com domain and frustrating the user.
  // The system will now correctly use the new custom domain.

  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:8080';
    }
    // For any deployed environment, hit the production API
    return 'https://api.gitvital.com';
  }

  // Server-side default fallback
  return process.env.NODE_ENV === 'production' ? 'https://api.gitvital.com' : 'http://localhost:8080';
};

const getSiteUrl = () => {
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return `${window.location.protocol}//${window.location.host}`;
    }
    return 'https://gitvital.com';
  }

  return process.env.NODE_ENV === 'production' ? 'https://gitvital.com' : 'http://localhost:3000';
};

export const API_BASE = getApiBase();
export const SITE_URL = getSiteUrl();

export type SessionUser = {
  loggedIn: boolean;
  githubUsername?: string;
  userId?: number | string;
};

export type DailyQuotaScope = 'user' | 'ip';

export interface DailyQuotaBucket {
  scope: DailyQuotaScope;
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}

export interface DailyQuotaResponse {
  loggedIn: boolean;
  analyzeDaily: DailyQuotaBucket;
  aiDaily: DailyQuotaBucket | null;
  compareDaily: DailyQuotaBucket;
  issueRecommendationsDaily: DailyQuotaBucket | null;
}

function isSessionUser(payload: unknown): payload is SessionUser {
  if (!payload || typeof payload !== 'object') return false;
  return typeof (payload as { loggedIn?: unknown }).loggedIn === 'boolean';
}

function isDailyQuotaBucket(payload: unknown): payload is DailyQuotaBucket {
  if (!payload || typeof payload !== 'object') return false;
  const value = payload as DailyQuotaBucket;
  return (value.scope === 'user' || value.scope === 'ip')
    && typeof value.limit === 'number'
    && typeof value.used === 'number'
    && typeof value.remaining === 'number'
    && typeof value.resetAt === 'string';
}

function isDailyQuotaResponse(payload: unknown): payload is DailyQuotaResponse {
  if (!payload || typeof payload !== 'object') return false;
  const value = payload as Partial<DailyQuotaResponse>;
  return typeof value.loggedIn === 'boolean'
    && isDailyQuotaBucket(value.analyzeDaily)
    && (value.aiDaily === undefined || value.aiDaily === null || isDailyQuotaBucket(value.aiDaily))
    && isDailyQuotaBucket(value.compareDaily)
    && (
      value.issueRecommendationsDaily === undefined
      || value.issueRecommendationsDaily === null
      || isDailyQuotaBucket(value.issueRecommendationsDaily)
    );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchSessionUser(apiBase: string = API_BASE, retries: number = 1): Promise<SessionUser | null> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}/api/me`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return { loggedIn: false };
        }
        throw new Error(`/api/me failed with HTTP ${response.status}`);
      }

      const payload: unknown = await response.json();
      if (!isSessionUser(payload)) {
        throw new Error('Invalid /api/me response shape.');
      }

      return payload;
    } catch {
      if (attempt < retries) {
        await delay(250);
        continue;
      }
      return null;
    }
  }

  return null;
}

export async function fetchDailyQuota(apiBase: string = API_BASE, retries: number = 1): Promise<DailyQuotaResponse | null> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}/api/quota/daily`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`/api/quota/daily failed with HTTP ${response.status}`);
      }

      const payload: unknown = await response.json();
      if (!isDailyQuotaResponse(payload)) {
        throw new Error('Invalid /api/quota/daily response shape.');
      }
      const value = payload as Partial<DailyQuotaResponse>;
      return {
        loggedIn: Boolean(value.loggedIn),
        analyzeDaily: value.analyzeDaily as DailyQuotaBucket,
        aiDaily: value.aiDaily ?? null,
        compareDaily: value.compareDaily as DailyQuotaBucket,
        issueRecommendationsDaily: value.issueRecommendationsDaily ?? null,
      };
    } catch {
      if (attempt < retries) {
        await delay(250);
        continue;
      }
      return null;
    }
  }

  return null;
}

export const getAuthUrl = (returnTo: string = SITE_URL) => {
  const params = new URLSearchParams({ returnTo });
  return `${API_BASE}/auth/github?${params.toString()}`;
};

export const AUTH_URL = getAuthUrl();
