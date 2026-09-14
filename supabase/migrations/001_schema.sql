-- ============================================================================
-- Weblaze EMS v3 — Schema Definition
-- Migration: 001_schema.sql
-- Tables, indexes, triggers, helper functions, views
-- ============================================================================

-- Extensions (idempotent via IF NOT EXISTS)
create extension if not exists "citext" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_cron" with schema pg_catalog;

-- Drop existing objects to make migration idempotent (reverse dependency order)
drop view if exists v_missed_eod cascade;
drop function if exists process_weekly_rollup cascade;
drop function if exists process_eod_cutoff cascade;
drop function if exists handle_new_user cascade;
drop function if exists audit_log_trigger_fn cascade;
drop trigger if exists tr_audit_log on public.audit_log;
drop table if exists public.audit_log cascade;
drop table if exists public.weekly_report cascade;
drop table if exists public.daily_metrics cascade;
drop table if exists public.eod_report cascade;
drop table if exists public.attendance cascade;
drop table if exists public.task cascade;
drop table if exists public.app_user cascade;
drop table if exists public.department cascade;

-- Drop custom types
drop type if exists public.user_role cascade;
drop type if exists public.user_status cascade;
drop type if exists public.task_priority cascade;
drop type if exists public.task_status cascade;
drop type if exists public.attendance_status cascade;
drop type if exists public.eod_status cascade;

-- ============================================================================
-- ENUM TYPES
-- ============================================================================
create type public.user_role as enum (
  'super_admin',
  'admin',
  'employee'
);

create type public.user_status as enum (
  'active',
  'inactive'
);

create type public.task_priority as enum (
  'low',
  'medium',
  'high',
  'urgent'
);

create type public.task_status as enum (
  'todo',
  'in_progress',
  'blocked',
  'done'
);

create type public.attendance_status as enum (
  'present',
  'late',
  'half_day',
  'absent'
);

create type public.eod_status as enum (
  'submitted',
  'missed',
  'late'
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- 1. department
create table public.department (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  head_id       uuid,                              -- FK to app_user (added after app_user creation)
  leads_target  numeric not null default 0,        -- daily leads target for the department
  calls_target  numeric not null default 0,        -- daily calls target for the department
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2. app_user
create table public.app_user (
  id              uuid primary key,                 -- = auth.users.id (1:1)
  name            text not null,
  email           public.citext not null unique,
  role            public.user_role not null default 'employee',
  department_id   uuid references public.department(id) on delete set null,
  manager_id      uuid references public.app_user(id) on delete set null,
  status          public.user_status not null default 'active',
  must_change_pw  boolean not null default true,
  join_date       date not null default current_date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Now add FK from department.head_id -> app_user (deferred due to circular dep)
alter table public.department
  add constraint fk_department_head
  foreign key (head_id) references public.app_user(id) on delete set null;

-- 3. task
create table public.task (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  assigned_to   uuid not null references public.app_user(id) on delete cascade,
  assigned_by   uuid not null references public.app_user(id) on delete cascade,
  priority      public.task_priority not null default 'medium',
  status        public.task_status not null default 'todo',
  due_date      date,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 4. attendance
create table public.attendance (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.app_user(id) on delete cascade,
  work_date     date not null,
  check_in_at   timestamptz,
  check_out_at  timestamptz,
  status        public.attendance_status not null default 'present',
  total_hours   numeric(5,2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, work_date)
);

-- 5. eod_report (End-of-Day report)
create table public.eod_report (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.app_user(id) on delete cascade,
  report_date     date not null,
  summary         text,
  tasks_completed uuid[] default '{}',
  hours_worked    numeric(4,2),
  status          public.eod_status not null default 'submitted',
  submitted_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, report_date)
);

-- 6. weekly_report (auto-generated rollup)
create table public.weekly_report (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.app_user(id) on delete cascade,
  week_start      date not null,
  week_end        date not null,
  leads_total     integer not null default 0,
  calls_total     integer not null default 0,
  tasks_completed integer not null default 0,
  eod_submitted   integer not null default 0,
  days_present    integer not null default 0,
  employee_note   text,
  generated_at    timestamptz not null default now(),
  unique (user_id, week_start)
);

-- 7. daily_metrics (simple daily logging of leads/calls per user)
create table public.daily_metrics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.app_user(id) on delete cascade,
  entry_date  date not null,
  leads       integer not null default 0,
  calls       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, entry_date)
);

-- 8. audit_log
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,                               -- nullable: system actions have no actor
  action      text not null,
  target_type text,
  target_id   uuid,
  details     jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- app_user
create index idx_app_user_department on public.app_user(department_id);
create index idx_app_user_manager   on public.app_user(manager_id);
create index idx_app_user_role      on public.app_user(role);
create index idx_app_user_status    on public.app_user(status);

-- task
create index idx_task_assigned_to   on public.task(assigned_to);
create index idx_task_assigned_by   on public.task(assigned_by);
create index idx_task_status        on public.task(status);
create index idx_task_due_date      on public.task(due_date) where due_date is not null;

-- attendance
create index idx_attendance_user_date on public.attendance(user_id, work_date desc);
create index idx_attendance_status    on public.attendance(status);

-- eod_report
create index idx_eod_user_date  on public.eod_report(user_id, report_date desc);
create index idx_eod_status     on public.eod_report(status);

-- weekly_report
create index idx_weekly_user_start on public.weekly_report(user_id, week_start desc);

-- daily_metrics
create index idx_daily_metrics_user_date on public.daily_metrics(user_id, entry_date desc);

-- audit_log
create index idx_audit_actor     on public.audit_log(actor_id);
create index idx_audit_target    on public.audit_log(target_type, target_id);
create index idx_audit_created   on public.audit_log(created_at desc);

-- ============================================================================
-- TRIGGER: handle_new_user() — auto-creates app_user row on auth.users insert
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Insert a new app_user row with the same id as auth.users
  insert into public.app_user (id, name, email, role, must_change_pw)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'employee'),
    true  -- new users must change password
  );
  return new;
