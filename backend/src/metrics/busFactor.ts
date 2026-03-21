// src/metrics/busFactor.ts — PURE FUNCTION
// Input:  commits[] (each has author.login)
// Output: BusFactorResult | null
// No database calls. No API calls. No side effects.

import { CommitNode, BusFactorResult } from '../types';

// Bot patterns from Prompt 6.1 — filter these BEFORE computing any metrics.
const BOT_PATTERNS: string[] = [
  'bot', 'dependabot', 'renovate', 'github-actions', '[bot]',
  'greenkeeper', 'snyk-bot', 'codecov', 'netlify', 'vercel',
  'semantic-release', 'release-please',
];

/**
 * Returns true if the login matches any known bot pattern (case-insensitive).
 */
function isBot(login: string): boolean {
  const lower = login.toLowerCase();
  return BOT_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Compute bus factor from raw commit data.
 *
 * Steps:
 *   1. Filter out bots
 *   2. Count commits per unique author
 *   3. Sort descending by count
 *   4. Walk list, accumulate % of total
 *   5. Bus factor = number of devs to reach 50%
 *
 * Edge cases:
 *   - All commits by 1 person → busFactor = 1, topContributorPct = 100
 *   - Multiple authors tied at exactly 50% threshold → include all tied authors
 *   - Zero commits after bot filtering → return null
 */
export function computeBusFactor(commits: CommitNode[]): BusFactorResult | null {
  // Step 1: Filter out bots and commits with no identifiable author
  const humanCommits = commits.filter((c) => {
    const login = c.author?.user?.login;
    if (!login) return false; // no login → skip (ghost / deleted user)
    return !isBot(login);
  });

  // Prompt 6.1: Log how many bots were filtered
  const filteredCount = commits.length - humanCommits.length;
  if (filteredCount > 0) {
    console.log(`[busFactor] Filtered ${filteredCount} bot commits out of ${commits.length} total`);
  }

  // Edge case: zero commits after bot filtering → return null
  if (humanCommits.length === 0) {
    return null;
  }

  // Step 2: Count commits per unique author
  const countMap = new Map<string, number>();
  for (const commit of humanCommits) {
    const login = commit.author.user!.login; // safe — we filtered nulls above
    countMap.set(login, (countMap.get(login) || 0) + 1);
  }

  const totalCommits = humanCommits.length;

  // Build list of { login, count, pct }
  const contributors = Array.from(countMap.entries()).map(([login, count]) => ({
    login,
    count,
    pct: parseFloat(((count / totalCommits) * 100).toFixed(2)),
  }));

  // Step 3: Sort descending by count
  contributors.sort((a, b) => b.count - a.count);

  // Top contributor percentage
  const topContributorPct = contributors[0].pct;

  // Step 4 & 5: Walk list, accumulate % of total until we reach 50%
  let accumulated = 0;
  let busFactor = 0;

  for (let i = 0; i < contributors.length; i++) {
    accumulated += contributors[i].pct;
    busFactor++;

    // Check if we've reached the 50% threshold
    if (accumulated >= 50) {
      // Edge case: Multiple authors tied at exactly 50% threshold → include all tied authors
      // Look ahead for any authors with the same count as the last one we added
      const lastCount = contributors[i].count;
      while (i + 1 < contributors.length && contributors[i + 1].count === lastCount) {
        i++;
        busFactor++;
        accumulated += contributors[i].pct;
      }
      break;
    }
  }

  return {
    busFactor,
    topContributorPct,
    contributors,
  };
}
