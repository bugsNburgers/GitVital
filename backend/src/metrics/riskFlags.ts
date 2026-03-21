// src/metrics/riskFlags.ts — PURE FUNCTION
// Input: all computed metrics object
// Output: RiskFlag[]
// No database calls. No API calls. No side effects.

import { AllMetrics, RiskFlag } from '../types';

/**
 * Prompt 8.3 Risk Flags Generator.
 * Implements the exact threshold rules from Guidesrc.
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

    // Contributor concentration
    if ((topContributorPct !== undefined && topContributorPct > 70) ||
        (topContributorPct !== undefined && topContributorPct > 50 && busFactor === 1)) {
        pushFlag({
            level: 'danger',
            title: 'CONTRIBUTOR CONCENTRATION RISK',
            detail: `Top contributor concentration is ${topContributorPct?.toFixed(2) ?? 'N/A'}%; ownership is highly concentrated.`,
        });
    }

    // PR slowdown
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

    // Activity decline
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

    // Issue backlog
    if (openIssueCount !== undefined && openIssueCount > 1000) {
        pushFlag({
            level: 'warning',
            title: 'LARGE ISSUE BACKLOG',
            detail: `Open issues: ${openIssueCount}.`,
        });
    }

    if (unrespondedIssuePct !== undefined && unrespondedIssuePct > 60) {
        pushFlag({
            level: 'warning',
            title: 'ISSUES GOING UNACKNOWLEDGED',
            detail: `${unrespondedIssuePct.toFixed(2)}% of open issues have no comments.`,
        });
    }

    // Positive flags
    if (busFactor !== undefined && busFactor >= 5) {
        pushFlag({
            level: 'success',
            title: 'HEALTHY CONTRIBUTOR BASE',
            detail: `Bus factor is ${busFactor}.`,
        });
    }

    if (avgPRMergeDays !== undefined && avgPRMergeDays < 2) {
        pushFlag({
            level: 'success',
            title: 'FAST PR REVIEWS',
            detail: `Average PR merge time is ${avgPRMergeDays.toFixed(2)} days.`,
        });
    }

    if (velocityChange !== undefined && velocityChange > 20) {
        pushFlag({
            level: 'success',
            title: 'GROWING ACTIVITY',
            detail: `Commit velocity increased by ${velocityChange.toFixed(2)}%.`,
        });
    }

    return flags;
}
