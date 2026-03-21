export const REPO_QUERY = `
query RepoData($owner: String!, $name: String!, $first: Int!, $after: String) {
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
          history(first: $first, after: $after) {
            totalCount
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

export const PR_QUERY = `
query RepoPRs($owner: String!, $name: String!, $first: Int!, $after: String) {
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

export const ISSUE_QUERY = `
query RepoIssues($owner: String!, $name: String!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(
      first: $first
      after: $after
      states: OPEN
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        createdAt
        closedAt
        state
        comments { totalCount }
      }
    }
  }
  rateLimit { remaining resetAt }
}
`;
