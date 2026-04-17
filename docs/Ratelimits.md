**Main idea**
This has 3 different kinds of limits:
1. Request-speed limits (per minute / per 15 min)
2. Daily usage caps (per user / per IP / global)
3. Background worker throughput caps (jobs per minute, concurrency)

**A) Limits for Analyze/Reanalyze click (POST /api/analyze)**
1. Global API limit for everyone:
- 30 requests per minute
- Applies to all routes
- Source: index.ts, index.ts

2. Analyze route limit (logged-in):
- 20 requests per 15 minutes
- Keyed by account userId
- Source: index.ts, index.ts

3. Analyze route limit (logged-out):
- 10 requests per 15 minutes
- Keyed by IP
- Source: index.ts, index.ts

4. Pending jobs cap (logged-in only):
- Max 5 queued/active analyses per user
- If exceeded: 429 Too many pending analyses
- Source: index.ts, index.ts

5. Daily unique repos cap (Analyze):
- Logged-in: max 20 unique repos/day per user
- Logged-out: max 5 unique repos/day per IP
- If exceeded: 429
- Source: index.ts, index.ts, index.ts, index.ts

6. Daily Gemini advice soft cap inside Analyze:
- Logged-in: 20/day (per user)
- Logged-out: 10/day (per IP)
- Important: this does not block analysis; it forces rule-based fallback advice
- Source: index.ts, index.ts, index.ts

7. Rapid-fire detector:
- Threshold: 8 requests/min per IP
- Only logs alert, does not block
- Source: index.ts, index.ts

**B) Limits for AI/Gemini routes**
1. AI Insights route (POST /api/user/:username/ai-insights):
- 5 requests/min per IP
- Source: index.ts

2. Recommendations route (GET /api/repo/:owner/:repo/recommendations):
- 10 requests/min per IP
- Also requires login
- Source: index.ts, index.ts

3. Compare Insights route (POST /api/compare/insights):
- 5 requests/min per IP
- Daily cap: logged-in 20/day, logged-out 5/day
- Logged-out users can run up to 5 compare insights requests/day, then must login
- Source: index.ts, index.ts

4. Daily quota status endpoint:
- GET /api/quota/daily
- Returns loggedIn, analyzeDaily { limit, used, remaining, resetAt }, compareDaily { limit, used, remaining, resetAt }
- Used by frontend to show "requests left today" counters

5. Daily Gemini quota gate (shared across AI endpoints):
- Global: 200/day across all AI calls
- User bucket: 15/day
- If exceeded: 429 QUOTA_EXCEEDED with limitHit user/global
- Source: globalQuotaGate.ts, globalQuotaGate.ts, index.ts, index.ts, index.ts

6. Gemini cooldown fallback:
- If Gemini returns quota/rate-limit-like errors, set cooldown in Redis (15s)
- During cooldown, code falls back to rule-based output
- Source: quotaTelemetry.ts, quotaTelemetry.ts, userInsights.ts

**C) Other route limits**
1. Leaderboard:
- 30 requests/min
- Source: index.ts

2. Badge endpoints:
- 60 requests/min
- Source: index.ts

**D) GitHub API limiting behavior**
1. If GitHub rate limit is hit in Analyze path:
- Backend can return 429 with code GITHUB_RATE_LIMITED
- Source: index.ts

2. GitHub client behavior:
- Retries with backoff on transient failures
- Throws RateLimitError on provider limit
- Sleeps when remaining GitHub limit gets low
- Source: client.ts, client.ts, client.ts, client.ts

**E) Redis and DB limits (your exact ask)**
1. Redis:
- Used for counters, cache, sessions, queue state
- No explicit “Redis requests per minute” limiter found in code

2. Database:
- No explicit “DB queries per minute” limiter found
- One shared DB pool helper is capped at 5 connections
- Source: pool.ts

3. Queue worker throughput caps:
- Repo analysis worker: max 5 jobs/min, concurrency 2
- User analysis worker: max 10 jobs/min, concurrency 2
- Source: repoAnalyzer.ts, repoAnalyzer.ts, userAnalyzer.ts, userAnalyzer.ts

**Important gotcha for logged-out AI Insights**
For AI Insights, logged-out requests still use the username in URL as quota bucket, so many people hitting the same username can burn that username’s 15/day bucket.
Source: index.ts
