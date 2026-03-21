// src/metrics/churnMetrics.ts — PURE FUNCTION
// Input: commits[] (CommitNode[])
// Output: ChurnMetricsResult
// No database calls. No API calls. No side effects.

import { CommitNode, ChurnMetricsResult } from '../types';

/**
 * Get ISO week key YYYY-Www for a date.
 */
function getISOWeekString(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Computes repo-level churn metrics from commit nodes.
 *
 * Steps:
 *   1. For each commit: churn = additions + deletions
 *   2. Group churn by week
 *   3. avg_weekly_churn = total_churn / weeks_analyzed
 *
 * Important:
 *   - Repo-level churn only
 *   - No file-level churn logic
 */
export function computeChurnMetrics(commits: CommitNode[]): ChurnMetricsResult {
    if (commits.length === 0) {
        return {
            churnScore: 0,
            avgWeeklyChurn: 0,
            totalChurn: 0,
        };
    }

    let totalChurn = 0;
    const weeklyChurn = new Map<string, number>();

    for (const commit of commits) {
        const additions = Number.isFinite(commit.additions) ? commit.additions : 0;
        const deletions = Number.isFinite(commit.deletions) ? commit.deletions : 0;
        const commitChurn = Math.max(0, additions) + Math.max(0, deletions);

        totalChurn += commitChurn;

        const weekKey = getISOWeekString(new Date(commit.committedDate));
        weeklyChurn.set(weekKey, (weeklyChurn.get(weekKey) || 0) + commitChurn);
    }

    const weeksAnalyzed = weeklyChurn.size;
    const avgWeeklyChurn = weeksAnalyzed > 0 ? parseFloat((totalChurn / weeksAnalyzed).toFixed(2)) : 0;

    return {
        churnScore: totalChurn,
        avgWeeklyChurn,
        totalChurn,
    };
}