exception
  when others then
    raise warning 'handle_new_user failed for user %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- Attach trigger to auth.users (requires sufficient privileges; run as superuser if needed)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================================
-- TRIGGER: auto-update updated_at columns
-- ============================================================================
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Attach to tables with updated_at
create trigger tr_department_updated_at
  before update on public.department
  for each row execute function public.update_updated_at_column();

create trigger tr_app_user_updated_at
  before update on public.app_user
  for each row execute function public.update_updated_at_column();

create trigger tr_task_updated_at
  before update on public.task
  for each row execute function public.update_updated_at_column();

create trigger tr_attendance_updated_at
  before update on public.attendance
  for each row execute function public.update_updated_at_column();

create trigger tr_eod_report_updated_at
  before update on public.eod_report
  for each row execute function public.update_updated_at_column();

create trigger tr_daily_metrics_updated_at
  before update on public.daily_metrics
  for each row execute function public.update_updated_at_column();

-- ============================================================================
-- FUNCTION: process_eod_cutoff()
-- Marks active users who haven't submitted EOD after 6 PM IST (12:30 UTC) as 'missed'
-- Called by pg_cron Mon-Sat at 12:35 UTC
-- ============================================================================
create or replace function public.process_eod_cutoff()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := current_date;
  v_cutoff_time time := time '12:30';  -- 6:00 PM IST = 12:30 UTC
begin
  -- Only run on weekdays (Mon-Sat, DOW 1-6 in UTC; Sunday = 0)
  if extract(dow from v_today) = 0 then
    return;  -- Skip Sunday
  end if;

  -- Insert 'missed' EOD entries for active users who haven't submitted today
  insert into public.eod_report (user_id, report_date, summary, status, submitted_at)
  select
    u.id,
    v_today,
    'Missed EOD — auto-generated',
    'missed',
    now()
  from public.app_user u
  where u.status = 'active'
    and not exists (
      select 1 from public.eod_report e
      where e.user_id = u.id and e.report_date = v_today
    )
  on conflict (user_id, report_date) do nothing;

  -- Log the action
  insert into public.audit_log (actor_id, action, target_type, details)
  values (
    null,
    'eod_cutoff_processed',
    'eod_report',
    jsonb_build_object(
      'report_date', v_today,
      'cutoff_time_utc', current_time,
      'rows_affected', (select count(*) from public.eod_report where report_date = v_today and status = 'missed')
    )
  );
