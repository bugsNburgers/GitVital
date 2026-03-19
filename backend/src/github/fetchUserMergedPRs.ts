import { GitHubClient } from './client';
import type { UserMergedPRNode, RateLimit } from '../types';

const PAGE_SIZE = 100;
const MAX_USER_PRS = 500;

interface UserMergedPullRequestsQueryResponse {
    user: {
        pullRequests: {
            pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
            };
            nodes: UserMergedPRNode[];
        };
    } | null;
    rateLimit?: RateLimit;
}

const USER_MERGED_PRS_QUERY = `
query UserMergedPullRequests($username: String!, $first: Int!, $after: String) {
  user(login: $username) {
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
        author { login }
        repository {
          owner { login }
        }
      }
    }
  }
  rateLimit { remaining resetAt }
}
`;

export async function fetchUserMergedPRs(
    client: GitHubClient,
    username: string,
    limit: number,
): Promise<UserMergedPRNode[]> {
    const effectiveLimit = Math.max(0, Math.min(limit, MAX_USER_PRS));
    if (effectiveLimit === 0) {
        console.log(`[fetchUserMergedPRs] ${username} consumed ~0 API points (limit=0)`);
        return [];
    }

    const results: UserMergedPRNode[] = [];
    let cursor: string | null = null;
    let previousRemaining: number | undefined;
    let apiPointsConsumed = 0;

    while (results.length < effectiveLimit) {
        const data = await client.query<UserMergedPullRequestsQueryResponse>(USER_MERGED_PRS_QUERY, {
            username,
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

        const connection = data.user?.pullRequests;
        if (!connection) {
            break;
        }

        const nodes = connection.nodes ?? [];
        const hasNextPage = connection.pageInfo.hasNextPage;

        if (nodes.length === 0 && hasNextPage) {
            console.warn(`[fetchUserMergedPRs] ${username} encountered empty page with hasNextPage=true; stopping.`);
            break;
        }

        results.push(...nodes);

        if (!hasNextPage || results.length >= effectiveLimit) {
            break;
        }

        const nextCursor = connection.pageInfo.endCursor;
        if (!nextCursor || nextCursor === cursor) {
            console.warn(`[fetchUserMergedPRs] ${username} cursor did not advance; stopping to avoid infinite loop.`);
            break;
        }

        cursor = nextCursor;
    }

    console.log(`[fetchUserMergedPRs] ${username} consumed ~${apiPointsConsumed} API points`);
    return results.slice(0, effectiveLimit);
}
