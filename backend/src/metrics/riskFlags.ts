// src/metrics/riskFlags.ts — PURE FUNCTION
// Input: all computed metrics object (AllMetrics, which now carries metadata)
// Output: RiskFlag[]
// No database calls. No API calls. No side effects.

import { AllMetrics, RiskFlag } from '../types';

/**
 * Risk Flags Generator.
 * Uses relative/ratio-based thresholds so large repos aren't unfairly penalized.
 */
export function generateRiskFlags(metrics: AllMetrics): RiskFlag[] {
  const flags: RiskFlag[] = [];

  const pushFlag = (flag: RiskFlag): void => {
    const exists = flags.some((f) => f.level === flag.level && f.title === flag.title);
    if (!exists) {
      flags.push(flag);
    }
  };

  const topContributorPct = metrics.busFactor?.topContributorPct;
  const busFactor = metrics.busFactor?.busFactor;
  const avgPRMergeDays = metrics.prMetrics?.avgMergeDays;
  const velocityChange = metrics.activityMetrics?.velocityChange;
  const openIssueCount = metrics.issueMetrics?.openIssueCount;
  const unrespondedIssuePct = metrics.issueMetrics?.unrespondedIssuePct;
  const closedIssueCount = metrics.issueMetrics?.closedIssueCount;
  const totalIssueCount = metrics.issueMetrics?.totalIssueCount;
  const stars = metrics.metadata?.stars ?? 0;

  // ── Contributor concentration ──
  if (
    (topContributorPct !== undefined && topContributorPct > 70) ||
    (topContributorPct !== undefined && topContributorPct > 50 && busFactor === 1)
  ) {
    pushFlag({
      level: 'danger',
      title: 'CONTRIBUTOR CONCENTRATION RISK',
      detail: `Top contributor concentration is ${topContributorPct?.toFixed(2) ?? 'N/A'}%; ownership is highly concentrated.`,
    });
  }

  // ── PR slowdown ──
  if (avgPRMergeDays !== undefined) {
    if (avgPRMergeDays > 14) {
      pushFlag({
        level: 'danger',
        title: 'PR REVIEW SEVERELY DELAYED',
        detail: `Average PR merge time is ${avgPRMergeDays.toFixed(2)} days.`,
      });
    } else if (avgPRMergeDays > 7) {
      pushFlag({
        level: 'warning',
        title: 'PR RESPONSE SLOW',
        detail: `Average PR merge time is ${avgPRMergeDays.toFixed(2)} days.`,
      });
    }
  }

  // ── Activity decline ──
  if (velocityChange !== undefined) {
    if (velocityChange < -40) {
      pushFlag({
        level: 'danger',
        title: 'ACTIVITY DECLINING SHARPLY',
        detail: `Commit velocity changed by ${velocityChange.toFixed(2)}%.`,
      });
    } else if (velocityChange < -20) {
      pushFlag({
        level: 'warning',
        title: 'SLOWING MOMENTUM',
        detail: `Commit velocity changed by ${velocityChange.toFixed(2)}%.`,
      });
    }
  }

  // ── Issue backlog — ratio-based so large repos aren't penalised ──
  if (
    openIssueCount !== undefined &&
    openIssueCount > 500 &&
    openIssueCount / Math.max(stars, 100) > 0.5
  ) {
    pushFlag({
      level: 'warning',
      title: 'LARGE ISSUE BACKLOG',
      detail: `Open issues: ${openIssueCount} (${((openIssueCount / Math.max(stars, 100)) * 100).toFixed(1)}% of star count).`,
    });
  }

  // ── Unresponded issues ──
  if (unrespondedIssuePct !== undefined && unrespondedIssuePct > 60) {
    pushFlag({
      level: 'warning',
      title: 'ISSUES GOING UNACKNOWLEDGED',
      detail: `${unrespondedIssuePct.toFixed(2)}% of open issues have no comments.`,
    });
  }

  // ── Positive flags ──

  // Healthy contributor base
  if (busFactor !== undefined && busFactor >= 5) {
    pushFlag({
      level: 'success',
      title: 'HEALTHY CONTRIBUTOR BASE',
      detail: `Bus factor is ${busFactor}.`,
    });
  }

  // Fast PR reviews
  if (avgPRMergeDays !== undefined && avgPRMergeDays < 2) {
    pushFlag({
      level: 'success',
      title: 'FAST PR REVIEWS',
      detail: `Average PR merge time is ${avgPRMergeDays.toFixed(2)} days.`,
    });
  }

  // Growing activity
  if (velocityChange !== undefined && velocityChange > 20) {
    pushFlag({
      level: 'success',
      title: 'GROWING ACTIVITY',
      detail: `Commit velocity increased by ${velocityChange.toFixed(2)}%.`,
    });
  }

  // Good issue resolution (≥ 80% closed)
  if (
    closedIssueCount !== undefined &&
    totalIssueCount !== undefined &&
    totalIssueCount > 0 &&
    closedIssueCount / totalIssueCount > 0.8
  ) {
    const resolutionPct = ((closedIssueCount / totalIssueCount) * 100).toFixed(1);
    pushFlag({
      level: 'success',
      title: 'GOOD ISSUE RESOLUTION',
      detail: `${resolutionPct}% of all issues have been closed (${closedIssueCount} closed / ${totalIssueCount} total).`,
    });
  }

  // Strong community
  if (metrics.communityMetrics !== undefined && metrics.communityMetrics !== null) {
    const { communityScore, avgReviewsPerPR } = metrics.communityMetrics;

    if (communityScore >= 70) {
      pushFlag({
        level: 'success',
        title: 'STRONG COMMUNITY',
        detail: `Community health score is ${communityScore}/100.`,
      });
    } else if (communityScore >= 40 && avgReviewsPerPR >= 1) {
      pushFlag({
        level: 'success',
        title: 'ACTIVE CODE REVIEW',
        detail: `Average ${avgReviewsPerPR.toFixed(1)} reviews per PR — solid review culture.`,
      });
    }
  }

  return flags;
}
