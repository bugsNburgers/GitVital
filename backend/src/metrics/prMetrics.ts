// src/metrics/prMetrics.ts — PURE FUNCTION
// Input:  prs[] (each has createdAt, mergedAt)
// Output: PRMetricsResult | null
// No database calls. No API calls. No side effects.

import { PRNode, PRMetricsResult } from '../types';

/**
 * Compute PR merge time statistics from raw PR data.
 *
 * Steps:
 *   1. Filter: only PRs where mergedAt exists AND mergedAt is within 12 months
 *   2. Filter: exclude PRs with merge time > 180 days (stale outliers)
 *   3. Compute merge_hours = (mergedAt - createdAt) / 3600000 for each
 *   4. Sort merge_hours ascending
 *   5. avg = mean(merge_hours)
 *   6. median = merge_hours[floor(length / 2)]
 *   7. p90 = merge_hours[floor(length * 0.9)]
 *
 * Edge cases:
 *   - < 10 PRs after filtering → return null (insufficient data)
 *   - Negative merge time (data corruption) → filter out, log warning
 */
export function computePRMetrics(prs: PRNode[]): PRMetricsResult | null {
  const now = new Date();
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const MS_PER_HOUR = 3600000;
  const MAX_MERGE_HOURS = 180 * 24; // 180 days in hours (stale outlier threshold)

  // Step 1: Filter — only merged PRs within last 12 months
  const mergedRecent = prs.filter((pr) => {
    if (!pr.mergedAt) return false;
    const mergedDate = new Date(pr.mergedAt);
    return mergedDate >= twelveMonthsAgo;
  });

  // Steps 2 & 3: Compute merge_hours, filter out stale outliers & negative merge times
  const mergeHours: number[] = [];

  for (const pr of mergedRecent) {
    const created = new Date(pr.createdAt).getTime();
    const merged = new Date(pr.mergedAt!).getTime();
    const hours = (merged - created) / MS_PER_HOUR;

    // Edge case: negative merge time (data corruption) → filter out, log warning
    if (hours < 0) {
      console.warn(
        `[prMetrics] Negative merge time detected: PR created=${pr.createdAt}, merged=${pr.mergedAt}. Filtering out.`
      );
      continue;
    }

    // Step 2: Exclude PRs with merge time > 180 days (stale outliers)
    if (hours > MAX_MERGE_HOURS) {
      continue;
    }

    mergeHours.push(hours);
  }

  // Edge case: < 10 PRs → return null (insufficient data)
  if (mergeHours.length < 10) {
    return null;
  }

  // Step 4: Sort merge_hours ascending
  mergeHours.sort((a, b) => a - b);

  const length = mergeHours.length;

  // Step 5: avg = mean(merge_hours)
  const sum = mergeHours.reduce((acc, h) => acc + h, 0);
  const avgMergeHrs = parseFloat((sum / length).toFixed(2));

  // Step 6: median = merge_hours[floor(length / 2)]
  const medianMergeHrs = parseFloat(mergeHours[Math.floor(length / 2)].toFixed(2));

  // Step 7: p90 = merge_hours[floor(length * 0.9)]
  const p90MergeHrs = parseFloat(mergeHours[Math.floor(length * 0.9)].toFixed(2));

  // avgMergeDays = avgMergeHrs / 24
  const avgMergeDays = parseFloat((avgMergeHrs / 24).toFixed(2));

  return {
    avgMergeHrs,
    medianMergeHrs,
    p90MergeHrs,
    totalPRs: mergeHours.length,
    avgMergeDays,
  };
}
