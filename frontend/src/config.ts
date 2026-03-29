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

export const API_BASE = getApiBase();
export const AUTH_URL = `${API_BASE}/auth/github`;
export const SITE_URL = typeof window !== 'undefined'
  ? (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://gitvital.com')
  : 'https://gitvital.com';
