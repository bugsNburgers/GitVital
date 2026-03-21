// src/metrics/timeline.ts — PURE FUNCTION
// Input: commits[] and prs[]
// Output: TimelineEntry[]
// No database calls. No API calls. No side effects.

import { CommitNode, PRNode, TimelineEntry } from '../types';

interface QuarterBucket {
    commitCount: number;
    prCount: number;
}

function getQuarterKey(date: Date): string {
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    return `${date.getUTCFullYear()}-Q${quarter}`;
}

/**
 * Computes quarterly timeline buckets from commit and PR activity.
 * healthScore is initialized to 0 and can be filled by caller logic.
 */
export function computeTimeline(commits: CommitNode[], prs: PRNode[]): TimelineEntry[] {
    const buckets = new Map<string, QuarterBucket>();

    for (const commit of commits) {
        const key = getQuarterKey(new Date(commit.committedDate));
        const bucket = buckets.get(key) ?? { commitCount: 0, prCount: 0 };
        bucket.commitCount += 1;
        buckets.set(key, bucket);
    }

    for (const pr of prs) {
        const referenceDate = pr.mergedAt ?? pr.createdAt;
        const key = getQuarterKey(new Date(referenceDate));
        const bucket = buckets.get(key) ?? { commitCount: 0, prCount: 0 };
        bucket.prCount += 1;
        buckets.set(key, bucket);
    }

    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, bucket]) => ({
            period,
            healthScore: 0,
            commitCount: bucket.commitCount,
            prCount: bucket.prCount,
        }));
}
