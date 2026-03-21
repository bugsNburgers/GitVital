import { GitHubClient } from './client';
import { ISSUE_QUERY } from './queries';
import type { IssueNode, RateLimit } from '../types';

const PAGE_SIZE = 100;

interface IssuesQueryResponse {
    repository: {
        issues: {
            pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
            };
            nodes: IssueNode[];
        };
    } | null;
    rateLimit?: RateLimit;
}

export async function fetchIssues(
    client: GitHubClient,
    owner: string,
    repo: string,
    limit: number,
): Promise<IssueNode[]> {
    const effectiveLimit = Math.max(0, limit);
    if (effectiveLimit === 0) {
        console.log(`[fetchIssues] ${owner}/${repo} consumed ~0 API points (limit=0)`);
        return [];
    }

    const results: IssueNode[] = [];
    let cursor: string | null = null;
    let previousRemaining: number | undefined;
    let apiPointsConsumed = 0;

    while (results.length < effectiveLimit) {
        const data: IssuesQueryResponse = await client.query<IssuesQueryResponse>(ISSUE_QUERY, {
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

        const connection = data.repository?.issues;
        if (!connection) {
            break;
        }

        const nodes = connection.nodes ?? [];
        const hasNextPage = connection.pageInfo.hasNextPage;

        if (nodes.length === 0 && hasNextPage) {
            console.warn(`[fetchIssues] ${owner}/${repo} encountered empty page with hasNextPage=true; stopping.`);
            break;
        }

        results.push(...nodes);

        if (!hasNextPage || results.length >= effectiveLimit) {
            break;
        }

        const nextCursor = connection.pageInfo.endCursor;
        if (!nextCursor || nextCursor === cursor) {
            console.warn(`[fetchIssues] ${owner}/${repo} cursor did not advance; stopping to avoid infinite loop.`);
            break;
        }

        cursor = nextCursor;
    }

    console.log(`[fetchIssues] ${owner}/${repo} consumed ~${apiPointsConsumed} API points`);
    return results.slice(0, effectiveLimit);
}
