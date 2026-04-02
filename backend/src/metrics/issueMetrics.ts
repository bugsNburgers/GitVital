// src/metrics/issueMetrics.ts — PURE FUNCTION
// Input: issues[] (IssueNode[]), owner, repo, closedIssueCount?
// Output: IssueMetricsResult | null
// No database calls. No API calls. No side effects.

import { IssueNode, IssueMetricsResult, IssueLabelBreakdown } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Computes issue backlog metrics from issue nodes.
 *
 * Steps:
 *   1. Count total open issues (state = OPEN)
 *   2. Compute avg_issue_age_days = avg(today - createdAt) for all open issues
 *   3. Compute unresponded_pct = (open issues with comments.totalCount == 0) / total_open * 100
 *   4. Build label breakdown: group open issues by label, generate GitHub filter URLs, return top 20
 *   5. Attach closedIssueCount and totalIssueCount
 *
 * Edge cases:
 *   - Zero issues => return null
 *   - Repos using issues as roadmap => return raw numbers without extra normalization
 *   - Issues with no labels => not counted in label breakdown
 */
export function computeIssueMetrics(
  issues: IssueNode[],
  owner: string,
  repo: string,
  closedIssueCount?: number,
): IssueMetricsResult | null {
  if (issues.length === 0) {
    return null;
  }

  const openIssues = issues.filter((issue) => issue.state === 'OPEN');
  const openIssueCount = openIssues.length;

  // ── Label breakdown ──
  // An issue can have multiple labels — count it under each one.
  const labelCounts = new Map<string, number>();
  for (const issue of openIssues) {
    for (const labelNode of issue.labels?.nodes ?? []) {
      if (labelNode.name) {
        labelCounts.set(labelNode.name, (labelCounts.get(labelNode.name) ?? 0) + 1);
      }
    }
  }

  const labelBreakdown: IssueLabelBreakdown[] = Array.from(labelCounts.entries())
    .sort((a, b) => b[1] - a[1])   // Sort by count descending
    .slice(0, 20)                   // Top 20 labels max
    .map(([label, count]) => ({
      label,
      count,
      githubFilterUrl: `https://github.com/${owner}/${repo}/issues?q=is%3Aopen+label%3A%22${encodeURIComponent(label)}%22`,
    }));

  // ── Counts ──
  const resolvedClosedCount = closedIssueCount ?? 0;
  const totalIssueCount = openIssueCount + resolvedClosedCount;

  if (openIssueCount === 0) {
    return {
      openIssueCount: 0,
      avgIssueAgeDays: 0,
      unrespondedIssuePct: 0,
      closedIssueCount: resolvedClosedCount,
      totalIssueCount,
      labelBreakdown,
    };
  }

  const nowMs = Date.now();

  let totalAgeDays = 0;
  let unrespondedCount = 0;

  for (const issue of openIssues) {
    const createdAtMs = new Date(issue.createdAt).getTime();
    const ageMs = nowMs - createdAtMs;
    const ageDays = ageMs > 0 ? ageMs / MS_PER_DAY : 0;
    totalAgeDays += ageDays;

    if ((issue.comments?.totalCount ?? 0) === 0) {
      unrespondedCount += 1;
    }
  }

  const avgIssueAgeDays = parseFloat((totalAgeDays / openIssueCount).toFixed(2));
  const unrespondedIssuePct = parseFloat(((unrespondedCount / openIssueCount) * 100).toFixed(2));

  return {
    openIssueCount,
    avgIssueAgeDays,
    unrespondedIssuePct,
    closedIssueCount: resolvedClosedCount,
    totalIssueCount,
    labelBreakdown,
  };
}