end;
$$;

-- ============================================================================
-- FUNCTION: process_weekly_rollup()
-- Generates weekly reports for the current week (Mon-Sat)
-- Called by pg_cron every Saturday at 12:35 UTC
-- ============================================================================
create or replace function public.process_weekly_rollup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week_start date;
  v_week_end   date;
begin
  -- Determine current week's Monday and Saturday
  -- If today is Saturday (DOW 6), compute this week's Mon-Sat
  -- Week is defined as Mon-Sat
  v_week_start := date_trunc('week', current_date)::date + 1;  -- Monday
  v_week_end   := v_week_start + 5;                             -- Saturday

  -- For each active user, compute weekly aggregates and upsert
  insert into public.weekly_report (
    user_id,
    week_start,
    week_end,
    leads_total,
    calls_total,
    tasks_completed,
    eod_submitted,
    days_present,
    generated_at
  )
  select
    u.id,
    v_week_start,
    v_week_end,
    coalesce(dm.leads, 0),
    coalesce(dm.calls, 0),
    coalesce(tc.done_tasks, 0),
    coalesce(eod.submitted_count, 0),
    coalesce(att.days, 0),
    now()
  from public.app_user u

  -- Aggregate daily_metrics for the week
  left join lateral (
    select
      coalesce(sum(leads), 0)::int   as leads,
      coalesce(sum(calls), 0)::int   as calls
    from public.daily_metrics
    where user_id = u.id
      and entry_date between v_week_start and v_week_end
  ) dm on true

  -- Count completed tasks this week (by completed_at within the week)
  left join lateral (
    select count(*)::int as done_tasks
    from public.task
    where assigned_to = u.id
      and status = 'done'
      and completed_at is not null
      and completed_at::date between v_week_start and v_week_end
  ) tc on true

  -- Count EOD reports submitted this week
  left join lateral (
    select count(*)::int as submitted_count
    from public.eod_report
    where user_id = u.id
      and report_date between v_week_start and v_week_end
      and status = 'submitted'
  ) eod on true

  -- Count days present this week
  left join lateral (
    select count(*)::int as days
    from public.attendance
    where user_id = u.id
      and work_date between v_week_start and v_week_end
      and status in ('present', 'late', 'half_day')
  ) att on true

  where u.status = 'active'

  on conflict (user_id, week_start)
  do update set
    week_end        = excluded.week_end,
    leads_total     = excluded.leads_total,
    calls_total     = excluded.calls_total,
    tasks_completed = excluded.tasks_completed,
    eod_submitted   = excluded.eod_submitted,
    days_present    = excluded.days_present,
    generated_at    = excluded.generated_at;

  -- Log the action
  insert into public.audit_log (actor_id, action, target_type, details)
  values (
    null,
    'weekly_rollup_processed',
    'weekly_report',
    jsonb_build_object(
      'week_start', v_week_start,
      'week_end',   v_week_end,
      'generated_at', now()
    )
  );
end;
$$;

-- ============================================================================
-- VIEW: v_missed_eod — declarative view of employees who missed today's EOD
-- ============================================================================
create or replace view public.v_missed_eod as
select
  u.id              as user_id,
  u.name,
  u.department_id,
  d.name            as department_name,
  current_date      as report_date,
  current_time      as checked_at_utc
from public.app_user u
join public.department d on u.department_id = d.id
where u.status = 'active'
  and extract(dow from current_date) != 0  -- not Sunday
  and not exists (
    select 1
    from public.eod_report e
    where e.user_id = u.id
      and e.report_date = current_date
  )
  and localtime > time '18:00';  -- after 6 PM server local time (use localtime for IST compat)

-- ============================================================================
-- GRANT: Ensure service_role and authenticated can use these functions
-- ============================================================================
grant execute on function public.process_eod_cutoff() to service_role;
grant execute on function public.process_weekly_rollup() to service_role;
grant execute on function public.handle_new_user() to service_role;
