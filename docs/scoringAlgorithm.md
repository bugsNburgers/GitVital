# GitVital Internal Scoring Algorithm

This document describes the internal health scoring logic used by GitVital as implemented in:
- `backend/src/metrics/healthScore.ts`
- `backend/src/metrics/communityMetrics.ts`
- `backend/src/workers/repoAnalyzer.ts`

It is intended for internal engineering and validation only.

## 1. Overview

GitVital measures repository health across six dimensions:
1. Activity
2. Contributors
3. PR workflow
4. Issue handling
5. Churn
6. Community

The core health composite in `healthScore.ts` currently computes a weighted score from five sub-scores (Activity, Contributor, PR, Issue, Churn), while Community is computed independently in `communityMetrics.ts` and used as a first-class health signal in downstream analysis (risk flags, compare insights, AI prompts).

Key philosophy:
- Normalize across repository size using log/ratio scaling (to avoid penalizing large active repos).
- Prefer behavior quality over raw counts (for example, issue responsiveness over absolute issue volume).
- Keep partial-data repos scoreable using null-safe defaults and weight redistribution.

## 2. Sub-Score Formulas

### 2.1 Activity Score

#### Exact formula (from `computeActivityScore`)

Let:
- `commitsLast30Days = activityMetrics.commitsLast30Days`
- `velocityChange = activityMetrics.velocityChange`

Formula:

```text
base = min(log10(commitsLast30Days + 1) / log10(200), 1) * 80
velocityModifier = clamp(velocityChange, -50, 50) / 50 * 20
activityScore = clamp(base + velocityModifier, 0, 100)
```

#### Inputs and sources
- `commitsLast30Days`: `computeActivityMetrics(commits)` in `activityMetrics.ts`
- `velocityChange`: `computeActivityMetrics(commits)` in `activityMetrics.ts`

#### Rationale
- Log scale avoids hard saturation at small commit counts.
- Velocity contributes directional signal without overwhelming base activity.

#### Edge cases
- Very high activity: capped by `min(..., 1)` in base component.
- Extreme velocity spikes/drops: bounded to `[-50, 50]` before contribution.
- Final score always clamped to `[0, 100]`.

#### Example calculations
Assumptions by scenario:
- Small: `commitsLast30Days=10`, `velocityChange=+10`
- Medium: `commitsLast30Days=500`, `velocityChange=+15`
- Large: `commitsLast30Days=5000`, `velocityChange=+5`

```text
Small:
base = min(log10(11)/log10(200), 1) * 80 = 36.21
velocityModifier = 10/50*20 = 4
activityScore = 40.21

Medium:
base = min(log10(501)/log10(200), 1) * 80 = 80
velocityModifier = 15/50*20 = 6
activityScore = 86

Large:
base = min(log10(5001)/log10(200), 1) * 80 = 80
velocityModifier = 5/50*20 = 2
activityScore = 82
```

---

### 2.2 Contributor Score

#### Exact formula (from `computeContributorScore`)

Let:
- `topContributorPct = contributorMetrics.topContributorPct`
- `contributorCount = busFactor.contributors.length` (passed by worker)

```text
diversityScore = (1 - topContributorPct / 100) * 70
depthScore = min(log10(contributorCount + 1) / log10(50), 1) * 30
contributorScore = diversityScore + depthScore
```

#### Inputs and sources
- `topContributorPct`: `computeBusFactor(commits)` in `busFactor.ts`
- `contributorCount`: derived in `repoAnalyzer.ts` as `busFactor?.contributors.length ?? 1`

#### Rationale
- Diversity penalizes single-person ownership risk.
- Depth rewards broader contributor base with diminishing returns (log scale).

#### Edge cases
- Bot commits filtered before bus factor calculation.
- If no human commits after filtering, contributor metrics can be null.
- For null contributor metrics, this sub-score is excluded and its weight is redistributed.

#### Example calculations
Assumptions:
- Small: `topContributorPct=90`, `contributorCount=1`
- Medium: `topContributorPct=30`, `contributorCount=20`
- Large: `topContributorPct=12`, `contributorCount=150`

