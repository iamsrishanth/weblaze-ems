-- ============================================================================
-- Weblaze EMS — Performance indexes
-- Migration: 008_performance_indexes.sql
--
-- The dashboard and reports screens aggregate by date, department and status.
-- Without these, every load scans the whole table. All are IF NOT EXISTS, so
-- this is safe to re-run.
-- ============================================================================

-- Attendance: team lookups by date, history by user + date
create index if not exists idx_attendance_work_date
  on public.attendance (work_date);

create index if not exists idx_attendance_user_work_date
  on public.attendance (user_id, work_date desc);

-- EOD reports: compliance and history are date-scoped
create index if not exists idx_eod_report_report_date
  on public.eod_report (report_date desc);

create index if not exists idx_eod_report_user_report_date
  on public.eod_report (user_id, report_date desc);

create index if not exists idx_eod_report_status
  on public.eod_report (status);

-- Weekly reports: listed newest-first by week
create index if not exists idx_weekly_report_week_start
  on public.weekly_report (week_start desc);

-- Tasks: filtered by assignee and status, sorted by due date
create index if not exists idx_task_assigned_to
  on public.task (assigned_to);

create index if not exists idx_task_status
  on public.task (status);

create index if not exists idx_task_due_date
  on public.task (due_date);

-- Users: department scoping and active-only filters
create index if not exists idx_app_user_department
  on public.app_user (department_id);

create index if not exists idx_app_user_status
  on public.app_user (status);

-- Daily metrics: per-user, per-day
create index if not exists idx_daily_metrics_user_entry
  on public.daily_metrics (user_id, entry_date desc);

-- Keep the planner's statistics current after the historical import
analyze public.attendance;
analyze public.eod_report;
analyze public.weekly_report;
analyze public.task;
analyze public.app_user;
