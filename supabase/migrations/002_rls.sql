-- ============================================================================
-- Weblaze EMS v3 — Row-Level Security Policies
-- Migration: 002_rls.sql
-- Default-deny: all tables enabled, then scoped policies added
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS (security definer to access app_user table)
-- ============================================================================

-- Returns the role of the currently authenticated user
create or replace function public.get_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.app_user where id = auth.uid();
$$;

-- Returns the department_id of the currently authenticated user
create or replace function public.get_user_department()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select department_id from public.app_user where id = auth.uid();
$$;

-- Returns true if current user is a super_admin
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (role = 'super_admin') from public.app_user where id = auth.uid();
$$;

-- Returns true if current user is an admin (or super_admin)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (role in ('admin', 'super_admin')) from public.app_user where id = auth.uid();
$$;

-- Returns true if current user is an admin of the given department
-- (admins only see their own department; super_admins see all)
create or replace function public.is_department_admin(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_user
    where id = auth.uid()
      and (
        role = 'super_admin'
        or (role = 'admin' and department_id = p_department_id)
      )
  );
$$;

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================
alter table public.department    enable row level security;
alter table public.app_user      enable row level security;
alter table public.task          enable row level security;
alter table public.attendance    enable row level security;
alter table public.eod_report    enable row level security;
alter table public.weekly_report enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.audit_log     enable row level security;

-- ============================================================================
-- POLICIES: department
-- ============================================================================

-- SELECT: all authenticated users can read departments
create policy "Departments are viewable by authenticated users"
  on public.department
  for select
  to authenticated
  using (true);

-- INSERT: super_admin only
create policy "Departments can be created by super_admin"
  on public.department
  for insert
  to authenticated
  with check (public.is_super_admin());

-- UPDATE: super_admin only
create policy "Departments can be updated by super_admin"
  on public.department
  for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- DELETE: super_admin only
create policy "Departments can be deleted by super_admin"
  on public.department
  for delete
  to authenticated
  using (public.is_super_admin());

-- ============================================================================
-- POLICIES: app_user
-- ============================================================================

-- SELECT: users can see their own row; admins see department members; super_admin sees all
create policy "Users can view own profile or department members"
  on public.app_user
  for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_department_admin(department_id)
    or public.is_super_admin()
  );

-- INSERT: service_role only (handled by handle_new_user trigger)
-- No insert policy for authenticated — this is intentional.
-- The trigger on auth.users handles app_user creation with elevated privileges.

-- UPDATE: admins can update own department members; super_admin can update all;
--         users can update their own non-role, non-department fields
create policy "Users can update own profile (limited fields)"
  on public.app_user
  for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- Regular users cannot change their own role, department, or status
    and role = (select role from public.app_user where id = auth.uid())
    and department_id is not distinct from (select department_id from public.app_user where id = auth.uid())
    and status = (select status from public.app_user where id = auth.uid())
  );

create policy "Admins can update department members"
  on public.app_user
  for update
  to authenticated
  using (
    public.is_department_admin(department_id)
    and id != auth.uid()  -- admins use the self-update policy for themselves
  )
  with check (
    public.is_department_admin(department_id)
  );

-- DELETE: super_admin only (soft-delete via status = 'inactive' recommended)
create policy "Super admin can delete users"
  on public.app_user
  for delete
  to authenticated
  using (public.is_super_admin());

-- ============================================================================
-- POLICIES: task
-- ============================================================================

-- SELECT: assigned user, assigning user, department admin, super_admin
create policy "Tasks viewable by involved users and admins"
  on public.task
  for select
  to authenticated
  using (
    assigned_to = auth.uid()
    or assigned_by = auth.uid()
    or public.is_department_admin(
      (select department_id from public.app_user where id = public.task.assigned_to)
    )
  );

-- INSERT: admins/super_admins for their own department
create policy "Tasks creatable by department admins"
  on public.task
  for insert
  to authenticated
  with check (
    public.is_department_admin(
      (select department_id from public.app_user where id = assigned_to)
    )
  );

-- UPDATE: assigned user can update status only; admins can update all fields
create policy "Assigned user can update task status"
  on public.task
  for update
  to authenticated
  using (assigned_to = auth.uid())
  with check (
    assigned_to = auth.uid()
    -- Only allow status changes; other fields unchanged
    and title = (select title from public.task where id = public.task.id)
    and description is not distinct from (select description from public.task where id = public.task.id)
    and assigned_to = (select assigned_to from public.task where id = public.task.id)
    and assigned_by = (select assigned_by from public.task where id = public.task.id)
    and priority = (select priority from public.task where id = public.task.id)
    and due_date is not distinct from (select due_date from public.task where id = public.task.id)
  );

