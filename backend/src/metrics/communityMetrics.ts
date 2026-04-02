// src/metrics/communityMetrics.ts — PURE FUNCTION
// Input:  metadata, prMetrics, issueMetrics, prs[]
// Output: CommunityMetricsResult
// No database calls. No API calls. No side effects.

import {
  RepoMetadata,
  PRMetricsResult,
  IssueMetricsResult,
  PRNode,
  CommunityMetricsResult,
} from '../types';

/** Clamp a value to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute composite community health metrics.
 *
 * Components:
 *   - starsToForksRatio  = stars / max(forks, 1)         → signals genuine vs. automated interest
 *   - avgReviewsPerPR    = avg reviews.totalCount per PR  → signals code review culture
 *   - issueResponseScore = 100 - unrespondedIssuePct      → signals maintainer responsiveness
 *
 * communityScore formula:
 *   starsForkScore = min(starsToForksRatio / 5, 1) * 30   (ratio ≥ 5 earns full 30 pts)
 *   reviewScore    = min(avgReviewsPerPR / 3, 1) * 35     (≥ 3 reviews/PR earns full 35 pts)
 *   responseScore  = issueResponseScore * 0.35             (perfect response rate earns 35 pts)
 *   communityScore = clamp(starsForkScore + reviewScore + responseScore, 0, 100)
 */
export function computeCommunityMetrics(
  metadata: RepoMetadata,
  prMetrics: PRMetricsResult | null,
  issueMetrics: IssueMetricsResult | null,
  prs: PRNode[],
): CommunityMetricsResult {
  // ── Stars-to-forks ratio ──
  const starsToForksRatio = parseFloat(
    (metadata.stars / Math.max(metadata.forks, 1)).toFixed(2),
  );

  // ── Average reviews per merged PR ──
  const avgReviewsPerPR =
    prs.length > 0
      ? parseFloat(
          (prs.reduce((sum, pr) => sum + (pr.reviews?.totalCount ?? 0), 0) / prs.length).toFixed(2),
        )
      : 0;

  // ── Issue response score (default 75 when no issue data — neutral) ──
  const issueResponseScore =
    issueMetrics !== null ? 100 - issueMetrics.unrespondedIssuePct : 75;

  // ── Composite community score ──
  const starsForkScore = Math.min(starsToForksRatio / 5, 1) * 30;
  const reviewScore = Math.min(avgReviewsPerPR / 3, 1) * 35;
  const responseScore = issueResponseScore * 0.35;

  const communityScore = parseFloat(
    clamp(starsForkScore + reviewScore + responseScore, 0, 100).toFixed(1),
  );

  return {
    starsToForksRatio,
    avgReviewsPerPR,
    issueResponseScore,
    communityScore,
  };
}
