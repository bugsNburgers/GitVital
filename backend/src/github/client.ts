import type { RateLimit } from '../types';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
const REQUEST_TIMEOUT_MS = 30_000;
const LOW_RATE_LIMIT_THRESHOLD = 200;
const LOW_RATE_LIMIT_BUFFER_MS = 5_000;
const BACKOFF_MS = [1_000, 3_000, 9_000];

interface GraphQLErrorShape {
    message?: string;
    extensions?: {
        code?: string;
    };
}

interface GraphQLResponse<T> {
    data?: T & {
        rateLimit?: RateLimit;
    };
    errors?: GraphQLErrorShape[];
}

export class AuthExpiredError extends Error {
    constructor(message = 'GitHub OAuth token expired') {
        super(message);
        this.name = 'AuthExpiredError';
    }
}

export class RepoNotFoundError extends Error {
    constructor(message = 'Repository not found or is private') {
        super(message);
        this.name = 'RepoNotFoundError';
    }
}

export class RateLimitError extends Error {
    public readonly resetAt?: string;

    constructor(message = 'GitHub rate limit exceeded', resetAt?: string) {
        super(message);
        this.name = 'RateLimitError';
        this.resetAt = resetAt;
    }
}

export class GitHubClient {
    private readonly accessToken: string;

    constructor(accessToken: string) {
        this.accessToken = accessToken;
    }

    async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
        const queryWithRateLimit = this.ensureRateLimitSelection(query);
        let attempt = 0;

        while (attempt < BACKOFF_MS.length) {
            const controller = new AbortController();
            const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

            try {
                const response = await fetch(GITHUB_GRAPHQL_URL, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        query: queryWithRateLimit,
                        variables: variables ?? {},
                    }),
                    signal: controller.signal,
                });

                clearTimeout(timeoutHandle);

                if (response.status === 401) {
                    throw new AuthExpiredError();
                }

                if (response.status === 403) {
                    const resetAt = this.extractResetAtFromHeaders(response.headers);
                    const remainingHeader = response.headers.get('x-ratelimit-remaining');
                    const remaining = remainingHeader ? Number(remainingHeader) : Number.NaN;

                    if (!Number.isNaN(remaining) && remaining <= 0) {
                        throw new RateLimitError('GitHub API rate limit reached', resetAt);
                    }

                    const text = await response.text();
                    const isRateLimitMessage = /rate limit|abuse detection/i.test(text);
                    if (isRateLimitMessage) {
                        throw new RateLimitError('GitHub API rate limit reached', resetAt);
                    }

                    throw new Error(`GitHub request forbidden: ${response.status}`);
                }

                if (response.status >= 500) {
                    if (attempt < BACKOFF_MS.length - 1) {
                        await this.sleep(this.retryDelayMs(attempt, response.status));
                        attempt += 1;
                        continue;
                    }
                    throw new Error(`GitHub server error: ${response.status}`);
                }

                if (!response.ok) {
                    throw new Error(`GitHub request failed with status ${response.status}`);
                }

                const parsed = (await response.json()) as GraphQLResponse<T>;
                this.handleGraphQLErrors(parsed.errors);

                if (!parsed.data) {
                    throw new Error('GitHub GraphQL response missing data');
                }

                const rateLimit = parsed.data.rateLimit;
                if (rateLimit && rateLimit.remaining < LOW_RATE_LIMIT_THRESHOLD) {
                    // Add a fixed 5-second safety buffer so we resume after reset has definitely passed.
                    const sleepMs = Math.max(
                        0,
                        new Date(rateLimit.resetAt).getTime() - Date.now() + LOW_RATE_LIMIT_BUFFER_MS,
                    );

                    console.warn(
                        `Rate limit low (${rateLimit.remaining} remaining). Sleeping until ${rateLimit.resetAt}`,
                    );

                    if (sleepMs > 0) {
                        await this.sleep(sleepMs);
                    }
                }

                return parsed.data as T;
            } catch (error) {
                clearTimeout(timeoutHandle);

                if (error instanceof AuthExpiredError) {
                    throw error;
                }

                if (error instanceof RateLimitError) {
                    throw error;
                }

                if (error instanceof RepoNotFoundError) {
                    throw error;
                }

                const isAbortError = error instanceof Error && error.name === 'AbortError';
                if (isAbortError) {
                    if (attempt < BACKOFF_MS.length - 1) {
                        await this.sleep(this.retryDelayMs(attempt));
                        attempt += 1;
                        continue;
                    }
                    throw new Error('GitHub request timed out after 3 attempts');
                }

                if (attempt < BACKOFF_MS.length - 1) {
                    await this.sleep(this.retryDelayMs(attempt));
                    attempt += 1;
                    continue;
                }

                throw error;
            }
        }

        throw new Error('GitHub request failed after retries');
    }

    private ensureRateLimitSelection(query: string): string {
        if (/\brateLimit\b/.test(query)) {
            return query;
        }

        const lastBraceIndex = query.lastIndexOf('}');
        if (lastBraceIndex === -1) {
            return query;
        }

        return `${query.slice(0, lastBraceIndex)}\n  rateLimit { remaining resetAt }\n${query.slice(lastBraceIndex)}`;
    }

    private handleGraphQLErrors(errors?: GraphQLErrorShape[]): void {
        if (!errors || errors.length === 0) {
            return;
        }

        const hasNotFound = errors.some((error) => {
            const code = error.extensions?.code;
            const message = error.message ?? '';
            return code === 'NOT_FOUND' || /not[_\s-]?found/i.test(message);
        });

        if (hasNotFound) {
            throw new RepoNotFoundError();
        }

        const forbiddenError = errors.find((error) => {
            const code = error.extensions?.code;
            const message = error.message ?? '';
            return code === 'FORBIDDEN' || /forbidden|rate limit|abuse detection/i.test(message);
        });

        if (forbiddenError) {
            throw new RateLimitError('GitHub GraphQL forbids this request');
        }

        const message = errors.map((error) => error.message).filter(Boolean).join('; ');
        throw new Error(message || 'GitHub GraphQL returned errors');
    }

    private extractResetAtFromHeaders(headers: Headers): string | undefined {
        const resetHeader = headers.get('x-ratelimit-reset');
        if (!resetHeader) {
            return undefined;
        }

        const resetSeconds = Number(resetHeader);
        if (Number.isNaN(resetSeconds)) {
            return undefined;
        }

        return new Date(resetSeconds * 1000).toISOString();
    }

    private retryDelayMs(attempt: number, statusCode?: number): number {
        const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
        if (statusCode === 502 || statusCode === 503) {
            return base + 5_000;
        }

        return base;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
