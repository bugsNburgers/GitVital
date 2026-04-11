// src/db/pool.ts — Shared PostgreSQL connection pool (singleton)
// Used by both the API server AND the worker process.
// Gracefully returns null when DATABASE_URL is not set.

import { Pool } from 'pg';

function createPool(): Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.warn('[DB] DATABASE_URL is not set — DB persistence disabled.');
    return null;
  }
  const sslRequired = url.includes('sslmode=require');
  return new Pool({
    connectionString: url,
    ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export const pgPool: Pool | null = createPool();

/** Run a query, returns null if pool is unavailable. Caller handles null. */
export async function dbQuery<T = unknown>(
  sql: string,
  params: unknown[] = [],
): Promise<T[] | null> {
  if (!pgPool) return null;
  try {
    const result = await pgPool.query(sql, params);
    return result.rows as T[];
  } catch (err) {
    console.error('[DB] Query error:', err instanceof Error ? err.message : err);
    return null;
  }
}
