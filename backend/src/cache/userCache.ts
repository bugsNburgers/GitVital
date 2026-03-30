import { redis } from '../config/redis';
import { config } from '../config';

const DEFAULT_CACHE_TTL_SECONDS = config.cacheTtlSeconds;

function normalizeUsername(username: string): string {
    return username.trim().toLowerCase();
}

export type UserContributionMetricsCacheValue = {
    username: string;
    externalPRCount: number;
    externalMergedPRCount: number;
    contributionAcceptanceRate: number;
    analyzedAt: string;
};

export type UserCacheHit<T> = {
    key: string;
    ttlSeconds: number;
    value: T;
};

export function getUserContributionCacheKey(username: string): string {
    return `user:metrics:${normalizeUsername(username)}`;
}

export async function getFreshUserContributionCache<T>(username: string): Promise<UserCacheHit<T> | null> {
    const key = getUserContributionCacheKey(username);

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

export async function setUserContributionCache(
    username: string,
    value: unknown,
    ttlSeconds = DEFAULT_CACHE_TTL_SECONDS,
): Promise<void> {
    const key = getUserContributionCacheKey(username);
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function clearUserContributionCache(username: string): Promise<void> {
    const key = getUserContributionCacheKey(username);
    await redis.del(key);
}
