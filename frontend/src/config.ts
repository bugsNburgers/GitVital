/**
 * GitVital Frontend Configuration
 * Centralizing API URLs to support both localhost and production (gitvital.com)
 */

const getApiBase = () => {
  if (typeof window !== 'undefined') {
    // Client-side detection
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:8080';
    }
    // Production API - adjusting for gitvital.com
    return 'https://api.gitvital.com';
  }
  // Server-side (fallback for SSR/Node)
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
};

export const API_BASE = getApiBase();
export const AUTH_URL = `${API_BASE}/auth/github`;
