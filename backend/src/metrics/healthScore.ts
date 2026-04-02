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
  isArchived?: boolean;     // cap health score at 30 for archived repos
  stars?: number;           // Used by computeIssueScore for ratio-based scoring (default 0)
  commitsPerWeek?: number;  // Used by computeChurnScore for per-commit churn (default 0)
  contributorCount?: number; // Used by computeContributorScore for depth scoring (default 1)
}

/**
 * Base weights for each sub-score (must sum to 1.0).
 */
const BASE_WEIGHTS = {
  activity: 0.28,
  contributor: 0.22,
  pr: 0.22,
  issue: 0.18,
  churn: 0.10,
} as const;

/** Clamp a value to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalize activity to 0-100 using a log scale so large/active repos are not penalized.
 *
 * Formula:
 *   base = min(log10(commitsLast30Days + 1) / log10(200), 1) * 80
 *   velocityModifier = clamp(velocityChange, -50, 50) / 50 * 20
 *   return clamp(base + velocityModifier, 0, 100)
 *
 * A repo with 200+ commits/month hits the 80-point base ceiling.
 * The velocity modifier can shift the score up or down by up to 20 points.
 */
function computeActivityScore(metrics: ActivityMetricsResult): number {
  const base = Math.min(
    Math.log10(metrics.commitsLast30Days + 1) / Math.log10(200),
    1,
  ) * 80;

  const velocityModifier = clamp(metrics.velocityChange, -50, 50) / 50 * 20;

  return clamp(base + velocityModifier, 0, 100);
}

/**
 * Normalize contributor diversity + depth to 0-100.
 *
 * Formula:
 *   diversityScore = (1 - topContributorPct / 100) * 70
 *   depthScore     = min(log10(contributorCount + 1) / log10(50), 1) * 30
 *   return diversityScore + depthScore
 *
 * Diversity (70 pts): heavily penalizes single-contributor dominance.
 * Depth (30 pts): rewards having many contributors (log-scaled, caps at 50 contributors).
 */
function computeContributorScore(
  metrics: BusFactorResult,
  contributorCount: number,
): number {
  const diversityScore = (1 - metrics.topContributorPct / 100) * 70;
  const depthScore = Math.min(
    Math.log10(contributorCount + 1) / Math.log10(50),
    1,
  ) * 30;

  return diversityScore + depthScore;
}

/**
 * Normalize PR merge speed to 0-100.
 * Tiered by average merge time in DAYS:
 *   < 1 day   = 100
 *   < 3 days  = 85
 *   < 7 days  = 65
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
 * Normalize issue health to 0-100 using a ratio-based approach.
 * Rewards fast response, doesn't unfairly penalize large popular repos.
 *
 * Formula:
 *   issueRatio  = openIssueCount / max(stars, 100)
 *   ratioScore  = max(0, 100 - issueRatio * 500)
 *   responseScore = 100 - unrespondedIssuePct
 *   return ratioScore * 0.4 + responseScore * 0.6
 *
 * A repo with 1000 open issues but 100k stars has a ratio of 0.01 → ratioScore ≈ 95.
 */
function computeIssueScore(metrics: IssueMetricsResult, stars: number): number {
  const issueRatio = metrics.openIssueCount / Math.max(stars, 100);
  const ratioScore = Math.max(0, 100 - issueRatio * 500);
  const responseScore = 100 - metrics.unrespondedIssuePct;

  return ratioScore * 0.4 + responseScore * 0.6;
}

/**
 * Normalize code churn to 0-100 using per-commit churn, not raw churn.
 * Active development with proportional churn is not penalized.
 *
 * Formula:
 *   churnPerCommit = avgWeeklyChurn / max(commitsPerWeek, 1)
 *   return max(0, 100 - min(churnPerCommit / 50, 1) * 100)
 *
 * A repo churning 1000 lines/week but committing 20 times has churnPerCommit = 50 → score = 0.
 * A repo churning 100 lines/week committing 10 times has churnPerCommit = 10 → score = 80.
 */
