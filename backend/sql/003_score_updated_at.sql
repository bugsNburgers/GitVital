-- 003_score_updated_at.sql
-- Migration: ensure score_updated_at tracking exists
-- Safe to run multiple times (all statements are idempotent).
--
-- PURPOSE: Track exactly when developer_score was last recomputed so the
-- frontend can display "Last updated X ago" and the cron anti-manipulation
-- check (shouldFlagScoreChangeForManualReview) can compare against it.
--
-- NOTE: The users.updated_at column already exists and is maintained by
-- the trg_users_set_updated_at trigger, so we reuse it as the score timestamp.
-- No new column is required — this migration is intentionally a no-op DDL
-- to document that decision and keeps the script count consistent.

BEGIN;

-- Re-affirm the trigger exists (idempotent — trigger was created in 001).
-- This is a sanity guard for fresh DB restores that may only have run
-- a subset of the migration files.
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;

CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- Ensure the materialized view index exists (needed for CONCURRENTLY refresh).
-- Safe no-op if it already exists.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_id ON leaderboard_rankings (id);

COMMIT;
