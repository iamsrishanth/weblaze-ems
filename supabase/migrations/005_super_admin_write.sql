-- ============================================================================
-- Weblaze EMS v3 — Super Admin cross-department write access
-- Migration: 005_super_admin_write.sql
--
-- 002_rls.sql gave super_admin READ access to every department (via
-- is_department_admin, which short-circuits on role='super_admin'), but the
-- write policies on the day-to-day tables were "own rows only". A super admin
-- therefore could see everyone's data and edit none of it.
--
-- These policies are additive: Postgres ORs permissive policies together, so
-- the existing self-service policies keep working unchanged.
-- ============================================================================

-- Attendance: full management (create / correct / remove any employee's record)
create policy "Super admin can manage all attendance"
  on public.attendance
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- EOD reports: full management (submit or correct on behalf of any employee)
create policy "Super admin can manage all EOD reports"
  on public.eod_report
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Daily metrics: full management
create policy "Super admin can manage all daily metrics"
  on public.daily_metrics
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Weekly reports: currently service_role-only (rollup job). Allow super admin
-- to correct a generated report without going through SQL.
create policy "Super admin can manage all weekly reports"
  on public.weekly_report
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Tasks: already writable through is_department_admin(), which returns true
-- for super_admin on any department. No change needed.