```text
Small:
diversityScore = (1 - 0.90)*70 = 7
depthScore = min(log10(2)/log10(50),1)*30 = 5.32
contributorScore = 12.32

Medium:
diversityScore = (1 - 0.30)*70 = 49
depthScore = min(log10(21)/log10(50),1)*30 = 23.35
contributorScore = 72.35

Large:
diversityScore = (1 - 0.12)*70 = 61.6
depthScore = min(log10(151)/log10(50),1)*30 = 30
contributorScore = 91.6
```

---

### 2.3 PR Score

#### Exact formula (from `computePRScore`)

Let:
- `days = prMetrics.avgMergeDays`

```text
if days < 1   => 100
if days < 3   => 85
if days < 7   => 65
if days < 14  => 40
otherwise     => 15
```

#### Inputs and sources
- `avgMergeDays`: `computePRMetrics(prs)` in `prMetrics.ts`

#### Rationale
- Tiered thresholds map engineering intuition (very fast, fast, moderate, slow, very slow).
- Easier to reason about than a noisy continuous function.

#### Edge cases
- If fewer than 10 merged PRs (after filtering), PR metrics return null.
- PR null is not penalized to zero; it is fixed to neutral score 50 (special rule).

#### Example calculations
Assumptions:
- Small: `avgMergeDays=12`
- Medium: `avgMergeDays=2.5`
- Large: `avgMergeDays=8.5`

```text
Small  => 40
Medium => 85
Large  => 40
```

---

### 2.4 Issue Score

#### Exact formula (from `computeIssueScore`)

Let:
- `openIssueCount = issueMetrics.openIssueCount`
- `unrespondedIssuePct = issueMetrics.unrespondedIssuePct`
- `stars = metadata.stars` (passed by worker)

```text
issueRatio = openIssueCount / max(stars, 100)
ratioScore = max(0, 100 - issueRatio * 500)
responseScore = 100 - unrespondedIssuePct
issueScore = ratioScore * 0.4 + responseScore * 0.6
```

#### Inputs and sources
- `openIssueCount`, `unrespondedIssuePct`: `computeIssueMetrics(issues, owner, repo, closedIssueCount)` in `issueMetrics.ts`
- `stars`: repository metadata from `fetchMetadata.ts`, passed in `repoAnalyzer.ts`

#### Rationale
- Uses ratio to stars as size normalization proxy.
- Puts stronger emphasis on response behavior (60%) vs raw backlog ratio (40%).

#### Edge cases
- Stars floor at 100 prevents over-penalizing tiny repos.
- Score floor at 0 via `max(0, ...)`.
- If issue metrics are null, issue score is fixed at 75 (slightly positive default).

#### Example calculations
Assumptions:
- Small: `openIssueCount=12`, `stars=5`, `unrespondedIssuePct=40`
- Medium: `openIssueCount=180`, `stars=2000`, `unrespondedIssuePct=15`
- Large: `openIssueCount=4500`, `stars=50000`, `unrespondedIssuePct=22`

```text
Small:
issueRatio = 12/max(5,100) = 0.12
ratioScore = 100 - 0.12*500 = 40
responseScore = 60
issueScore = 40*0.4 + 60*0.6 = 52

Medium:
issueRatio = 180/2000 = 0.09
ratioScore = 55
responseScore = 85
issueScore = 55*0.4 + 85*0.6 = 73

Large:
issueRatio = 4500/50000 = 0.09
ratioScore = 55
responseScore = 78
issueScore = 55*0.4 + 78*0.6 = 68.8
```

---

### 2.5 Churn Score

#### Exact formula (from `computeChurnScore`)

Let:
- `avgWeeklyChurn = churnMetrics.avgWeeklyChurn`
- `commitsPerWeek = activityMetrics.commitsLast30Days / 4.3` (passed by worker)

```text
churnPerCommit = avgWeeklyChurn / max(commitsPerWeek, 1)
churnScore = max(0, 100 - min(churnPerCommit / 50, 1) * 100)
```

