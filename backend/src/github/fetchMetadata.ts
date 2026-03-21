import { GitHubClient, RepoNotFoundError } from './client';
import { REPO_QUERY } from './queries';
import type { RateLimit, RepoMetadata } from '../types';

interface RepoQueryResponse {
    repository: {
        stargazerCount: number;
        forkCount: number;
        isArchived: boolean;
        isFork: boolean;
        primaryLanguage: { name: string } | null;
        defaultBranchRef: {
            target: {
                history: {
                    totalCount: number;
                };
            } | null;
        } | null;
    } | null;
    rateLimit?: RateLimit;
}

/**
 * Fetch and validate repository metadata using GitHub GraphQL.
 */
export async function fetchMetadata(
    client: GitHubClient,
    owner: string,
    repo: string,
): Promise<RepoMetadata> {
    try {
        const data = await client.query<RepoQueryResponse>(REPO_QUERY, {
            owner,
            name: repo,
            first: 1,
            after: null,
        });

        const repository = data.repository;
        if (!repository) {
            return {
                exists: false,
                isPrivate: false,
                isArchived: false,
                isFork: false,
                hasDefaultBranch: false,
                stars: 0,
                forks: 0,
                language: null,
                totalCommitCount: 0,
            };
        }

        const history = repository.defaultBranchRef?.target?.history;

        return {
            exists: true,
            isPrivate: false,
            isArchived: repository.isArchived,
            isFork: repository.isFork,
            hasDefaultBranch: repository.defaultBranchRef !== null,
            stars: repository.stargazerCount,
            forks: repository.forkCount,
            language: repository.primaryLanguage?.name ?? null,
            totalCommitCount: history?.totalCount ?? 0,
        };
    } catch (error) {
        if (error instanceof RepoNotFoundError) {
            return {
                exists: false,
                isPrivate: true,
                isArchived: false,
                isFork: false,
                hasDefaultBranch: false,
                stars: 0,
                forks: 0,
                language: null,
                totalCommitCount: 0,
            };
        }

        throw error;
    }
}
