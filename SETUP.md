# GitVital Setup for Open Source Contributors

This guide is for contributors who want a reliable, repeatable local setup for development and testing.

It covers both runtime modes used in this repo:

- Local contributor mode: Docker for Redis, Node processes on your machine.
- Production-style local mode: no Docker, run each service in separate terminals (frontend, backend API, worker).

## 1. Prerequisites

Install these before starting:

- Node.js 20+ and npm 10+
- Git
- PostgreSQL database (local or managed, e.g. Neon)
- Redis (local, managed, or Docker)
- GitHub OAuth App
- Optional: Gemini API key (AI features fall back when missing)

Required OAuth callback URL for local:

- http://localhost:8080/auth/github/callback

Important project note:

- This repository does not use Python and does not require a requirements.txt file.

## 2. Fork, Clone, Install

1. Fork this repository on GitHub.
2. Clone your fork and enter the project.
3. Install dependencies in backend and frontend.

```bash
git clone https://github.com/<your-username>/GitVital.git
cd GitVital

cd backend
npm install

cd ../frontend
npm install
```

## 3. Backend Environment Setup

Create backend environment file from template:

PowerShell:

```powershell
Copy-Item .\backend\.env.example .\backend\.env
```

macOS/Linux:

```bash
cp backend/.env.example backend/.env
```

Update backend/.env values.

Minimum required for stable local runtime:

- PORT=8080
- NODE_ENV=development
- FRONTEND_URL=http://localhost:3000
- DATABASE_URL=<postgres connection string>
- REDIS_URL=<redis connection string>
- ENCRYPTION_KEY=<64-char hex>
- SESSION_SECRET=<64-char hex>

Used for OAuth login:

- GITHUB_CLIENT_ID
- GITHUB_CLIENT_SECRET
- GITHUB_CALLBACK_URL=http://localhost:8080/auth/github/callback

Optional but recommended:

- GEMINI_API_KEY
- GITHUB_TOKEN (or GITHUB_ACCESS_TOKEN) for worker fallback when user token is unavailable
- MONTHLY_COST_TARGET_USD, FREE_TIER_ONLY, DEGRADE_GRACEFULLY_ON_LIMIT

Generate secure keys:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 4. Database Bootstrap (PostgreSQL)

Run SQL scripts in order against your target database:

1. backend/sql/001_refined_schema.sql
2. backend/sql/003_score_updated_at.sql

Optional maintenance script (not bootstrap):

- backend/sql/002_maintenance.sql

Example using psql:

```bash
psql "$DATABASE_URL" -f backend/sql/001_refined_schema.sql
psql "$DATABASE_URL" -f backend/sql/003_score_updated_at.sql
```

## 5. Runtime Modes

### Mode A: Local Contributor Mode (Docker for Redis)

Use this when developing locally and you want Redis to be one command away.

1. Start Redis container:

```bash
docker compose up -d redis
```

2. Set REDIS_URL in backend/.env for local docker redis:

```env
REDIS_URL=redis://localhost:6379
```

3. Start app services in separate terminals.

Terminal 1 (Backend API):

```bash
cd backend
npm run dev
```

Terminal 2 (Repo Worker):

```bash
cd backend
npm run worker
```

Terminal 3 (Frontend):

```bash
cd frontend
npm run dev
```

Optional Terminal 4 (User Worker):

```bash
cd backend
npm run worker:user
```

Optional Terminal 5 (Cron refresher/recompute):

```bash
cd backend
npm run cron:refresh
```

### Mode B: Production-Style Local Mode (No Docker)

Use this when validating behavior closer to deployment.

1. Point backend/.env to managed/local infra (no Docker):

- REDIS_URL=rediss://... (or redis://...)
- DATABASE_URL=postgresql://...

2. Build both apps:

```bash
cd backend
npm run build

cd ../frontend
npm run build
```

3. Run services in separate terminals.

Terminal 1 (Backend API, production runtime):

```bash
cd backend
npm run start
```

Terminal 2 (Repo Worker, built JS runtime):

```bash
cd backend
node -r dotenv/config dist/workers/repoAnalyzer.js
```

Terminal 3 (Frontend, production runtime):

```bash
cd frontend
npm run start
```

Optional Terminal 4 (User Worker, built JS runtime):

```bash
cd backend
node -r dotenv/config dist/workers/userAnalyzer.js
```

Optional Terminal 5 (Cron, built JS runtime):

```bash
cd backend
node -r dotenv/config dist/cron/refreshRepos.js
```

## 6. Multi-Process Rules (Important)

- Standard run pattern is 3 terminals: backend API + repo worker + frontend.
- Do not run dedicated workers and inline workers together.
- Inline workers are only enabled when EMBED_WORKERS_IN_API=true.
- If EMBED_WORKERS_IN_API=true for API process, do not run npm run worker and npm run worker:user separately.

## 7. Verification Checklist

- Frontend opens at http://localhost:3000
- Backend responds at http://localhost:8080
- OAuth entrypoint loads: http://localhost:8080/auth/github
- Worker terminal shows Redis connection and job processing logs
- Analyze a repo from UI and verify status transitions queued -> processing -> done

## 8. Contribution Workflow

1. Create a branch from latest main.

```bash
git checkout main
git pull upstream main
git checkout -b feat/<short-topic>
```

2. Make changes.
3. Validate before opening PR:

```bash
cd backend
npm run build

cd ../frontend
npm run lint
npm run build
```

4. Commit with clear message.
5. Push branch and open PR to main.
6. In PR description include:

- What changed
- Why it changed
- How you tested (commands + screenshots/logs)
- Any env vars or migration impact

## 9. Troubleshooting

- Backend fails early with missing env var:
	- Check backend/.env, especially REDIS_URL, ENCRYPTION_KEY, SESSION_SECRET.
- Worker errors with GitHub token unavailable:
	- Add GITHUB_TOKEN (or re-authenticate and ensure user OAuth token exists).
- Redis connection refused:
	- If Docker mode, run docker compose ps and ensure redis container is up.
	- If no Docker, verify REDIS_URL and network access.
- OAuth loops or callback mismatch:
	- Ensure GitHub app callback exactly matches backend env callback URL.

## 10. Security and Secrets

- Never commit backend/.env or any real credentials.
- Rotate secrets immediately if leaked.
- Use backend/.env.example as the safe source-of-truth template for contributors.