#### Inputs and sources
- `avgWeeklyChurn`: `computeChurnMetrics(commits)` in `churnMetrics.ts`
- `commitsPerWeek`: derived in `repoAnalyzer.ts`

#### Rationale
- Normalizes churn by development throughput.
- Distinguishes healthy high-volume change from unstable rework patterns.

#### Edge cases
- `max(commitsPerWeek, 1)` avoids division by zero.
- `min(..., 1)` caps penalty.
- Final score is floored at 0.

#### Example calculations
Assumptions:
- Small: `avgWeeklyChurn=60`, `commitsPerWeek=10/4.3=2.33`
- Medium: `avgWeeklyChurn=2200`, `commitsPerWeek=500/4.3=116.28`
- Large: `avgWeeklyChurn=18000`, `commitsPerWeek=5000/4.3=1162.79`

```text
Small:
churnPerCommit = 60/2.33 = 25.8
churnScore = 100 - min(25.8/50,1)*100 = 48.4

Medium:
churnPerCommit = 2200/116.28 = 18.92
churnScore = 62.16

Large:
churnPerCommit = 18000/1162.79 = 15.48
churnScore = 69.04
```

---

### 2.6 Community Score

#### Exact formula (from `computeCommunityMetrics`)

Let:
- `starsToForksRatio = stars / max(forks, 1)`
- `avgReviewsPerPR = average(pr.reviews.totalCount)`
- `issueResponseScore = issueMetrics ? 100 - unrespondedIssuePct : 75`

```text
starsForkScore = min(starsToForksRatio / 5, 1) * 30
reviewScore = min(avgReviewsPerPR / 3, 1) * 35
responseScore = issueResponseScore * 0.35
communityScore = clamp(starsForkScore + reviewScore + responseScore, 0, 100)
```

#### Inputs and sources
- `stars`, `forks`: `RepoMetadata` from `fetchMetadata.ts`
- `avgReviewsPerPR`: computed from raw PR nodes in `communityMetrics.ts`
- `issueResponseScore`: derived from issue metrics

#### Rationale
- Blends social proof (`stars/forks`), review culture, and maintainer responsiveness.
- Complements core health dimensions with community behavior signal.

#### Edge cases
- Forks floor at 1 avoids division by zero.
- Missing issue metrics defaults responsiveness to 75.
- PR list empty => average reviews per PR defaults to 0.

#### Example calculations
Assumptions:
- Small: `stars=5`, `forks=2`, `avgReviewsPerPR=0.5`, `issueResponseScore=60`
- Medium: `stars=2000`, `forks=400`, `avgReviewsPerPR=2`, `issueResponseScore=85`
- Large: `stars=50000`, `forks=10000`, `avgReviewsPerPR=1.4`, `issueResponseScore=78`

```text
Small:
starsToForksRatio = 2.5 => starsForkScore = 15
reviewScore = (0.5/3)*35 = 5.83
responseScore = 60*0.35 = 21
communityScore = 41.8

Medium:
starsToForksRatio = 5 => starsForkScore = 30
reviewScore = (2/3)*35 = 23.33
responseScore = 85*0.35 = 29.75
communityScore = 83.1

Large:
starsToForksRatio = 5 => starsForkScore = 30
reviewScore = (1.4/3)*35 = 16.33
responseScore = 78*0.35 = 27.3
communityScore = 73.6
```

## 3. Weight Distribution

Current base weights (`BASE_WEIGHTS` in `healthScore.ts`):
- activity: `0.28`
- contributor: `0.22`
- pr: `0.22`
- issue: `0.18`
- churn: `0.10`

Rationale:
- Activity (0.28): strongest direct signal that a project is alive and evolving.
- Contributor (0.22): captures organizational resilience and bus-risk.
- PR (0.22): reflects review throughput and contribution friction.
- Issue (0.18): captures maintainer responsiveness and backlog health.
- Churn (0.10): meaningful but lowest weight because churn can be healthy during active iterations.

Note on community dimension:
- Community is currently computed and stored as `communityMetrics.communityScore` but not directly weighted in `computeHealthScore` yet.

