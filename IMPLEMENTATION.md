# RepoPulse — GitHub Repository Health Analyzer
### Complete Project Guide for SDE Placement Portfolio

---

## Table of Contents

1. [What is RepoPulse?](#1-what-is-repopulse)
2. [Why This Project?](#2-why-this-project)
3. [Core Constraints — Read This First](#3-core-constraints--read-this-first)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Full Tech Stack](#5-full-tech-stack)
6. [GitHub API — Everything You Need to Know](#6-github-api--everything-you-need-to-know)
7. [Feature Breakdown — Every Detail](#7-feature-breakdown--every-detail)
8. [The Three Power Features](#8-the-three-power-features)
9. [Database Schema](#9-database-schema)
10. [Backend Services — Each One Explained](#10-backend-services--each-one-explained)
11. [Frontend Pages and Components](#11-frontend-pages-and-components)
12. [Edge Cases You Must Handle](#12-edge-cases-you-must-handle)
13. [Health Score Formula](#13-health-score-formula)
14. [Risk Flags Logic](#14-risk-flags-logic)
15. [Build Order — Day by Day](#15-build-order--day-by-day)
16. [Difficulty Map](#16-difficulty-map)
17. [What to Skip](#17-what-to-skip)
18. [How to Talk About This in Interviews](#18-how-to-talk-about-this-in-interviews)
19. [Market Relevance](#19-market-relevance)
20. [Resume Lines](#20-resume-lines)

---

## 1. What is RepoPulse?

RepoPulse answers one question:

> **"Is this GitHub repository healthy or slowly dying?"**

User inputs a GitHub repo URL. RepoPulse fetches data from GitHub's API, runs it through a metrics engine, and outputs:

- A **Health Score** from 0–100
- Core metrics (bus factor, PR speed, issue backlog, activity trend)
- **Risk Flags** — plain English warnings when something looks bad
- A **Health Timeline** showing how the repo has changed over months
- **Repo Comparison** — compare two repos side by side

### Real use cases
- A developer evaluating whether to use an open source library
- A student picking a repo to contribute to
- A team checking if a dependency is still actively maintained
- Anyone asking "will my PR actually get reviewed here?"

---

## 2. Why This Project?

Most student projects are todo apps, e-commerce clones, or chat apps. This project is different because:

- It solves a **real problem developers face daily**
- It demonstrates **backend engineering** — async jobs, queues, data pipelines
- It involves **API integration with real constraints** (rate limits, pagination)
- The **metric design** shows analytical thinking, not just CRUD
- It has a natural **demo** — just analyze `facebook/react` live in an interview

### What makes it stand out vs generic projects
| Generic Project | RepoPulse |
|---|---|
| CRUD operations | Data pipeline + async processing |
| Simple REST API | GraphQL with rate limit management |
| Basic DB queries | Metric computation + aggregation |
| No real users | Developers actually need this |

---

## 3. Core Constraints — Read This First

These are not optional. They exist to keep the app working within GitHub's limits.

```
Max commits analyzed:   1000
Max PRs analyzed:       500
Max issues analyzed:    500
Analysis time window:   last 12 months
Only public repos:      yes
```

**Why these limits matter:**
- GitHub GraphQL gives 5000 points/hour per authenticated user
- Analyzing one repo without limits can consume 1000+ points
- With limits, one analysis costs ~200–400 points
- You can analyze 10–15 repos per hour safely

**Always show these limits in the UI.** Don't hide them. Say "Analyzed last 1000 commits (last 12 months)." Interviewers respect this — it shows you understand real system constraints.

---

## 4. High-Level Architecture

```
User (browser)
    │
    ▼
Next.js Frontend
    │
    │  POST /api/analyze  (submit repo URL)
    ▼
Node.js + Express API Server
    │
    │  queue.add("analyzeRepo", { owner, repo, userId })
    ▼
Redis (BullMQ Queue)
    │
    │  worker picks up job
    ▼
Repo Analysis Worker
    │
    ├── GitHub GraphQL API (fetches raw data)
    │
    ├── Metrics Engine (computes scores)
    │
    └── PostgreSQL (stores results)
    │
    ▼
Frontend polls GET /api/status/:jobId
    │
    └── when done → GET /api/repo/:owner/:repo
    │
    ▼
Dashboard rendered
```

### Why this architecture is good for interviews

The async queue pattern is used everywhere at scale — Swiggy for order processing, Razorpay for payment webhooks, etc. When you explain "I couldn't do it synchronously because GitHub pagination takes 30+ API calls, so I moved it to a background worker queue," that shows real systems thinking.

---

## 5. Full Tech Stack

### Backend
| Tool | Purpose | Why this choice |
|---|---|---|
| Node.js | Runtime | You know it, good async support |
| Express.js | HTTP server | Simple, enough for this project |
| BullMQ | Job queue | Production-grade, built on Redis |
| Redis | Queue broker + caching | Fast, BullMQ requires it |
| PostgreSQL | Main database | Relational data, good for metrics |
| Prisma | ORM | Clean schema management, good DX |
| node-cron | Scheduled refresh | Auto re-analyze repos every 24hrs |

### Frontend
| Tool | Purpose |
|---|---|
| Next.js 14 (App Router) | Frontend framework |
| Tailwind CSS | Styling |
| D3.js | Custom charts (heatmaps, timelines) |
| Recharts | Standard bar/line charts (easier than D3) |
| SWR | Data fetching + polling |

### GitHub API
| API | Used for |
|---|---|
| GitHub GraphQL v4 | All heavy data fetching |
| GitHub OAuth | User authentication + rate limit increase |

### Infrastructure
| Tool | Purpose |
|---|---|
| Docker | Containerize app + Redis + PostgreSQL |
| Railway / Render | Deployment |
| Vercel | Frontend deployment (optional) |

---

## 6. GitHub API — Everything You Need to Know

### Authentication — GitHub OAuth

You must implement GitHub OAuth. Without it:
- Rate limit = 60 requests/hour (useless)
- Rate limit with auth = 5000 points/hour (workable)

OAuth flow:
```
1. User clicks "Login with GitHub"
2. Redirect to github.com/login/oauth/authorize
3. GitHub redirects back with a ?code=
4. Your server exchanges code for access_token
5. Store token, use it in all API headers
```

Header for all GitHub API calls:
```
Authorization: Bearer {access_token}
```

### GraphQL vs REST

Use **GraphQL** for anything involving nested data. Use **REST** only for simple single-resource calls.

Why GraphQL wins here:
```
REST approach:
  GET /repos/{owner}/{repo}           → 1 call
  GET /repos/{owner}/{repo}/commits   → N paginated calls
  GET /repos/{owner}/{repo}/pulls     → N paginated calls
  GET /repos/{owner}/{repo}/issues    → N paginated calls

GraphQL approach:
  Single query → get repo + commits + PRs + issues in one go
```

### GraphQL Rate Limit — The Points System

Every GraphQL query costs points based on complexity. GitHub deducts from your 5000/hour budget.

Simple field = 1 point
100 nodes in a list = ~100 points
Nested connection = multiplied cost

**Your budget per repo analysis: ~200–400 points**

Check your remaining points in every query response:
```graphql
rateLimit {
  limit
  remaining
  resetAt
}
```

Always log this. If `remaining < 500`, pause the worker and wait until `resetAt`.

### Pagination — The Part Everyone Gets Wrong

GitHub returns max 100 nodes per page. To get more, use cursor-based pagination:

```graphql
commits(first: 100, after: $cursor) {
  pageInfo {
    hasNextPage
    endCursor
  }
  nodes { ... }
}
```

Loop:
```
page 1 → get nodes + endCursor + hasNextPage
if hasNextPage → repeat with after: endCursor
stop when hasNextPage = false OR node count >= your limit
```

If you don't handle `hasNextPage` correctly, you silently get incomplete data with no error. This is where most students' implementations are subtly broken.

### Core GraphQL Queries

**Repo metadata + contributor commits:**
```graphql
query RepoData($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    name
    stargazerCount
    forkCount
    createdAt
    pushedAt
    isArchived
    isFork
    defaultBranchRef {
      target {
        ... on Commit {
          history(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes {
              committedDate
              author {
                user { login }
                name
              }
              additions
              deletions
            }
          }
        }
      }
    }
  }
  rateLimit { remaining resetAt }
}
```

**Pull requests:**
```graphql
query RepoPRs($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 100, after: $cursor, states: MERGED, orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        createdAt
        mergedAt
        closedAt
        author { login }
        reviews { totalCount }
      }
    }
  }
  rateLimit { remaining resetAt }
}
```

**Issues:**
```graphql
query RepoIssues($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, after: $cursor, states: OPEN, orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        createdAt
        closedAt
        state
        comments { totalCount }
      }
    }
  }
  rateLimit { remaining resetAt }
}
```

---

## 7. Feature Breakdown — Every Detail

### Feature 1: Bus Factor

**What it means:** How many developers does the project depend on critically? Bus factor of 1 = if that one developer disappears, the project is at risk.

**How to compute:**
```
1. Count commits per contributor
2. Sort descending by commit count
3. Walk down the list, accumulate % of total commits
4. Bus factor = number of devs needed to reach 50% of commits

Example:
  Dev A: 400 commits (40%)
  Dev B: 300 commits (30%) → cumulative 70%
  Dev C: 200 commits (20%)
  Dev D: 100 commits (10%)

  Bus factor = 2 (Dev A + Dev B cover >50%)
```

**Edge cases:**
- Filter out bot authors (usernames containing "bot", "dependabot", "renovate", "github-actions")
- If only 1 contributor → bus factor is automatically 1, flag it

**API cost:** Uses commit data already fetched. No extra calls.

**Difficulty:** Easy

---

### Feature 2: PR Turnaround Time

**What it means:** How long does it take for a pull request to get merged? Low = active, responsive maintainers. High = slow reviews or stale PRs.

**How to compute:**
```
merge_time_hours = (mergedAt - createdAt) in hours

avg_merge_time = sum(all merge times) / count

Also compute:
  - median merge time (more reliable than average)
  - p90 merge time (90th percentile — "worst case" scenario)
```

**Edge cases to filter:**
- PRs closed but NOT merged → exclude from metric
- PRs older than 12 months → exclude
- PRs still open → exclude from merge time, but count separately
- PRs with merge time > 180 days → likely stale, cap or exclude

**API cost:** Uses PR data already fetched. No extra calls.

**Difficulty:** Easy

---

### Feature 3: Commit Activity & Decay

**What it means:** Is this repo getting more or less active over time?

**How to compute:**
```
1. Take all commit timestamps
2. Group by week (ISO week number)
3. Count commits per week → array of [week, count]
4. Compare last 4 weeks vs previous 4 weeks:
   recent_avg = avg(last 4 weeks)
   previous_avg = avg(weeks 5-8)
   velocity_change = ((recent_avg - previous_avg) / previous_avg) * 100

Example output:
  Commit velocity: -32% (declining)
  Commit velocity: +18% (growing)
```

**API cost:** Uses commit timestamps already fetched. Pure computation, zero extra calls.

**Difficulty:** Easy

---

### Feature 4: Issue Backlog

**What it means:** How many open issues exist and how long do they sit unresponded?

**How to compute:**
```
open_issue_count = count of issues with state = OPEN

avg_issue_age_days = avg(today - createdAt) for all open issues

issues_with_no_comments = count where comments.totalCount == 0
```

**Edge cases:**
- Repos that use issues as a roadmap (intentionally open) → hard to detect, just show raw numbers
- Repos with 0 issues → don't show this metric, mark as "No issue tracking used"

**API cost:** Uses issue data already fetched. No extra calls.

**Difficulty:** Easy

---

### Feature 5: Code Churn (Optional — Handle Carefully)

**What it means:** Files that are constantly being edited = unstable or poorly designed modules.

**How to compute:**
```
For each commit: get additions + deletions
churn_score = total (additions + deletions) over last 100 commits
```

**Important limitation:** Getting `additions` and `deletions` per commit IS available in the commit history GraphQL query (you can include it). But file-level churn (which specific files are changing most) requires fetching individual commit details — one API call per commit. This is expensive.

**Practical approach:**
- Use total additions+deletions from the commit history query (already fetched) → gives repo-level churn score
- Skip file-level churn entirely OR limit to last 50 commits only
- Don't promise file-level churn in your README unless you've actually built it

**API cost:**
- Repo-level churn: 0 extra calls (data in commit query)
- File-level churn: 1 call per commit = very expensive, skip or cap at 50

**Difficulty:** Easy for repo-level, Hard for file-level

---

## 8. The Three Power Features

### Power Feature 1: Repo Comparison

Allow users to input two repo URLs and compare them side by side.

```
Input: github.com/facebook/react  vs  github.com/vuejs/vue

Output:
                    React       Vue
Health Score:        88          81
Bus Factor:          12           7
Avg PR Merge Time:   1.2 days    2.4 days
Commit Velocity:     +5%         -8%
Open Issues:         642         312
```

**Implementation:**
- You already compute metrics per repo
- Queue two jobs simultaneously
- When both complete, render a side-by-side comparison table
- Add a "winner" indicator per metric

**API cost:** 2x normal analysis. Nothing new.

**Difficulty:** Very easy — mostly a frontend task once metrics exist.

**Why it matters:** This is your demo moment. In interviews, pull up `react vs vue` or `next.js vs nuxt` live. It's visual, immediate, and impressive.

---

### Power Feature 2: Health Timeline

Show how the repo's health has changed over the last 4 quarters.

```
Health Score Over Time:
Q1 2024: 84
Q2 2024: 79
Q3 2024: 71
Q4 2024: 65  ← declining project detected
```

**Implementation:**
```
1. Take all commit timestamps (already fetched)
2. Divide into time windows: Q1, Q2, Q3, Q4
3. For each window, compute:
   - commits that quarter
   - PRs merged that quarter (use mergedAt)
   - activity score for that window
4. Compute partial health score per window
   (use only activity + PR metrics — issues don't have good historical data)
5. Plot as line chart
```

**Important limitation:** Only use commit velocity + PR metrics for the timeline. Issue backlog and bus factor don't change meaningfully per quarter with the data you have. Be honest about this.

**API cost:** Zero extra. Uses already-fetched data, just grouped differently.

**Difficulty:** Medium — the time windowing logic needs careful implementation.

---

### Power Feature 3: Risk Flags

Plain English warnings generated from your metrics. No ML, no complexity — just if/else logic that reads smart.

```
Risk Flags:

⚠️  CONTRIBUTOR CONCENTRATION RISK
    Top contributor owns 82% of commits.
    If they leave, this project is at risk.

⚠️  PR REVIEW SLOWDOWN
    Average PR merge time: 12 days.
    Maintainers may be overwhelmed or inactive.

⚠️  ACTIVITY DECLINING
    Commit velocity dropped 45% in the last 3 months.
    Project may be losing momentum.

✅  HEALTHY CONTRIBUTOR BASE
    Bus factor of 8. Project is not dependent on any single developer.
```

**Full flag logic:**
```javascript
// Contributor concentration
if (topContributorPercent > 70) → "CONTRIBUTOR CONCENTRATION RISK"
if (topContributorPercent > 50 && busFactorCount === 1) → same flag

// PR slowdown
if (avgPRMergeTimeDays > 14) → "PR REVIEW SLOWDOWN" (severe)
if (avgPRMergeTimeDays > 7) → "PR RESPONSE DELAY" (moderate)

// Activity decline
if (velocityChange < -40) → "ACTIVITY DECLINING" (severe)
if (velocityChange < -20) → "SLOWING MOMENTUM" (moderate)

// Issue backlog
if (openIssueCount > 500) → "LARGE ISSUE BACKLOG"
if (issuesWithNoComments / openIssueCount > 0.6) → "ISSUES GOING UNACKNOWLEDGED"

// Positive flags (show these too)
if (busFactor >= 5) → "HEALTHY CONTRIBUTOR BASE"
if (avgPRMergeTimeDays < 2) → "FAST PR REVIEWS"
if (velocityChange > 20) → "GROWING ACTIVITY"
```

**API cost:** Zero. Pure computation.

**Difficulty:** Very easy. High visual impact.

---

### Power Feature 4 (Bonus): Embeddable Badge

A URL that returns an SVG badge, like GitHub's own shields.

```
https://repopulse.dev/badge/facebook/react
→ returns SVG: [RepoPulse | Health: 88 ✅]
```

Maintainers can embed this in their README:
```markdown
![RepoPulse](https://repopulse.dev/badge/facebook/react)
```

**Implementation:**
- `GET /badge/:owner/:repo` route
- Fetch latest health score from DB (no new analysis)
- Return SVG string with correct Content-Type header
- Color code: green (>75), yellow (50-75), red (<50)

**Difficulty:** Easy — SVG is just a string template.

**Why it matters:** If even a few open source maintainers embed your badge, the project gets real users. That's a killer interview story.

---

## 9. Database Schema

```sql
-- Users table
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id    TEXT UNIQUE NOT NULL,
  username     TEXT NOT NULL,
  access_token TEXT NOT NULL,  -- encrypted
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Repos table
CREATE TABLE repos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner        TEXT NOT NULL,
  name         TEXT NOT NULL,
  stars        INTEGER,
  forks        INTEGER,
  is_archived  BOOLEAN DEFAULT false,
  is_fork      BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner, name)
);

-- Analysis jobs table
CREATE TABLE analysis_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id      UUID REFERENCES repos(id),
  user_id      UUID REFERENCES users(id),
  status       TEXT DEFAULT 'queued',  -- queued | processing | done | failed
  bull_job_id  TEXT,
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Repo metrics table (one row per analysis)
CREATE TABLE repo_metrics (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id               UUID REFERENCES repos(id),
  job_id                UUID REFERENCES analysis_jobs(id),
  analyzed_at           TIMESTAMPTZ DEFAULT NOW(),

  -- Core metrics
  health_score          NUMERIC(5,2),
  bus_factor            INTEGER,
  top_contributor_pct   NUMERIC(5,2),
  avg_pr_merge_time_hrs NUMERIC(10,2),
  median_pr_merge_hrs   NUMERIC(10,2),
  commit_velocity_change NUMERIC(5,2),  -- % change
  open_issue_count      INTEGER,
  avg_issue_age_days    NUMERIC(10,2),
  churn_score           NUMERIC(10,2),

  -- Raw counts (for display)
  total_commits_analyzed INTEGER,
  total_prs_analyzed     INTEGER,
  total_issues_analyzed  INTEGER,

  -- Full metrics as JSON (for timeline + flexibility)
  metrics_json          JSONB
);

-- Timeline snapshots (quarterly breakdowns)
CREATE TABLE health_timeline (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id      UUID REFERENCES repos(id),
  period       TEXT NOT NULL,  -- "2024-Q1", "2024-Q2" etc
  health_score NUMERIC(5,2),
  commit_count INTEGER,
  pr_count     INTEGER,
  computed_at  TIMESTAMPTZ DEFAULT NOW()
);
```

**Note:** Never store raw commits in the database. Only store derived metrics. Raw commit data lives in memory during analysis and gets discarded after metrics are computed.

---

## 10. Backend Services — Each One Explained

### Service 1: API Server (`src/server/`)

Handles HTTP requests from the frontend.

**Routes:**
```
POST   /api/analyze          → validate repo URL, queue job, return jobId
GET    /api/status/:jobId     → return job status (queued/processing/done/failed)
GET    /api/repo/:owner/:repo → return latest metrics for a repo
GET    /api/compare           → return metrics for two repos side by side
GET    /badge/:owner/:repo    → return SVG badge
GET    /auth/github           → start GitHub OAuth flow
GET    /auth/github/callback  → handle OAuth callback, create session
```

**Key logic in POST /api/analyze:**
```
1. Parse owner/repo from URL
2. Check if repo exists (GitHub API: GET /repos/{owner}/{repo})
3. Check if repo is public
4. Check if fresh analysis exists in DB (< 24 hours old) → return cached
5. If not cached → add to BullMQ queue → return { jobId }
```

---

### Service 2: BullMQ Worker (`src/workers/repoAnalyzer.js`)

The heart of the backend. Runs as a separate process.

**Job flow:**
```javascript
worker.process("analyzeRepo", async (job) => {
  const { owner, repo } = job.data;

  // Step 1: Fetch repo metadata
  const metadata = await fetchRepoMetadata(owner, repo);

  // Step 2: Fetch commits (paginated, max 1000)
  const commits = await fetchCommits(owner, repo, limit=1000);

  // Step 3: Fetch PRs (paginated, max 500)
  const prs = await fetchPRs(owner, repo, limit=500);

  // Step 4: Fetch issues (paginated, max 500)
  const issues = await fetchIssues(owner, repo, limit=500);

  // Step 5: Compute all metrics
  const metrics = computeMetrics(commits, prs, issues);

  // Step 6: Compute health score
  const healthScore = computeHealthScore(metrics);

  // Step 7: Compute timeline
  const timeline = computeTimeline(commits, prs);

  // Step 8: Generate risk flags
  const flags = generateRiskFlags(metrics);

  // Step 9: Store everything in PostgreSQL
  await saveMetrics(repoId, { ...metrics, healthScore, timeline, flags });

  // Step 10: Mark job as complete
  await updateJobStatus(job.id, "done");
});
```

**Rate limit handling in the worker:**
```javascript
async function fetchWithRateLimit(query, variables) {
  const result = await callGitHubGraphQL(query, variables);
  const remaining = result.rateLimit.remaining;

  if (remaining < 200) {
    const resetAt = new Date(result.rateLimit.resetAt);
    const waitMs = resetAt - Date.now() + 5000; // +5s buffer
    console.log(`Rate limit low. Waiting ${waitMs}ms`);
    await sleep(waitMs);
  }

  return result;
}
```

---

### Service 3: Metrics Engine (`src/metrics/`)

Pure functions. Takes raw data, returns computed metrics. No DB, no API calls.

**Files:**
```
src/metrics/
  busFactorMetric.js       → compute bus factor + contributor distribution
  prMetrics.js             → merge time, median, p90
  activityMetrics.js       → commit velocity, decay
  issueMetrics.js          → backlog, age
  churnMetrics.js          → additions + deletions analysis
  healthScore.js           → combine all metrics into 0-100 score
  riskFlags.js             → generate warning flags
  timeline.js              → split data into quarterly windows
```

Keep all metrics logic pure and testable. This makes it easy to write unit tests (which you should — great interview talking point).

---

### Service 4: GitHub API Client (`src/github/`)

Wrapper around GitHub's GraphQL API. Handles:
- Adding auth headers
- Rate limit checking
- Pagination loops
- Retry on 5xx errors (max 3 retries with exponential backoff)

```
src/github/
  client.js         → base fetch wrapper with auth + rate limit check
  queries.js        → all GraphQL query strings
  fetchCommits.js   → paginated commit fetcher
  fetchPRs.js       → paginated PR fetcher
  fetchIssues.js    → paginated issue fetcher
  fetchMetadata.js  → repo metadata + validation
```

---

### Service 5: Cache Layer

Use Redis for caching to avoid redundant GitHub API calls.

**Cache strategy:**
```
Key:   repo:metrics:{owner}:{repo}
Value: JSON of latest metrics
TTL:   24 hours

On POST /api/analyze:
  1. Check Redis for cached result
  2. If fresh (< 24hr) → return cached, skip queue
  3. If stale → queue new analysis, clear old cache
```

---

### Service 6: Scheduled Refresh (`src/cron/`)

Auto-refresh previously analyzed repos every 24 hours.

```javascript
// runs at 2am every day
cron.schedule("0 2 * * *", async () => {
  const repos = await getReposAnalyzedYesterday();
  for (const repo of repos) {
    await queue.add("analyzeRepo", { owner: repo.owner, name: repo.name });
  }
});
```

---

## 11. Frontend Pages and Components

### Pages

```
/                        → Landing page + search bar to input repo URL
/repo/:owner/:repo       → Main analysis dashboard
/compare                 → Side-by-side comparison page
/status/:jobId           → "Analyzing..." loading screen with polling
```

### Key Components

**HealthScoreRing** — Big circular score display (0–100) with color coding
- Green: 75–100
- Yellow: 50–74
- Red: 0–49

**MetricsGrid** — 4-card grid showing key numbers
- Bus Factor
- Avg PR Merge Time
- Commit Velocity Change
- Open Issues

**CommitActivityChart** — D3 or Recharts line chart of commits per week over 12 months

**ContributorPieChart** — Pie showing commit distribution by contributor (top 5 + "others")

**RiskFlagsPanel** — List of warning/success flags with icons and descriptions

**HealthTimeline** — Line chart showing health score per quarter

**ComparisonTable** — Side-by-side metrics table for two repos

**AnalysisStatus** — Polling component that calls `/api/status/:jobId` every 3 seconds until done, then redirects to dashboard

---

## 12. Edge Cases You Must Handle

### Bot commits
```javascript
const BOT_PATTERNS = ["bot", "dependabot", "renovate", "github-actions", "[bot]"];
const isBot = (login) => BOT_PATTERNS.some(p => login?.toLowerCase().includes(p));
commits.filter(c => !isBot(c.author?.login));
```

### Repos with no PRs
```javascript
if (prs.length < 10) {
  prMetrics = null;  // don't show PR metrics
  flags.push({ type: "info", message: "This repo doesn't use a PR workflow. PR metrics unavailable." });
}
```

### Repos with no issues
```javascript
if (issues.length === 0) {
  issueMetrics = null;
  // Don't flag as negative — many repos disable issues intentionally
}
```

### Archived repos
```javascript
if (repo.isArchived) {
  return { status: "archived", message: "This repository is archived and no longer maintained." };
  // Still show last analysis if available
}
```

### Forked repos
```javascript
if (repo.isFork) {
  // Warn user — metrics reflect fork activity, not upstream
  flags.push({ type: "warning", message: "This is a fork. Metrics reflect fork activity only." });
}
```

### Repos with < 50 commits
```javascript
if (commits.length < 50) {
  // Suppress bus factor and velocity metrics — insufficient data
  flags.push({ type: "info", message: "Not enough commit history for full analysis." });
}
```

### Very large repos (kubernetes, linux)
```javascript
// Enforce limits strictly
const MAX_COMMITS = 1000;
const MAX_PRS = 500;
// Show clearly in UI: "Analyzed last 1000 of 50,000+ commits"
```

### GitHub API errors
```javascript
// 401 Unauthorized → OAuth token expired → prompt re-login
// 403 Forbidden → rate limit hit → queue job for later
// 404 Not Found → repo doesn't exist or is private
// 5xx Server Error → retry up to 3 times with exponential backoff
```

---

## 13. Health Score Formula

```
Health Score (0–100) =
  (Activity Score     × 0.30)
+ (Contributor Score  × 0.25)
+ (PR Score           × 0.20)
+ (Issue Score        × 0.15)
+ (Churn Score        × 0.10)
```

### Computing each sub-score (all normalized to 0–100)

**Activity Score:**
```
base = min(commits_last_30_days / 30, 1) × 100  // 30 commits/month = perfect score
velocity_modifier = clamp(velocity_change / 100, -0.3, 0.3)
activity_score = base × (1 + velocity_modifier)
```

**Contributor Score (inverse of concentration risk):**
```
top_pct = top_contributor_commits / total_commits
contributor_score = (1 - top_pct) × 100
// If top dev owns 70% → score = 30
// If top dev owns 20% → score = 80
```

**PR Score:**
```
if avg_merge_days < 1  → pr_score = 100
if avg_merge_days < 3  → pr_score = 85
if avg_merge_days < 7  → pr_score = 65
if avg_merge_days < 14 → pr_score = 40
if avg_merge_days >= 14 → pr_score = 15
if no_prs              → pr_score = 50 (neutral, not penalized)
```

**Issue Score:**
```
// Penalize large backlogs
issue_score = max(0, 100 - (open_issues / 10))
// 100 open issues → score = 90
// 1000 open issues → score = 0
```

**Churn Score:**
```
// High churn = unstable = lower score
avg_weekly_churn = total_churn / weeks_analyzed
churn_score = max(0, 100 - (avg_weekly_churn / 100))
```

### Why these weights?
Write this down — interviewers ask.
- Activity (30%) — most important signal of a living project
- Contributor diversity (25%) — sustainability risk, directly impacts whether the project survives
- PR responsiveness (20%) — quality signal, shows team engagement
- Issue backlog (15%) — lagging indicator, big backlogs develop slowly
- Churn (10%) — interesting but noisiest metric, least reliable

---

## 14. Risk Flags Logic

```javascript
function generateRiskFlags(metrics) {
  const flags = [];

  // Contributor concentration
  if (metrics.topContributorPct > 70) {
    flags.push({
      level: "danger",
      title: "CONTRIBUTOR CONCENTRATION RISK",
      detail: `Top contributor owns ${metrics.topContributorPct}% of commits. Single point of failure.`
    });
  }

  // PR slowdown
  if (metrics.avgPRMergeDays > 14) {
    flags.push({
      level: "danger",
      title: "PR REVIEW SEVERELY DELAYED",
      detail: `Average PR merge time: ${metrics.avgPRMergeDays} days. Maintainers may be inactive.`
    });
  } else if (metrics.avgPRMergeDays > 7) {
    flags.push({
      level: "warning",
      title: "PR RESPONSE SLOW",
      detail: `Average PR merge time: ${metrics.avgPRMergeDays} days.`
    });
  }

  // Activity decline
  if (metrics.velocityChange < -40) {
    flags.push({
      level: "danger",
      title: "ACTIVITY DECLINING SHARPLY",
      detail: `Commit velocity dropped ${Math.abs(metrics.velocityChange)}% in last 3 months.`
    });
  } else if (metrics.velocityChange < -20) {
    flags.push({
      level: "warning",
      title: "SLOWING MOMENTUM",
      detail: `Commit velocity down ${Math.abs(metrics.velocityChange)}%.`
    });
  }

  // Issue backlog
  if (metrics.openIssueCount > 1000) {
    flags.push({
      level: "warning",
      title: "LARGE ISSUE BACKLOG",
      detail: `${metrics.openIssueCount} open issues.`
    });
  }

  // Positive flags
  if (metrics.busFactorCount >= 5) {
    flags.push({ level: "success", title: "HEALTHY CONTRIBUTOR BASE", detail: `Bus factor: ${metrics.busFactorCount}` });
  }
  if (metrics.avgPRMergeDays < 2) {
    flags.push({ level: "success", title: "FAST PR REVIEWS", detail: `Average merge time under 2 days.` });
  }
  if (metrics.velocityChange > 20) {
    flags.push({ level: "success", title: "GROWING ACTIVITY", detail: `Commit velocity up ${metrics.velocityChange}%.` });
  }

  return flags;
}
```

---

## 15. Build Order — Day by Day

### Week 1 — Foundation

**Day 1–2: Project setup + GitHub OAuth**
- Initialize Next.js + Node.js repos
- Set up PostgreSQL + Prisma schema
- Set up Redis locally (Docker)
- Implement GitHub OAuth (login/logout/session)
- Test: user can login with GitHub

**Day 3–4: GitHub API client**
- Write base GraphQL client with auth headers
- Write rate limit checker
- Write pagination helper
- Fetch repo metadata (test with `facebook/react`)
- Test: can fetch and print repo metadata

**Day 5–6: Core data fetching**
- Write `fetchCommits` with pagination + 1000 limit
- Write `fetchPRs` with pagination + 500 limit
- Write `fetchIssues` with pagination + 500 limit
- Test: can fetch all data for a medium-sized repo

**Day 7: BullMQ queue setup**
- Set up BullMQ worker
- Queue a job from API, process it in worker
- Job calls data fetchers, logs output
- Test: paste a URL, see data logged in worker console

---

### Week 2 — Metrics Engine

**Day 8–9: Core metrics**
- Bus factor calculation
- PR merge time (avg + median)
- Commit velocity + decay
- Issue backlog metrics

**Day 10: Health score + risk flags**
- Implement health score formula
- Implement all risk flags
- Test against 5 different repos manually

**Day 11–12: Store + retrieve**
- Save metrics to PostgreSQL after job completes
- API route to fetch metrics by repo
- Job status polling route

**Day 13: Timeline**
- Quarterly windowing logic
- Compute partial health per quarter
- Store in health_timeline table

**Day 14: Caching**
- Redis cache for metrics
- Skip re-analysis if fresh data exists

---

### Week 3 — Frontend

**Day 15–16: Dashboard page**
- Health score ring component
- Metrics grid (4 cards)
- Risk flags panel

**Day 17–18: Charts**
- Commit activity line chart (Recharts)
- Contributor pie chart
- Health timeline chart

**Day 19: Status + loading**
- Polling component for job status
- Loading states + error states

**Day 20–21: Comparison page**
- Input two repo URLs
- Queue both jobs
- Side-by-side comparison table

---

### Week 4 — Polish + Extras

**Day 22: Badge feature**
- SVG badge endpoint
- Color coding by health score

**Day 23: Edge cases**
- Bot filtering
- No-PR repos
- Archived repos
- Too-small repos

**Day 24–25: Deployment**
- Docker setup
- Deploy backend to Railway/Render
- Deploy frontend to Vercel

**Day 26–27: Testing + cleanup**
- Test with 10 different repos (small, large, active, abandoned, no PRs)
- Fix bugs found during testing
- Write README with architecture diagram

---

## 16. Difficulty Map

| Task | Difficulty | Time Estimate |
|---|---|---|
| GitHub OAuth | Medium | 1 day |
| GraphQL client + pagination | Medium-Hard | 2 days |
| BullMQ worker setup | Medium | 1 day |
| Rate limit handling | Medium | 1 day |
| Bus factor metric | Easy | 2 hours |
| PR merge time metric | Easy | 2 hours |
| Commit velocity metric | Easy | 3 hours |
| Health score formula | Medium | 1 day |
| Risk flags | Easy | 3 hours |
| Health timeline | Medium | 1 day |
| Caching layer | Easy-Medium | 4 hours |
| Dashboard UI | Medium | 2 days |
| D3 charts | Hard | 2 days |
| Comparison feature | Easy | 1 day |
| SVG badge | Easy | 3 hours |
| Edge case handling | Medium | 1 day |
| Deployment + Docker | Medium | 1 day |

**Total realistic estimate: 3–4 weeks** of focused work (not 2 weeks as some estimates suggest). Don't rush the metrics engine — that's what makes this project good.

---

## 17. What to Skip

These are things that sound good but will waste your time:

| Don't build | Why |
|---|---|
| Webhooks for arbitrary repos | GitHub only allows webhooks on repos you own. Not possible for random public repos. |
| File-level churn analysis | Requires 1 API call per commit. 500 commits = 500 calls. Will explode rate limits. |
| Real-time updates | No way to get real-time GitHub data without webhooks. Use scheduled refresh instead. |
| Private repo support | Requires storing user's OAuth token and using it for their repos. Adds auth complexity. Out of scope. |
| ML-based predictions | Way out of scope. The rule-based risk flags are already impressive enough. |
| Monorepo support | Metrics become meaningless for monorepos. Acknowledge it as a known limitation. |

---

## 18. How to Talk About This in Interviews

### Opening line
> "I built a GitHub repository health analyzer. You input any public repo URL and it gives you a health score based on commit activity, contributor concentration, PR turnaround time, and issue backlog. I was solving a real problem — developers manually check these things when evaluating open source libraries."

### When they ask about technical challenges
> "The biggest challenge was the GitHub API rate limits. You only get 5000 GraphQL points per hour, and a naive implementation would consume all of that on a single large repo. I solved it by enforcing analysis limits — max 1000 commits, 500 PRs — and adding rate limit monitoring in the worker that backs off automatically when points get low."

### When they ask about architecture
> "I used an async job queue with BullMQ. When a user submits a repo, the API immediately queues a background job and returns a job ID. The worker processes it asynchronously — fetching data in paginated batches, computing metrics, storing results. The frontend polls for status every 3 seconds and loads the dashboard once the job completes."

### When they ask about the metrics
> "The health score is a weighted composite of five metrics. I weighted activity highest at 30% because it's the most reliable signal of a living project. Contributor diversity is 25% because bus factor directly determines sustainability. I documented the reasoning for each weight — it wasn't arbitrary."

### Live demo move
> Pull up repopulse.dev, type `facebook/react` and `vuejs/vue`, click compare. Let the results speak.

---

## 19. Market Relevance

### Who would actually use this?

**Developers evaluating dependencies**
Every developer googles "is X library still maintained?" before adding it to a project. Right now they manually check the last commit date and open issues. RepoPulse automates this into a single score.

**Students picking repos to contribute to**
First-time open source contributors need to know: will my PR actually get reviewed? RepoPulse's PR turnaround metric answers this directly.

**Tech leads and engineering managers**
Evaluating whether to adopt or deprecate a dependency. Currently done manually or not at all.

### Why no one has built this well yet
- GitHub has Insights but it's only for repo owners, not external viewers
- Libraries like `snyk` and `socket.dev` focus on security, not health
- GitHub stats cards exist but they're superficial (just commit counts)
- The combination of metrics + risk flags + comparison in a clean UI doesn't exist as a free tool

### The badge angle is your distribution strategy
If 10 open source maintainers embed your health badge in their README, your tool gets seen by thousands of developers organically. This is how you'd actually grow this — not ads.

---

## 20. Resume Lines

```
RepoPulse — GitHub Repository Health Analyzer
Tech: Next.js, Node.js, PostgreSQL, Redis, BullMQ, GitHub GraphQL API

- Built async repository analysis pipeline using BullMQ workers to process
  paginated GitHub GraphQL data within strict API rate limits (5000 pts/hr)

- Designed composite health scoring algorithm across 5 metrics: contributor
  bus factor, PR turnaround time, commit velocity decay, issue backlog,
  and code churn

- Implemented rate-limit-aware GitHub GraphQL ingestion with automatic
  backoff and cursor-based pagination handling up to 1000 commits per repo

- Built repo comparison feature and embeddable SVG health badge consumed
  by external README files
```

---

*Built for SDE placements — Bangalore, India*
*Stack: Next.js · Node.js · PostgreSQL · Redis · BullMQ · GitHub GraphQL API*