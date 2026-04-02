// src/types/index.ts — the single source of truth for all data shapes

export interface CommitNode {
  committedDate: string;
  additions: number;
  deletions: number;
  author: {
    user: { login: string } | null;
    name: string;
  };
}

export interface PRNode {
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  author: { login: string } | null;
  reviews: { totalCount: number };
}

export interface IssueNode {
  createdAt: string;
  closedAt: string | null;
  state: 'OPEN' | 'CLOSED';
  comments: { totalCount: number };
  title: string;
  url: string;
  labels: { nodes: { name: string }[] };
}

export interface IssueLabelBreakdown {
  label: string;
  count: number;
  githubFilterUrl: string;
}

export interface RateLimit {
  remaining: number;
  resetAt: string;
}

export interface RepoMetadata {
  exists: boolean;
  isPrivate: boolean;
  isArchived: boolean;
  isFork: boolean;
  hasDefaultBranch: boolean;
  stars: number;
  forks: number;
  language: string | null;
  totalCommitCount: number;
}

export type RiskLevel = 'danger' | 'warning' | 'success' | 'info';

export interface RiskFlag {
  level: RiskLevel;
  title: string;
  detail: string;
}

export interface BusFactorResult {
  busFactor: number;
  topContributorPct: number;
  contributors: Array<{ login: string; count: number; pct: number }>;
}

export interface PRMetricsResult {
  avgMergeHrs: number;
  medianMergeHrs: number;
  p90MergeHrs: number;
  totalPRs: number;
  avgMergeDays: number;
}

export interface ActivityMetricsResult {
  velocityChange: number;
  commitsLast30Days: number;
  weeklyBreakdown: Array<{ week: string; count: number }>;
  totalWeeksActive: number;
}

export interface IssueMetricsResult {
  openIssueCount: number;
  avgIssueAgeDays: number;
  unrespondedIssuePct: number;
  closedIssueCount: number;
  totalIssueCount: number;
  labelBreakdown: IssueLabelBreakdown[];
}

export interface ChurnMetricsResult {
  churnScore: number;
  avgWeeklyChurn: number;
  totalChurn: number;
}

export interface TimelineEntry {
  period: string;
  healthScore: number;
  commitCount: number;
  prCount: number;
}

export interface AllMetrics {
  busFactor: BusFactorResult | null;
  prMetrics: PRMetricsResult | null;
  activityMetrics: ActivityMetricsResult | null;
  issueMetrics: IssueMetricsResult | null;
  churnMetrics: ChurnMetricsResult | null;
  healthScore: number;
  riskFlags: RiskFlag[];
  aiAdvice: string | null;
  aiAdviceSource?: 'gemini' | 'rule-based';
  aiAdviceModel?: string | null;
}

export interface JobData {
  owner: string;
  repo: string;
  userId?: string;
  forceFallbackAdvice?: boolean;
}

export interface UserMergedPRNode {
  createdAt: string;
  mergedAt: string | null;
  author: { login: string } | null;
  repository: {
    owner: { login: string } | null;
  };
}

export interface UserContributionMetrics {
  externalPRCount: number;
  externalMergedPRCount: number;
  contributionAcceptanceRate: number;
}

export interface UserJobData {
  username: string;
}

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';
