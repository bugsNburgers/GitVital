import { GitHubClient } from './client';
import type { CommitNode, RateLimit } from '../types';

const PAGE_SIZE = 100;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

interface CommitsQueryResponse {
    repository: {
        defaultBranchRef: {
            target: {
                history: {
                    pageInfo: {
                        hasNextPage: boolean;
                        endCursor: string | null;
                    };
                    nodes: CommitNode[];
                };
            } | null;
        } | null;
    } | null;
    rateLimit?: RateLimit;
}

const COMMITS_QUERY = `
query RepoCommits($owner: String!, $name: String!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef {
      target {
        ... on Commit {
          history(first: $first, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              committedDate
              additions
              deletions
              author {
                user { login }
                name
              }
            }
          }
        }
      }
    }
  }
  rateLimit { remaining resetAt }
}
`;

export async function fetchCommits(
    client: GitHubClient,
    owner: string,
    repo: string,
    limit: number,
): Promise<CommitNode[]> {
    const effectiveLimit = Math.max(0, limit);
    if (effectiveLimit === 0) {
        console.log(`[fetchCommits] ${owner}/${repo} consumed ~0 API points (limit=0)`);
        return [];
    }

    const cutoff = Date.now() - ONE_YEAR_MS;
    const results: CommitNode[] = [];
    let cursor: string | null = null;
    let previousRemaining: number | undefined;
    let apiPointsConsumed = 0;

    while (results.length < effectiveLimit) {
        const data: CommitsQueryResponse = await client.query<CommitsQueryResponse>(COMMITS_QUERY, {
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

        const history = data.repository?.defaultBranchRef?.target?.history;
        if (!history) {
            break;
        }

        const nodes = history.nodes ?? [];
        const hasNextPage = history.pageInfo.hasNextPage;

        if (nodes.length === 0 && hasNextPage) {
            console.warn(`[fetchCommits] ${owner}/${repo} encountered empty page with hasNextPage=true; stopping.`);
            break;
        }

        let reachedOlderThanCutoff = false;
        for (const node of nodes) {
            const committedAt = new Date(node.committedDate).getTime();
            if (!Number.isFinite(committedAt) || committedAt < cutoff) {
                reachedOlderThanCutoff = true;
                break;
            }

            results.push(node);
            if (results.length >= effectiveLimit) {
                break;
            }
        }

        if (reachedOlderThanCutoff || !hasNextPage || results.length >= effectiveLimit) {
            break;
        }

        const nextCursor = history.pageInfo.endCursor;
        if (!nextCursor || nextCursor === cursor) {
            console.warn(`[fetchCommits] ${owner}/${repo} cursor did not advance; stopping to avoid infinite loop.`);
            break;
        }

        cursor = nextCursor;
    }

    console.log(`[fetchCommits] ${owner}/${repo} consumed ~${apiPointsConsumed} API points`);
    return results.slice(0, effectiveLimit);
}
