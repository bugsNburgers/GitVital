export const REPO_METADATA_QUERY = `
query RepoData($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    name
    stargazerCount
    forkCount
    createdAt
    pushedAt
    isArchived
    isFork
    primaryLanguage { name }
    defaultBranchRef {
      target {
        ... on Commit {
          history(first: 100, after: $cursor) {
            pageInfo { hasNextPage, endCursor }
            nodes {
              committedDate
              author {
                user { login }
                name
              }
              additions
              deletions
            }
          }
        }
      }
    }
  }
  rateLimit { remaining, resetAt }
}
`;

export const PR_QUERY = `
query RepoPRs($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 100, after: $cursor, states: MERGED,
                 orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage, endCursor }
      nodes {
        createdAt
        mergedAt
        closedAt
        author { login }
        reviews { totalCount }
      }
    }
  }
  rateLimit { remaining, resetAt }
}
`;

export const ISSUE_QUERY = `
query RepoIssues($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, after: $cursor, states: OPEN,
           orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage, endCursor }
      nodes {
        createdAt
        closedAt
        state
        comments { totalCount }
      }
    }
  }
  rateLimit { remaining, resetAt }
}
`;

// Backward-compatible alias used by existing fetchers/wiring.
export const REPO_QUERY = REPO_METADATA_QUERY;
