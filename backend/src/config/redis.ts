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

redis.on('connect', async () => {
  console.log(`✅ Redis connected to: ${redactRedisUrl(config.redisUrl)}`);
  try {
    // Some managed Redis providers (e.g. Upstash with read-only CONFIG)
    // will reject CONFIG SET.
    await redis.config('SET', 'maxmemory', '100mb');
    await redis.config('SET', 'maxmemory-policy', 'noeviction');
    console.log('✅ Redis memory policy set: maxmemory=100mb, policy=noeviction');
  } catch (err) {
    console.warn('⚠️  Redis CONFIG SET skipped:', (err as Error).message);
  }
});

redis.on('error', (err) => {
  console.error(`❌ Redis connection error (${redactRedisUrl(config.redisUrl)}):`, err.message);
});
