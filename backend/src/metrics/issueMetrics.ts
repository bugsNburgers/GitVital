// src/metrics/issueMetrics.ts — PURE FUNCTION
// Input: issues[] (IssueNode[])
// Output: IssueMetricsResult | null
// No database calls. No API calls. No side effects.

import { IssueNode, IssueMetricsResult } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Computes issue backlog metrics from issue nodes.
 *
 * Steps:
 *   1. Count total open issues (state = OPEN)
 *   2. Compute avg_issue_age_days = avg(today - createdAt) for all open issues
 *   3. Compute unresponded_pct = (open issues with comments.totalCount == 0) / total_open * 100
 *
 * Edge cases:
 *   - Zero issues => return null
 *   - Repos using issues as roadmap => return raw numbers without extra normalization
 */
export function computeIssueMetrics(issues: IssueNode[]): IssueMetricsResult | null {
    if (issues.length === 0) {
        return null;
    }

    const openIssues = issues.filter((issue) => issue.state === 'OPEN');
    const openIssueCount = openIssues.length;

    if (openIssueCount === 0) {
        return {
            openIssueCount: 0,
            avgIssueAgeDays: 0,
            unrespondedIssuePct: 0,
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
    };
}