create policy "Department admins can update any task field"
  on public.task
  for update
  to authenticated
  using (
    public.is_department_admin(
      (select department_id from public.app_user where id = public.task.assigned_to)
    )
    and assigned_to != auth.uid()  -- avoid overlap with self-update policy
  )
  with check (
    public.is_department_admin(
      (select department_id from public.app_user where id = assigned_to)
    )
  );

-- DELETE: department admin or super_admin only
create policy "Department admins can delete tasks"
  on public.task
  for delete
  to authenticated
  using (
    public.is_department_admin(
      (select department_id from public.app_user where id = public.task.assigned_to)
    )
  );

-- ============================================================================
-- POLICIES: attendance
-- ============================================================================

-- SELECT: own records; admin sees department; super_admin sees all
create policy "Attendance viewable by own user and department admins"
  on public.attendance
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_department_admin(
      (select department_id from public.app_user where id = public.attendance.user_id)
    )
  );

-- INSERT: own records only (check-in)
create policy "Users can create own attendance record"
  on public.attendance
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- UPDATE: own records only (check-out, status updates)
create policy "Users can update own attendance record"
  on public.attendance
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE: super_admin only
create policy "Super admin can delete attendance records"
  on public.attendance
  for delete
  to authenticated
  using (public.is_super_admin());

-- ============================================================================
-- POLICIES: eod_report
-- ============================================================================

-- SELECT: own records; admin sees department; super_admin sees all
create policy "EOD reports viewable by own user and department admins"
  on public.eod_report
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_department_admin(
      (select department_id from public.app_user where id = public.eod_report.user_id)
    )
  );

-- INSERT: own records only
create policy "Users can create own EOD report"
  on public.eod_report
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- UPDATE: own records only (within grace period, enforced at app level)
create policy "Users can update own EOD report"
  on public.eod_report
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE: super_admin only
create policy "Super admin can delete EOD reports"
  on public.eod_report
  for delete
  to authenticated
  using (public.is_super_admin());

-- ============================================================================
-- POLICIES: weekly_report
-- ============================================================================

-- SELECT: own records; admin sees department; super_admin sees all
create policy "Weekly reports viewable by own user and department admins"
  on public.weekly_report
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_department_admin(
      (select department_id from public.app_user where id = public.weekly_report.user_id)
    )
  );

-- INSERT/UPDATE: service_role only (auto-generated by process_weekly_rollup)
create policy "Weekly reports insertable by service_role"
  on public.weekly_report
  for insert
  to service_role
  with check (true);

create policy "Weekly reports updatable by service_role"
  on public.weekly_report
  for update
  to service_role
  using (true)
  with check (true);

-- DELETE: super_admin only
create policy "Super admin can delete weekly reports"
  on public.weekly_report
  for delete
  to authenticated
  using (public.is_super_admin());

-- ============================================================================
-- POLICIES: daily_metrics
-- ============================================================================

-- SELECT: own records; admin sees department; super_admin sees all
create policy "Daily metrics viewable by own user and department admins"
  on public.daily_metrics
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_department_admin(
      (select department_id from public.app_user where id = public.daily_metrics.user_id)
    )
  );

-- INSERT: own records only
create policy "Users can create own daily metrics"
  on public.daily_metrics
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- UPDATE: own records only
create policy "Users can update own daily metrics"
  on public.daily_metrics
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE: super_admin only
create policy "Super admin can delete daily metrics"
  on public.daily_metrics
  for delete
  to authenticated
  using (public.is_super_admin());

-- ============================================================================
-- POLICIES: audit_log
-- ============================================================================

-- SELECT: super_admin only
create policy "Audit logs viewable by super_admin only"
  on public.audit_log
  for select
  to authenticated
  using (public.is_super_admin());

-- INSERT: authenticated users (system logs actions on their behalf)
create policy "Audit logs insertable by authenticated users"
  on public.audit_log
  for insert
  to authenticated
  with check (actor_id = auth.uid());

-- UPDATE/DELETE: nobody (immutable log)
create policy "Audit logs are immutable (no update)"
  on public.audit_log
  for update
  to authenticated
  using (false);

create policy "Audit logs are immutable (no delete)"
  on public.audit_log
  for delete
  to authenticated
  using (false);

-- ============================================================================
-- POLICIES: v_missed_eod (view)
-- ============================================================================

-- The view uses underlying table RLS implicitly. Admins see their department,
-- super_admin sees all, employees see only themselves through the JOIN filters.
-- No additional policy needed — the view inherits RLS from app_user and department.

-- ============================================================================
-- GRANT: ensure authenticated role can execute helper functions
-- ============================================================================
grant execute on function public.get_user_role()           to authenticated;
grant execute on function public.get_user_department()     to authenticated;
grant execute on function public.is_super_admin()          to authenticated;
grant execute on function public.is_admin()                to authenticated;
grant execute on function public.is_department_admin(uuid) to authenticated;
