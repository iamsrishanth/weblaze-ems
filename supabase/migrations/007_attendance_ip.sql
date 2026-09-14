-- ============================================================================
-- Weblaze EMS — Attendance IP capture
-- Migration: 007_attendance_ip.sql
--
-- Records the network address used at check-in and check-out.
--
-- Design choice: one `inet` column per event rather than separate IPv4/IPv6
-- tables or columns. Postgres' `inet` type stores IPv4 and IPv6 in a single
-- column, keeps them queryable by network (`<<`), and avoids half-empty
-- column pairs. `ip_version` (4 or 6) makes the split explicit when you need
-- to filter by family.
--
-- This data is stored for audit only — it is deliberately not surfaced in
-- the UI.
-- ============================================================================

-- Current address on the attendance row itself
alter table public.attendance
  add column if not exists check_in_ip  inet,
  add column if not exists check_out_ip inet;

comment on column public.attendance.check_in_ip  is 'Client IP recorded at check-in (audit only, not shown in UI)';
comment on column public.attendance.check_out_ip is 'Client IP recorded at check-out (audit only, not shown in UI)';

-- Append-only history: one row per check-in / check-out event
create table if not exists public.attendance_ip_log (
  id            uuid primary key default gen_random_uuid(),
  attendance_id uuid references public.attendance(id) on delete cascade,
  user_id       uuid not null references public.app_user(id) on delete cascade,
  event         text not null check (event in ('check_in', 'check_out')),
  ip            inet,
  ip_version    smallint check (ip_version in (4, 6)),
  user_agent    text,
  created_at    timestamptz not null default now()
);

comment on table public.attendance_ip_log is
  'Append-only record of the IP address used for each attendance event. Audit only — never rendered in the UI.';
comment on column public.attendance_ip_log.ip_version is
  '4 or 6 — address family of `ip`, set by the application.';

create index if not exists idx_attendance_ip_log_user
  on public.attendance_ip_log (user_id, created_at desc);

create index if not exists idx_attendance_ip_log_attendance
  on public.attendance_ip_log (attendance_id);

-- ---------------------------------------------------------------------------
-- RLS: default-deny, then super admin read-only.
-- Writes are performed with the service-role client from the server action,
-- so no insert policy is granted to `authenticated` — a user cannot forge or
-- delete their own IP history.
-- ---------------------------------------------------------------------------
alter table public.attendance_ip_log enable row level security;

create policy "IP log is viewable by super_admin"
  on public.attendance_ip_log
  for select
  to authenticated
  using (public.is_super_admin());
