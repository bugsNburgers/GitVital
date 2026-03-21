// src/config/redis.ts — Creates and exports a single shared Redis connection

import Redis from 'ioredis';
import { config } from './index';

// ioredis parses the URL automatically (host, port, password, etc.)
// We create ONE connection here and reuse it everywhere.
// Creating multiple connections wastes memory and can hit Redis connection limits.
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ — it handles retries itself
});

// Redis Memory Management
// On first connect, apply free-tier-safe memory limits:
//   maxmemory  100mb       — cap memory consumption (safe for free tiers)
//   maxmemory-policy allkeys-lru — evict least-recently-used keys when full
// Note: some managed Redis providers (e.g. Upstash with read-only CONFIG)
// will reject CONFIG SET. The catch block ensures this never crashes the server.
redis.on('connect', async () => {
  console.log('✅ Redis connected');
  try {
    await redis.config('SET', 'maxmemory', '100mb');
    await redis.config('SET', 'maxmemory-policy', 'allkeys-lru');
    console.log('✅ Redis memory policy set: maxmemory=100mb, policy=allkeys-lru');
  } catch (err) {
    // Non-fatal: managed Redis instances may disallow CONFIG SET
    console.warn('⚠️  Redis CONFIG SET skipped (managed instance or insufficient permissions):', (err as Error).message);
  }
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});
