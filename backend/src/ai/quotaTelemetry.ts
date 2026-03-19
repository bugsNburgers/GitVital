import { redis } from '../config/redis';

const GEMINI_QUOTA_COOLDOWN_KEY = 'ai:gemini:quota:cooldown-until-ms';
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;

export interface GeminiQuotaCooldownInfo {
    active: boolean;
    remainingMs: number;
    cooldownUntilMs: number | null;
}

export async function markGeminiQuotaLimited(cooldownMs = DEFAULT_COOLDOWN_MS): Promise<void> {
    const normalizedCooldownMs = Math.max(60_000, cooldownMs);
    const cooldownUntilMs = Date.now() + normalizedCooldownMs;

    await redis.set(
        GEMINI_QUOTA_COOLDOWN_KEY,
        String(cooldownUntilMs),
        'PX',
        normalizedCooldownMs,
    );
}

export async function getGeminiQuotaCooldownInfo(): Promise<GeminiQuotaCooldownInfo> {
    const value = await redis.get(GEMINI_QUOTA_COOLDOWN_KEY);

    if (!value) {
        return {
            active: false,
            remainingMs: 0,
            cooldownUntilMs: null,
        };
    }

    const cooldownUntilMs = Number(value);
    if (!Number.isFinite(cooldownUntilMs)) {
        await redis.del(GEMINI_QUOTA_COOLDOWN_KEY);
        return {
            active: false,
            remainingMs: 0,
            cooldownUntilMs: null,
        };
    }

    const remainingMs = Math.max(0, cooldownUntilMs - Date.now());
    if (remainingMs <= 0) {
        await redis.del(GEMINI_QUOTA_COOLDOWN_KEY);
        return {
            active: false,
            remainingMs: 0,
            cooldownUntilMs: null,
        };
    }

    return {
        active: true,
        remainingMs,
        cooldownUntilMs,
    };
}
