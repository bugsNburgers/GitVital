# Database Integration Plan (Prisma)

This plan outlines the steps to move from "partial setup" to a fully integrated persistence layer using Prisma and PostgreSQL.

## Proposed Changes

### [Component] Database Layer (Prisma)

#### [NEW] [schema.prisma](file:///c:/Users/Suprateek Yawagal/Downloads/Gitvital/gitvital/backend/prisma/schema.prisma)
- Define models for [User](file:///c:/Users/Suprateek%20Yawagal/Downloads/Gitvital/gitvital/backend/src/server/index.ts#55-58), [Repo](file:///c:/Users/Suprateek%20Yawagal/Downloads/Gitvital/gitvital/frontend/src/app/page.tsx#122-132), [AnalysisJob](file:///c:/Users/Suprateek%20Yawagal/Downloads/Gitvital/gitvital/backend/src/workers/repoAnalyzer.ts#241-569), `RepoMetrics`, and `HealthTimeline` matching the [001_refined_schema.sql](file:///c:/Users/Suprateek%20Yawagal/Downloads/Gitvital/gitvital/backend/sql/001_refined_schema.sql).
- Configure the PostgreSQL datasource and client generator.

#### [NEW] [prisma.ts](file:///c:/Users/Suprateek Yawagal/Downloads/Gitvital/gitvital/backend/src/config/prisma.ts)
- Initialize and export a global `PrismaClient` instance to be used across the server and workers.

### [Component] API Server

#### [MODIFY] [index.ts](file:///c:/Users/Suprateek%20Yawagal/Downloads/Gitvital/gitvital/backend/src/server/index.ts)
- Uncomment the database calls in `/api/repo/:owner/:repo`, `api/user/:username`, and leaderboard routes.
- Replace placeholders with actual Prisma queries.

### [Component] Analysis Worker

#### [MODIFY] [repoAnalyzer.ts](file:///c:/Users/Suprateek%20Yawagal/Downloads/Gitvital/gitvital/backend/src/workers/repoAnalyzer.ts)
- Uncomment the database calls to update [AnalysisJob](file:///c:/Users/Suprateek%20Yawagal/Downloads/Gitvital/gitvital/backend/src/workers/repoAnalyzer.ts#241-569) status and store `RepoMetrics`.
- Ensure the worker persists computed results to the `repo_metrics` table.

## Verification Plan

### Automated Tests
- Run `npx prisma generate` to ensures types are correctly built.
- Run `npx prisma db push` to verify that the Prisma schema is compatible with the existing Neon DB tables.

### Manual Verification
1.  **Start Backend & Worker:** `npm run dev` and `npm run worker`.
2.  **Trigger Analysis:** Submit a repository for analysis in the frontend.
3.  **Check DB:** Verify a new row exists in the `repo_metrics` table using the Neon SQL Editor.
4.  **Refresh Page:** Ensure the dashboard loads data from the DB instead of showing "No metrics found".
