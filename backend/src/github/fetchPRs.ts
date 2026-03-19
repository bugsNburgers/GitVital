import { GitHubClient } from './client';
import type { PRNode, RateLimit } from '../types';

const PAGE_SIZE = 100;

interface PullRequestsQueryResponse {
    repository: {
        pullRequests: {
            pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
            };
            nodes: PRNode[];
        };
    } | null;
    rateLimit?: RateLimit;
}

const PULL_REQUESTS_QUERY = `
query RepoPullRequests($owner: String!, $name: String!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(
      first: $first
      after: $after
      states: MERGED
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        createdAt
        mergedAt
        closedAt
        author { login }
        reviews { totalCount }
      }
    }
  }
  rateLimit { remaining resetAt }
}
`;

export async function fetchPRs(
    client: GitHubClient,
    owner: string,
    repo: string,
    limit: number,
): Promise<PRNode[]> {
    const effectiveLimit = Math.max(0, limit);
    if (effectiveLimit === 0) {
        console.log(`[fetchPRs] ${owner}/${repo} consumed ~0 API points (limit=0)`);
        return [];
    }

    const results: PRNode[] = [];
    let cursor: string | null = null;
    let previousRemaining: number | undefined;
    let apiPointsConsumed = 0;

    while (results.length < effectiveLimit) {
        const data = await client.query<PullRequestsQueryResponse>(PULL_REQUESTS_QUERY, {
            owner,
            name: repo,
            first: PAGE_SIZE,
            after: cursor,
        });

        if (data.rateLimit) {
            const currentRemaining = data.rateLimit.remaining;
            if (typeof previousRemaining === 'number' && previousRemaining >= currentRemaining) {
                apiPointsConsumed += previousRemaining - currentRemaining;
            }
            previousRemaining = currentRemaining;
        }

        const connection = data.repository?.pullRequests;
        if (!connection) {
            break;
        }

        const nodes = connection.nodes ?? [];
        const hasNextPage = connection.pageInfo.hasNextPage;

        if (nodes.length === 0 && hasNextPage) {
            console.warn(`[fetchPRs] ${owner}/${repo} encountered empty page with hasNextPage=true; stopping.`);
            break;
        }

        results.push(...nodes);

        if (!hasNextPage || results.length >= effectiveLimit) {
            break;
        }

        const nextCursor = connection.pageInfo.endCursor;
        if (!nextCursor || nextCursor === cursor) {
            console.warn(`[fetchPRs] ${owner}/${repo} cursor did not advance; stopping to avoid infinite loop.`);
            break;
        }

        cursor = nextCursor;
    }

    console.log(`[fetchPRs] ${owner}/${repo} consumed ~${apiPointsConsumed} API points`);
    return results.slice(0, effectiveLimit);
}
