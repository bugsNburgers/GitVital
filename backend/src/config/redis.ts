// src/config/redis.ts — Creates and exports a single shared Redis connection

import Redis from 'ioredis';
import { config } from './index';

// Helper to redact the Redis URL for safe logging
function redactRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '********';
    return parsed.toString();
  } catch {
    return 'invalid-url';
  }
}

// ioredis parses the URL automatically (host, port, password, etc.)
// We create ONE connection here and reuse it everywhere.
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ — it handles retries itself
});

type BullRedisConnection = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
};

export function getBullRedisConnection(): BullRedisConnection {
  const redisUrlObj = new URL(config.redisUrl);

  return {
    host: redisUrlObj.hostname || 'localhost',
    port: parseInt(redisUrlObj.port || '6379', 10),
    username: redisUrlObj.username ? decodeURIComponent(redisUrlObj.username) : undefined,
    password: redisUrlObj.password ? decodeURIComponent(redisUrlObj.password) : undefined,
    tls: redisUrlObj.protocol === 'rediss:' ? {} : undefined,
  };
}

redis.on('connect', () => {
  console.log(`✅ Redis connected to: ${redactRedisUrl(config.redisUrl)}`);
  // Note: Redis Cloud managed instances do not allow CONFIG SET.
  // Eviction policy (volatile-lru) is set via the Redis Cloud dashboard.
});

redis.on('error', (err) => {
  console.error(`❌ Redis connection error (${redactRedisUrl(config.redisUrl)}):`, err.message);
});
