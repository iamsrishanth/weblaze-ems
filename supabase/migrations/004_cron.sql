-- ============================================================================
-- Weblaze EMS v3 — pg_cron Scheduled Jobs
-- Migration: 004_cron.sql
-- Requires pg_cron extension enabled (included in 001_schema.sql)
-- ============================================================================

-- ============================================================================
-- JOB 1: EOD Cutoff — runs Mon-Sat at 12:35 UTC (6:05 PM IST)
-- Marks employees who haven't submitted their EOD as 'missed'
-- ============================================================================
select cron.schedule(
  'eod-cutoff',                    -- job name (unique)
  '35 12 * * 1-6',                -- cron: 12:35 UTC, Mon-Sat
  $$
    select public.process_eod_cutoff();
  $$
);

-- ============================================================================
-- JOB 2: Weekly Rollup — runs Saturday at 12:35 UTC (6:05 PM IST)
-- Generates weekly_report entries for all active users
-- ============================================================================
select cron.schedule(
  'weekly-rollup',                 -- job name (unique)
  '35 12 * * 6',                  -- cron: 12:35 UTC, Saturday only
  $$
    select public.process_weekly_rollup();
  $$
);

-- ============================================================================
-- VERIFICATION: list all scheduled jobs
-- ============================================================================
-- Run this to verify:
--   select * from cron.job;

-- ============================================================================
-- UNSCHEDULE (for idempotent re-runs):
-- Uncomment to remove and re-add jobs:
--   select cron.unschedule('eod-cutoff');
--   select cron.unschedule('weekly-rollup');
-- ============================================================================
