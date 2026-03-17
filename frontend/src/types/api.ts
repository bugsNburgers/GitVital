// src/types/api.ts — Readonly response types mirroring backend AllMetrics

export interface ReadonlyCommitNode {
  readonly committedDate: string;
  readonly additions: number;
  readonly deletions: number;
  readonly author: {
    readonly user: { readonly login: string } | null;
    readonly name: string;
  };
}

export interface ReadonlyPRNode {
  readonly createdAt: string;
  readonly mergedAt: string | null;
  readonly closedAt: string | null;
  readonly author: { readonly login: string } | null;
  readonly reviews: { readonly totalCount: number };
}

export interface ReadonlyIssueNode {
  readonly createdAt: string;
  readonly closedAt: string | null;
  readonly state: 'OPEN' | 'CLOSED';
  readonly comments: { readonly totalCount: number };
}

export interface ReadonlyRateLimit {
  readonly remaining: number;
  readonly resetAt: string;
}

export type ReadonlyRiskLevel = 'danger' | 'warning' | 'success' | 'info';

export interface ReadonlyRiskFlag {
  readonly level: ReadonlyRiskLevel;
  readonly title: string;
  readonly detail: string;
}

export interface ReadonlyBusFactorResult {
  readonly busFactor: number;
  readonly topContributorPct: number;
  readonly contributors: ReadonlyArray<{ readonly login: string; readonly count: number; readonly pct: number }>;
}

export interface ReadonlyPRMetricsResult {
  readonly avgMergeHrs: number;
  readonly medianMergeHrs: number;
  readonly p90MergeHrs: number;
  readonly totalPRs: number;
  readonly avgMergeDays: number;
}

export interface ReadonlyActivityMetricsResult {
  readonly velocityChange: number;
  readonly commitsLast30Days: number;
  readonly weeklyBreakdown: ReadonlyArray<{ readonly week: string; readonly count: number }>;
  readonly totalWeeksActive: number;
}

export interface ReadonlyIssueMetricsResult {
  readonly openIssueCount: number;
  readonly avgIssueAgeDays: number;
  readonly unrespondedIssuePct: number;
}

export interface ReadonlyChurnMetricsResult {
  readonly churnScore: number;
  readonly avgWeeklyChurn: number;
  readonly totalChurn: number;
}

export interface ReadonlyAllMetrics {
  readonly busFactor: ReadonlyBusFactorResult | null;
  readonly prMetrics: ReadonlyPRMetricsResult | null;
  readonly activityMetrics: ReadonlyActivityMetricsResult | null;
  readonly issueMetrics: ReadonlyIssueMetricsResult | null;
  readonly churnMetrics: ReadonlyChurnMetricsResult | null;
  readonly healthScore: number;
  readonly riskFlags: ReadonlyArray<ReadonlyRiskFlag>;
  readonly aiAdvice: string | null;
}

export interface ReadonlyJobData {
  readonly owner: string;
  readonly repo: string;
  readonly userId?: string;
}

export type ReadonlyJobStatus = 'queued' | 'processing' | 'done' | 'failed';
