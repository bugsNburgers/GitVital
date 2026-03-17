// src/config/redis.ts — Creates and exports a single shared Redis connection

import Redis from 'ioredis';
import { config } from './index';

// ioredis parses the URL automatically (host, port, password, etc.)
// We create ONE connection here and reuse it everywhere.
// Creating multiple connections wastes memory and can hit Redis connection limits.
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ — it handles retries itself
});

// Log connection events so we can debug issues
redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});
