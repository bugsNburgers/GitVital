/**
 * GitVital Frontend Configuration
 * Centralizing API URLs to support both localhost and production (gitvital.com)
 * Cache-breaker hash for URL binding: 2026-03-29
 */

const getApiBase = () => {
  // If explicitly set via environment variable, ALWAYS use it (useful for Render deployment with custom domains)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
  }

  // Client-side detection
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:8080';
    }
    // For any deployed environment (like gitvital.com), hit the production API
    return 'https://api.gitvital.com';
  }

  // Server-side default fallback
  return process.env.NODE_ENV === 'production' ? 'https://api.gitvital.com' : 'http://localhost:8080';
};

export const API_BASE = getApiBase();
export const AUTH_URL = `${API_BASE}/auth/github`;
