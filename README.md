# GitVital - GitHub Repository Health Analyzer

<p align="center">
  <em>Is this open-source library healthy or slowly dying? GitVital answers that question.</em>
</p>

<p align="center">
  💡 <strong>Quick Start:</strong> Replace <code>github.com</code> with <code>gitvital.com</code> in any repo URL to instantly analyze it.
</p>

## Overview

GitVital is a specialized data ingestion and analytics pipeline that evaluates the health, sustainability, and maintainability of public GitHub repositories. 

Developers manually check commit dates and open issue counts when evaluating open-source dependencies. GitVital automates and deeply expands this process by converting raw GitHub GraphQL data into a multi-variable **Health Score (0-100)**, alongside actionable intelligence like Bus Factor, PR Turnaround Time, and Code Churn.

It also gamifies open-source contributions by aggregating a **Developer Health Score** for maintainers, ranking them on a global leaderboard based on the health of their projects.

## Core Features

- **The Health Score:** A 0-100 composite score weighted by commit activity, contributor diversity, PR responsiveness, issue backlog management, and code churn.
- **Risk Flags:** Automated, plain-English warnings generated from metrics (e.g., *⚠️ PR REVIEW DELAYED: Average merge time is 14 days*).
- **Gamified Developer Profiles:** Aggregated metrics across a user's repositories to calculate a global percentile ranking (e.g., *Better than 90% of developers on GitVital*), featuring unlockable achievement badges.
- **AI-Powered "Actionable Advice":** Personalized coaching tips generated from repository metrics to help maintainers improve their project's health.
- **Repository Comparison:** A side-by-side metric comparison tool for evaluating competing libraries (e.g., React vs. Vue).
- **Embeddable SVG Badges:** Dynamic health badges that maintainers can embed directly into their repository `README.md` files.

## Technical Architecture

GitVital is built as an asynchronous data pipeline designed to handle extensive third-party API rate limits and complex data aggregation.

**Tech Stack:**
- **Frontend:** Next.js 14, Tailwind CSS, Recharts / D3.js
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL (with Prisma ORM), Redis
- **Queueing / Workers:** BullMQ
- **External Services:** GitHub GraphQL API v4, Gemini AI API

### Engineering Challenges Solved

#### 1. Overcoming Strict 3rd-Party API Rate Limits
GitHub's GraphQL API strictly limits authenticated users to 5,000 points per hour. A naive implementation querying deep historical data would consume this on a single large repository. 
- **Solution:** Implemented adaptive rate-limit monitoring within the BullMQ worker that intelligently calculates wait times based on GitHub's `resetAt` timestamps, automatically backing off before limits are hit.
- **Enforced Limits:** Analysis is capped at the last 12 months, analyzing up to 1,000 commits, 500 PRs, and 500 issues per repository to ensure predictable API consumption.

#### 2. Asynchronous Worker pipeline
Fetching paginated data via GraphQL takes significant time. Keeping the HTTP request open would cause timeouts and poor UX.
- **Solution:** Integrated **BullMQ** (running on Redis) to offload ingestion and computation to a separate Node.js worker process. The Next.js frontend polls for the job status (`queued`, `processing`, `done`) and seamlessly renders the dashboard once the background worker finishes.
- **Idempotent Queueing:** Robust deduplication logic ensures that repeated requests for the same repository don't flood the queue with redundant jobs.

#### 3. Defensive Pagination Handling
GitHub's cursor-based pagination can be brittle, occasionally returning empty nodes while indicating a `hasNextPage`.
- **Solution:** Built bulletproof while-loops with explicit infinite-loop guards (checking if cursors change) and hard iteration limits to guarantee reliable data fetching across thousands of commits.

#### 4. Complex Data Aggregation (Leaderboards)
Ranking developers globally based on aggregated repository metrics requires intensive calculation.
- **Solution:** Leveraged PostgreSQL window functions (`PERCENT_RANK()`, `RANK()`) against a **Materialized View** that is refreshed incrementally via a scheduled Cron job. This ensures that leaderboard queries on the frontend remain lightning fast (O(1) read time) regardless of the number of users.

