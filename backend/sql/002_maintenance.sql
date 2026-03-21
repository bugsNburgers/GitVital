-- PostgreSQL Query Optimization & Maintenance
-- 
-- 1. Index usage:
--    The indexes are already defined in 001_refined_schema.sql.
--    - For latest metrics: repo_metrics (repo_id, analyzed_at DESC)
--    - For leaderboard: materialized view (leaderboard_rankings)
--
-- 2. VACUUM ANALYZE:
--    Run this script weekly via a cron job or pg_cron to optimize query planner stats
--    and reclaim space from dead tuples in high-churn tables.

-- High churn table: updated heavily by the BullMQ worker
VACUUM ANALYZE repo_metrics;

-- Job state tracking table
VACUUM ANALYZE analysis_jobs;

-- Health score history table
VACUUM ANALYZE health_timeline;

-- Users table (scores updated daily)
VACUUM ANALYZE users;