function computeChurnScore(
  metrics: ChurnMetricsResult,
  commitsPerWeek: number,
): number {
  const churnPerCommit = metrics.avgWeeklyChurn / Math.max(commitsPerWeek, 1);
  return Math.max(0, 100 - Math.min(churnPerCommit / 50, 1) * 100);
}

/**
 * Compute the composite health score.
 *
 * Formula:
 *   health = (activity * 0.28) + (contributor * 0.22) + (pr * 0.22) + (issue * 0.18) + (churn * 0.10)
 *
 * If any sub-metric is null (insufficient data):
 *   - Redistribute its weight proportionally to remaining metrics
 *   - Example: if PR metrics null (weight 0.22), redistribute:
 *     activity gets 0.28 + (0.28/0.78 * 0.22) = ~0.359, etc.
 *
 * Special null overrides (Prompt 6.1):
 *   - PR null  → fixed score of 50 (neutral, do NOT penalize)
 *   - Issue null → fixed score of 75 (slightly positive — clean tracker)
 *   - All other nulls → redistribute weight proportionally
 *
 * Final score: clamp to [0, 100], round to 1 decimal place.
 * Archived repos: capped at 30.
 */
export function computeHealthScore(input: HealthScoreInput): number {
  // Resolve optional contextual parameters with safe defaults
  const stars = input.stars ?? 0;
  const commitsPerWeek = input.commitsPerWeek ?? 0;
  const contributorCount = input.contributorCount ?? 1;

  // Build pairs of [score, baseWeight] for each sub-metric.
  const scorePairs: Array<{ score: number; baseWeight: number }> = [];

  // ── Activity ──
  if (input.activityMetrics !== null) {
    scorePairs.push({
      score: computeActivityScore(input.activityMetrics),
      baseWeight: BASE_WEIGHTS.activity,
    });
  }

  // ── Contributor ──
  if (input.contributorMetrics !== null) {
    scorePairs.push({
      score: computeContributorScore(input.contributorMetrics, contributorCount),
      baseWeight: BASE_WEIGHTS.contributor,
    });
  }

  // ── PR: null → force score 50 (Prompt 6.1: "Do NOT penalize") ──
  if (input.prMetrics !== null) {
    scorePairs.push({
      score: computePRScore(input.prMetrics),
      baseWeight: BASE_WEIGHTS.pr,
    });
  } else {
    // Prompt 6.1: Repos with no PRs (< 10 merged PRs) → set PR sub-score to 50 (neutral)
    scorePairs.push({
      score: 50,
      baseWeight: BASE_WEIGHTS.pr,
    });
  }

  // ── Issue: null → force score 75 (Prompt 6.1: "slightly positive") ──
  if (input.issueMetrics !== null) {
    scorePairs.push({
      score: computeIssueScore(input.issueMetrics, stars),
      baseWeight: BASE_WEIGHTS.issue,
    });
  } else {
    // Prompt 6.1: Repos with no issues → set issue sub-score to 75
    scorePairs.push({
      score: 75,
      baseWeight: BASE_WEIGHTS.issue,
    });
  }

  // ── Churn ──
  if (input.churnMetrics !== null) {
    scorePairs.push({
      score: computeChurnScore(input.churnMetrics, commitsPerWeek),
      baseWeight: BASE_WEIGHTS.churn,
    });
  }

  // Edge case: all sub-metrics are null (only PR=50 and Issue=75 remain) → still compute
  if (scorePairs.length === 0) {
    return 0;
  }

  // Redistribute weights proportionally among available metrics.
  // PR and Issue always have entries (fixed scores when null),
  // so only Activity, Contributor, and Churn can be missing.
  const availableWeightSum = scorePairs.reduce((sum, p) => sum + p.baseWeight, 0);

  let health = 0;
  for (const pair of scorePairs) {
    const effectiveWeight = pair.baseWeight / availableWeightSum;
    health += pair.score * effectiveWeight;
  }

  // Clamp to [0, 100] and round to 1 decimal place
  health = Math.max(0, Math.min(100, health));
  health = parseFloat(health.toFixed(1));

  // Prompt 6.1: Archived repos → health score capped at 30
  if (input.isArchived) {
    health = Math.min(health, 30);
  }

  return health;
}
