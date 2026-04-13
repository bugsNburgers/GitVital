# Contributing to GitVital

Thanks for contributing. This project uses a strict contribution workflow to keep reviews fast, safe, and easy to merge.

## Core Rules (Required)

1. One issue per pull request.
2. One pull request solves one issue only.
3. One commit per pull request.
4. No multi-issue PRs.
5. No commit stacking in a PR.

If your branch has multiple commits, squash before opening the PR.

## Before You Start

1. Check existing issues first.
2. If no issue exists, open a new issue describing the problem/feature.
3. Wait until scope is clear.
4. Then create a branch for that single issue.

Suggested branch names:

- feat/issue-<id>-short-topic
- fix/issue-<id>-short-topic
- docs/issue-<id>-short-topic

## Local Setup

Follow the complete environment and run instructions in [SETUP.md](SETUP.md).

This repo is Node.js-based (backend + frontend). There is no Python requirements.txt workflow.

## Development Standards

Keep changes focused and minimal:

1. Touch only files needed for the issue.
2. Do not mix refactors with feature/fix work unless required by the issue.
3. Do not include unrelated formatting changes.
4. Keep public API behavior stable unless the issue explicitly changes it.

## Validation Before PR

Run these checks before opening your PR:

```bash
cd backend
npm run build

cd ../frontend
npm run lint
npm run build
```

Also run the app locally and verify your specific issue scenario end-to-end.

## Commit Policy (Strict)

Your PR must contain exactly one commit.

Use a clear commit message, for example:

- fix: handle worker retry backoff for stale Redis job
- feat: add leaderboard pagination metadata
- docs: clarify local docker vs non-docker run modes

If needed, squash with:

```bash
git rebase -i HEAD~<n>
```

Then force-push your branch:

```bash
git push --force-with-lease
```

## Pull Request Checklist

Every PR should include:

1. Linked issue number.
2. Short summary of what changed.
3. Why the change is needed.
4. Validation evidence (commands, logs, screenshots when UI is affected).
5. Notes about env vars, SQL scripts, or migration impact (if any).

PRs will be asked to revise if they include multiple issues or multiple commits.

## Security Policy (Read Before Reporting)

For vulnerabilities, do not open a public issue.

Follow the private reporting process in [.github/SECURITY.md](.github/SECURITY.md):

1. Preferred: GitHub private vulnerability reporting.
2. Fallback: private security advisory draft in this repository.

Include clear reproduction steps, impact, and minimal proof of concept.

## Scope Guidance for Contributors

Good first contribution areas in this codebase:

1. Backend API behavior in [backend/src/server/index.ts](backend/src/server/index.ts)
2. Worker logic in [backend/src/workers/repoAnalyzer.ts](backend/src/workers/repoAnalyzer.ts) and [backend/src/workers/userAnalyzer.ts](backend/src/workers/userAnalyzer.ts)
3. Metrics modules in [backend/src/metrics](backend/src/metrics)
4. Frontend pages/components in [frontend/src/app](frontend/src/app) and [frontend/src/components](frontend/src/components)
5. SQL evolution under [backend/sql](backend/sql)

Keep each PR tightly scoped to one of those targets per issue.

## Maintainer Review Expectations

Maintainers prioritize:

1. Correctness and safety.
2. Scope discipline (one issue, one PR, one commit).
3. Reproducible validation.
4. No secrets, tokens, or private keys in code or logs.

Thank you for helping improve GitVital.