## 4. Composite Score Calculation

### 4.1 Core composite formula

For available score components:

```text
healthScore = sum(score_i * effectiveWeight_i)
effectiveWeight_i = baseWeight_i / sum(available base weights)
```

Then:
- Clamp final score to `[0, 100]`
- Round to 1 decimal place

### 4.2 Null handling and redistribution

Implemented behavior:
- `prMetrics === null` -> PR score forced to `50` (neutral), weight retained
- `issueMetrics === null` -> Issue score forced to `75` (slightly positive), weight retained
- `activityMetrics`, `contributorMetrics`, `churnMetrics` null -> component omitted and weight redistributed across remaining components

Example redistribution (activity null, churn null):
- available base weights = `0.22 + 0.22 + 0.18 = 0.62`
- effective contributor weight = `0.22/0.62 = 35.48%`
- effective PR weight = `0.22/0.62 = 35.48%`
- effective issue weight = `0.18/0.62 = 29.03%`

### 4.3 Composite examples

Using the scenario scores from Section 2 (core five sub-scores only):

```text
Small: 40.21*0.28 + 12.32*0.22 + 40*0.22 + 52*0.18 + 48.4*0.10 = 37.0
Medium: 86*0.28 + 72.35*0.22 + 85*0.22 + 73*0.18 + 62.16*0.10 = 78.1
Large: 82*0.28 + 91.6*0.22 + 40*0.22 + 68.8*0.18 + 69.04*0.10 = 71.2
```

## 5. Special Rules

Special behavior implemented across scoring and worker pipeline:
- Archived repositories: final score capped at `30` (`isArchived` guard in `computeHealthScore`).
- Empty repositories: score forced to `0` in worker early return path (`!metadata.hasDefaultBranch`).
- PR null: fixed to `50` (neutral default).
- Issue null: fixed to `75` (slightly positive default).

Additional hardening:
- Data integrity guard clamps invalid/NaN health output to safe range.
- Metric computation failure fallback returns health score `0` with computation-error risk flag.

## 6. Validation Matrix

Expected ranges for high-level correctness checks:

| Repo | Expected Range | Reasoning |
|------|----------------|-----------|
| facebook/react | 75-95 | Very active, many contributors, fast PR review and strong community behavior |
| torvalds/linux | 70-90 | Massive and active, strong contributor depth, often slower PR merge dynamics |
| small personal project | 25-55 | Low activity history, high top-contributor concentration, sparse PR process |
| archived popular repo | 20-30 | Archived cap applies regardless of historical popularity |
| new repo with 5 commits | 15-35 | Minimal signal; mostly defaults/null handling with low activity |

Recommended validation method:
- Run analysis on known repos and verify score bands, not exact point values.
- Validate null-path behavior by simulating missing PR/Issue data.
- Validate archived and empty-repo caps explicitly.

## 7. AI Integration

AI modules consume scoring outputs as structured prompt input to Gemini models:

- `ai/advice.ts`:
  - Uses `healthScore`, bus factor data, PR merge speed, issue responsiveness, velocity, and churn.
  - Returns two-sentence actionable advice (Gemini or rule-based fallback).

- `ai/issueRecommender.ts`:
  - Uses user profile + repository issue context (labels, age, comments).
  - Produces personalized issue recommendations.

- `ai/compareInsights.ts`:
  - Uses multi-repo metric snapshots including `healthScore`, issue/PR/activity metrics, and `communityScore`.
  - Produces per-repo pros/cons and overall recommendation.

- `ai/userInsights.ts`:
  - Uses profile-level aggregates including repository health scores.
  - Produces strengths, growth areas, and focus suggestions.

Design constraints enforced in AI layer:
- 24h Redis caching for AI responses.
- Quota cooldown and model fallback handling.
- Rule-based fallback when Gemini is unavailable.

## 8. Changelog

- 2026-04-03 (Prompt 12): Initial internal scoring documentation created. Captures current formulas, weights, special rules, validation ranges, and AI integration pathways.
