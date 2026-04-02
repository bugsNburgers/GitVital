// frontend/src/components/metricDefinitions.ts
// Central registry of all metric definitions used by InfoTooltip.

export interface MetricDefinition {
  name: string;
  description: string;
  calculation: string;
}

export const METRIC_INFO: Record<string, MetricDefinition> = {
  healthScore: {
    name: 'Health Score',
    description:
      'Composite score reflecting overall repository health across 6 dimensions.',
    calculation:
      'Weighted average: Activity (28%) + Contributors (22%) + PR Speed (22%) + Issues (18%) + Churn (10%). Each sub-score is normalized 0-100 using logarithmic scaling.',
  },

  busFactor: {
    name: 'Bus Factor',
    description:
      'Minimum number of key contributors who, if they left, would stall the project.',
    calculation:
      'Count contributors needed to reach 50% of total commits (bots filtered out). Higher = more resilient.',
  },

  topContributorPct: {
    name: 'Top Contributor %',
    description:
      'Percentage of commits from the single most active contributor.',
    calculation:
      'Commits by top author / total human commits × 100. Lower = healthier distribution.',
  },

  commitsLast30Days: {
    name: 'Commits (30d)',
    description: 'Total commits pushed in the last 30 days.',
    calculation: 'Counted from commit timestamps. Reflects current development pace.',
  },

  velocityChange: {
    name: 'Velocity Change',
    description:
      'How commit activity is trending compared to the previous month.',
    calculation:
      '((avg commits/week last 4 weeks) - (avg commits/week weeks 5-8)) / (avg weeks 5-8) × 100.',
  },

  avgMergeDays: {
    name: 'Avg PR Merge Time',
    description: 'Average time from PR creation to merge, in days.',
    calculation:
      'Only counts merged PRs from last 12 months. Excludes outliers (>180 days) and negative merge times.',
  },

  medianMergeHrs: {
    name: 'Median PR Merge Time',
    description: 'Middle value of all PR merge times, in hours.',
    calculation:
      'Less affected by outliers than the average. Good indicator of typical review speed.',
  },

  totalPRs: {
    name: 'Total PRs Analyzed',
    description: 'Number of merged PRs included in the analysis.',
    calculation:
      'Merged PRs from last 12 months, up to 500. Minimum 10 required for PR metrics.',
  },

  openIssueCount: {
    name: 'Open Issues',
    description: 'Current number of open issues in the repository.',
    calculation:
      'Fetched from GitHub. High count isn\'t always bad — large active projects naturally have more.',
  },

  avgIssueAgeDays: {
    name: 'Avg Issue Age',
    description: 'Average age of currently open issues, in days.',
    calculation:
      'Sum of (today - createdAt) for all open issues / count. Older = potentially stale backlog.',
  },

  unrespondedIssuePct: {
    name: 'Unresponded Issues %',
    description: 'Percentage of open issues with zero comments.',
    calculation:
      'Issues with 0 comments / total open issues × 100. Indicates maintainer responsiveness.',
  },

  churnScore: {
    name: 'Code Churn',
    description: 'Total lines added + deleted across all analyzed commits.',
    calculation:
      'High churn with high commits = active development. High churn with few commits = potential rework.',
  },

  avgWeeklyChurn: {
    name: 'Avg Weekly Churn',
    description: 'Average lines changed per week across the analysis period.',
    calculation:
      'Total churn / weeks analyzed. Normalized by commit volume in the health score.',
  },

  closedIssueCount: {
    name: 'Closed Issues',
    description: 'Number of issues that have been resolved and closed.',
    calculation:
      'Higher closed-to-open ratio indicates good issue triage and resolution.',
  },

  communityScore: {
    name: 'Community Score',
    description: 'How engaged and healthy the community around this repo is.',
    calculation:
      'Based on: stars-to-forks ratio (30%), PR review engagement (35%), issue response rate (35%).',
  },

  developerScore: {
    name: 'Developer Score',
    description:
      "Composite score reflecting a developer's overall GitHub presence and quality.",
    calculation:
      'Repo health scores (70%) + external contribution activity (20%) + social reach (10%).',
  },

  reliabilityPct: {
    name: 'Reliability %',
    description:
      'How confident we are in the developer score accuracy.',
    calculation:
      'Base 55% + 7% per analyzed repo (max 6) + 12% if contribution data is available.',
  },
};