#### 5. Multi-Variable Scoring Algorithm
Designing a metric that accurately reflects "health" requires nuanced handling of missing or sparse data (e.g., repositories that don't use Pull Requests).
- **Solution:** Built a pure-function metrics engine that dynamically redistributes scoring weights if a particular metric (like PR Turnaround Time) is missing, ensuring the final 0-100 score remains mathematically sound and fair.

## How GitVital Compares

We believe in transparency. Several great tools exist in the GitHub analytics space, and we want to be upfront about the landscape — what overlaps, and what we're doing differently.

### The Landscape

| Tool | What it does | How we differ |
|---|---|---|
| [repopulse.dev](https://repopulse.dev) | Repo health scores, bus factor, contributor charts | Similar core metrics — but no comparison tool, no gamification, no developer profiles, no AI advice, no embeddable badges |
| [OSS Insight](https://ossinsight.io) | Massive GitHub event explorer (10B+ events) | Data explorer, not a health analyzer. No health scores, no risk flags, no developer scoring |
| [GitPulse](https://gitpulse.xyz) | Repo analytics, health scores, commit heatmaps, repo comparison | Closest feature overlap — but no bus factor, no risk flags, no gamification, no developer profiles |
| [CodeScene](https://codescene.com) | Enterprise code quality & behavioral analysis | Different category. Focuses on code maintainability for engineering orgs, not project/community health for individual developers |
| [Cauldron](https://cauldron.io) | Open-source community analytics (GrimoireLab) | Multi-platform community analysis for foundations. No health scores, no gamification |
| [RepoTracker](https://githubtracker.com) | Basic GitHub stats with charts | Simple stats viewer. No health scores, no bus factor, no AI, no gamification |
| [Repo Doctor](https://github.com/nicepkg/repo-doctor) | CLI-based repo health audit | CLI tool for one-time audits, not a web dashboard for ongoing monitoring |

### Feature Overlap Matrix

✅ = Has it &emsp; ⚠️ = Partial &emsp; ❌ = Doesn't have it

| Feature | **GitVital** | repopulse.dev | OSS Insight | GitPulse | CodeScene |
|---|:---:|:---:|:---:|:---:|:---:|
| Health Score (0-100) | ✅ | ✅ | ❌ | ✅ | ✅ |
| Bus Factor | ✅ | ✅ | ❌ | ❌ | ✅ |
| PR Merge Time Analysis | ✅ | ❌ | ✅ | ✅ | ✅ |
| Risk Flags (plain English) | ✅ | ❌ | ❌ | ❌ | ⚠️ |
| Repo vs Repo Comparison | ✅ | ❌ | ✅ | ✅ | ❌ |
| Health Timeline (trends) | ✅ | ❌ | ✅ | ✅ | ✅ |
| AI-Powered Advice | ✅ | ⚠️ | ❌ | ❌ | ✅ |
| **Developer Health Score** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Gamified Badges** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Global Leaderboard** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Embeddable SVG Badge** | ✅ | ❌ | ❌ | ❌ | ❌ |

### What Makes This Project Different

The core analytics (commits, PRs, issues, contributors) are table stakes — most tools compute these. Where GitVital diverges is the **developer-centric gamification layer**:

- **Developer Health Score** — Aggregating metrics across all of a user's repositories into a single profile score. No existing tool does this.
- **Gamified Achievement Badges** — Unlockable badges like *"The Speedster"* (< 2hr PR merge time) and *"The Closer"* (50+ resolved issues). Designed to drive engagement the way Spotify Wrapped drives sharing.
- **Global Leaderboard** — Percentile rankings using PostgreSQL window functions. "You're better than 90% of developers on GitVital."
- **Embeddable SVG Badges** — Dynamic health badges for READMEs. Every badge is organic distribution.

Together, these features turn GitVital from a passive analytics dashboard into an active engagement platform for developers.

## Getting Started (Local Development)

*(Instructions for cloning, installing dependencies, setting up `.env` files for GitHub OAuth, PostgreSQL, and Redis, and running locally will be added here as the project is developed.)*

---
*Built with Next.js, Node.js, PostgreSQL, Redis, BullMQ, and the GitHub GraphQL API.*
