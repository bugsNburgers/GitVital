import type { AllMetrics } from '../types';

function formatNumber(value: number | undefined): string {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return 'unknown';
    }
    return value.toFixed(1);
}

export function generateRuleBasedAdvice(metrics: AllMetrics): string {
    const score = metrics.healthScore;
    const prDays = metrics.prMetrics?.avgMergeDays;
    const topContributor = metrics.busFactor?.topContributorPct;
    const openIssues = metrics.issueMetrics?.openIssueCount;

    if (score < 40) {
        return `Repository health is currently weak (${formatNumber(score)}/100), so prioritize stabilizing review flow and contributor coverage first. Focus next on reducing PR turnaround (${formatNumber(prDays)} days) and lowering contributor concentration (${formatNumber(topContributor)}%) to reduce delivery risk.`;
    }

    if (score < 70) {
        return `Repository health is moderate (${formatNumber(score)}/100) with room to improve operational consistency. Improve merge responsiveness (${formatNumber(prDays)} days) and backlog pressure (${formatNumber(openIssues)} open issues) to move this project into a healthier range.`;
    }

    return `Repository health is strong (${formatNumber(score)}/100), so protect momentum by maintaining review speed and contributor diversity. Keep issue triage disciplined (${formatNumber(openIssues)} open issues) to preserve reliability as activity scales.`;
}
