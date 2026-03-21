// src/metrics/healthScore.ts — PURE FUNCTION
// Input:  { activityMetrics, contributorMetrics (BusFactorResult), prMetrics, issueMetrics, churnMetrics }
// Output: number (0-100, 1 decimal place)
// No database calls. No API calls. No side effects.

import {
  ActivityMetricsResult,
  BusFactorResult,
  PRMetricsResult,
  IssueMetricsResult,
  ChurnMetricsResult,
} from '../types';

/**
 * Input shape for the health score computation.
 * Uses Partial-like optional fields to allow null sub-metrics.
 */
export interface HealthScoreInput {
  activityMetrics: ActivityMetricsResult | null;
  contributorMetrics: BusFactorResult | null;
  prMetrics: PRMetricsResult | null;
  issueMetrics: IssueMetricsResult | null;
  churnMetrics: ChurnMetricsResult | null;
}

/**
 * Base weights for each sub-score (must sum to 1.0).
 */
const BASE_WEIGHTS = {
  activity: 0.30,
  contributor: 0.25,
  pr: 0.20,
  issue: 0.15,
  churn: 0.10,
} as const;

/**
 * Normalize activity to 0-100.
 * Formula: min(commits_last_30_days / 30, 1) * 100, modified by velocity.
 * Velocity modifier: clamp velocity_change to [-50, 50] and shift score ±10%.
 */
function computeActivityScore(metrics: ActivityMetricsResult): number {
  const baseScore = Math.min(metrics.commitsLast30Days / 30, 1) * 100;

  // Modify by velocity: clamp to [-50, 50] range, then scale to ±10 points
  const clampedVelocity = Math.max(-50, Math.min(50, metrics.velocityChange));
  const velocityModifier = (clampedVelocity / 50) * 10; // -10 to +10

  return Math.max(0, Math.min(100, baseScore + velocityModifier));
}

/**
 * Normalize contributor diversity to 0-100.
 * Formula: (1 - topContributorPct/100) * 100
 * 100% by one person → 0 score. Evenly distributed → high score.
 */
function computeContributorScore(metrics: BusFactorResult): number {
  return (1 - metrics.topContributorPct / 100) * 100;
}

/**
 * Normalize PR merge speed to 0-100.
 * Tiered by average merge time in DAYS:
 *   < 1 day  = 100
 *   < 3 days = 85
 *   < 7 days = 65
 *   < 14 days = 40
 *   >= 14 days = 15
 */
function computePRScore(metrics: PRMetricsResult): number {
  const days = metrics.avgMergeDays;
  if (days < 1) return 100;
  if (days < 3) return 85;
  if (days < 7) return 65;
  if (days < 14) return 40;
  return 15;
}

/**
 * Normalize issue health to 0-100.
 * Formula: max(0, 100 - (openIssues / 10))
 * 0 open issues → 100. 1000 open issues → 0.
 */
function computeIssueScore(metrics: IssueMetricsResult): number {
  return Math.max(0, 100 - (metrics.openIssueCount / 10));
}

/**
 * Normalize code churn to 0-100.
 * Formula: max(0, 100 - (avgWeeklyChurn / 100))
 * Low churn → high score. Very high churn → low score.
 */
function computeChurnScore(metrics: ChurnMetricsResult): number {
  return Math.max(0, 100 - (metrics.avgWeeklyChurn / 100));
}

/**
 * Compute the composite health score.
 *
 * Formula:
 *   health = (activity * 0.30) + (contributor * 0.25) + (pr * 0.20) + (issue * 0.15) + (churn * 0.10)
 *
 * If any sub-metric is null (insufficient data):
 *   - Redistribute its weight proportionally to remaining metrics
 *   - Example: if PR metrics null (weight 0.20), redistribute:
 *     activity gets 0.30 + (0.30/0.80 * 0.20) = 0.375, etc.
 *
 * Final score: clamp to [0, 100], round to 1 decimal place.
 */
export function computeHealthScore(input: HealthScoreInput): number {
  // Build pairs of [score, baseWeight] for each non-null sub-metric
  const scorePairs: Array<{ score: number; baseWeight: number }> = [];

  if (input.activityMetrics !== null) {
    scorePairs.push({
      score: computeActivityScore(input.activityMetrics),
      baseWeight: BASE_WEIGHTS.activity,
    });
  }

  if (input.contributorMetrics !== null) {
    scorePairs.push({
      score: computeContributorScore(input.contributorMetrics),
      baseWeight: BASE_WEIGHTS.contributor,
    });
  }

  if (input.prMetrics !== null) {
    scorePairs.push({
      score: computePRScore(input.prMetrics),
      baseWeight: BASE_WEIGHTS.pr,
    });
  }

  if (input.issueMetrics !== null) {
    scorePairs.push({
      score: computeIssueScore(input.issueMetrics),
      baseWeight: BASE_WEIGHTS.issue,
    });
  }

  if (input.churnMetrics !== null) {
    scorePairs.push({
      score: computeChurnScore(input.churnMetrics),
      baseWeight: BASE_WEIGHTS.churn,
    });
  }

  // Edge case: all sub-metrics are null → return 0
  if (scorePairs.length === 0) {
    return 0;
  }

  // Redistribute weights proportionally among non-null metrics.
  // Sum of base weights for available metrics:
  const availableWeightSum = scorePairs.reduce((sum, p) => sum + p.baseWeight, 0);

  // Compute the weighted health score with redistributed weights.
  // Each metric's effective weight = baseWeight / availableWeightSum
  // (This proportionally distributes the missing weight.)
  let health = 0;
  for (const pair of scorePairs) {
    const effectiveWeight = pair.baseWeight / availableWeightSum;
    health += pair.score * effectiveWeight;
  }

  // Clamp to [0, 100] and round to 1 decimal place
  health = Math.max(0, Math.min(100, health));
  health = parseFloat(health.toFixed(1));

  return health;
}
