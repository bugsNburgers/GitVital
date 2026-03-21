import { redis } from '../config/redis';
import { config } from '../config';

const DEFAULT_CACHE_TTL_SECONDS = config.cacheTtlSeconds;

function normalizeSegment(input: string): string {
    return input.trim().toLowerCase();
}

export function getRepoMetricsCacheKey(owner: string, repo: string): string {
    return `repo:metrics:${normalizeSegment(owner)}:${normalizeSegment(repo)}`;
}

export type RepoCacheHit<T> = {
    key: string;
    ttlSeconds: number;
    value: T;
};

// A key is considered fresh when it exists and still has positive TTL.
// If Redis reports no expiry for this key shape, we treat it as stale and clear it.
export async function getFreshRepoMetricsCache<T>(owner: string, repo: string): Promise<RepoCacheHit<T> | null> {
    const key = getRepoMetricsCacheKey(owner, repo);

    const [rawValue, ttlSeconds] = await Promise.all([
        redis.get(key),
        redis.ttl(key),
    ]);

    if (!rawValue) {
        return null;
    }

    if (ttlSeconds <= 0) {
        await redis.del(key);
        return null;
    }

    try {
        const parsed = JSON.parse(rawValue) as T;
        return {
            key,
            ttlSeconds,
            value: parsed,
        };
    } catch {
        await redis.del(key);
        return null;
    }
}

export async function setRepoMetricsCache(owner: string, repo: string, metrics: unknown, ttlSeconds = DEFAULT_CACHE_TTL_SECONDS): Promise<void> {
    const key = getRepoMetricsCacheKey(owner, repo);
    await redis.set(key, JSON.stringify(metrics), 'EX', ttlSeconds);
}

export async function clearRepoMetricsCache(owner: string, repo: string): Promise<void> {
    const key = getRepoMetricsCacheKey(owner, repo);
    await redis.del(key);
}
