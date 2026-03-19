export interface LeaderboardRepoEvidence {
    repoId: string;
    healthScore: number;
    stars: number;
    busFactor: number | null;
    isFork: boolean;
    isArchived: boolean;
    userCommitCount: number;
    verifiedFromGitHub: boolean;
}

export interface LeaderboardUserScoreInput {
    userId: string;
    username: string;
    previousDeveloperScore: number;
    previousScoreUpdatedAt: Date | null;
    repos: LeaderboardRepoEvidence[];
}

export interface ScoreComputationBreakdown {
    consideredRepos: number;
    ignoredRepos: number;
    weightedPoints: number;
    totalWeight: number;
}

export interface ScoreComputationResult {
    developerScore: number;
    breakdown: ScoreComputationBreakdown;
}

const SIGNIFICANT_CONTRIBUTION_MIN_COMMITS = 10;
const LOW_LEGITIMACY_TOY_REPO_STARS_THRESHOLD = 5;
const DAILY_REVIEW_DELTA_THRESHOLD = 20;

function clampScore(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(100, value));
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function isSignificantContributor(userCommitCount: number): boolean {
    return userCommitCount > SIGNIFICANT_CONTRIBUTION_MIN_COMMITS;
}

function getRepoLegitimacyWeight(repo: LeaderboardRepoEvidence): number {
    if (!repo.verifiedFromGitHub) {
        return 0;
    }

    if (!isSignificantContributor(repo.userCommitCount)) {
        return 0;
    }

    if (repo.isArchived) {
        return 0;
    }

    let weight = 1;

    if (repo.isFork) {
        weight *= 0.5;
    }

    if (repo.stars < LOW_LEGITIMACY_TOY_REPO_STARS_THRESHOLD && repo.busFactor === 1) {
        weight *= 0.5;
    }

    return weight;
}

export function computeDeveloperScoreFromVerifiedRepoMetrics(input: LeaderboardUserScoreInput): ScoreComputationResult {
    let weightedPoints = 0;
    let totalWeight = 0;
    let consideredRepos = 0;
    let ignoredRepos = 0;

    for (const repo of input.repos) {
        const weight = getRepoLegitimacyWeight(repo);
        if (weight <= 0) {
            ignoredRepos += 1;
            continue;
        }

        const repoScore = clampScore(repo.healthScore);
        weightedPoints += repoScore * weight;
        totalWeight += weight;
        consideredRepos += 1;
    }

    const developerScore = totalWeight > 0 ? round2(weightedPoints / totalWeight) : 0;

    return {
        developerScore,
        breakdown: {
            consideredRepos,
            ignoredRepos,
            weightedPoints: round2(weightedPoints),
            totalWeight: round2(totalWeight),
        },
    };
}

export function shouldFlagScoreChangeForManualReview(
    previousScore: number,
    nextScore: number,
    previousUpdatedAt: Date | null,
    now: Date,
): boolean {
    if (!previousUpdatedAt) {
        return false;
    }

    const sameUtcDay = previousUpdatedAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
    if (!sameUtcDay) {
        return false;
    }

    return Math.abs(nextScore - previousScore) > DAILY_REVIEW_DELTA_THRESHOLD;
}

export {
    DAILY_REVIEW_DELTA_THRESHOLD,
    SIGNIFICANT_CONTRIBUTION_MIN_COMMITS,
};
