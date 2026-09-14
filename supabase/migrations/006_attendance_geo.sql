-- ============================================================================
-- Weblaze EMS — Attendance geolocation
-- Migration: 006_attendance_geo.sql
--
-- The ByteCode-EMS database recorded GPS coordinates on check-in and check-out
-- (columns that were dropped during the first import because this schema had
-- nowhere to put them). This adds them back so the historical coordinates can
-- be restored.
--
-- Nullable: attendance can be marked without a fix (missing permission,
-- desktop check-in, manual correction), so no NOT NULL constraint.
-- ============================================================================

alter table public.attendance
  add column if not exists check_in_lat  double precision,
  add column if not exists check_in_lng  double precision,
  add column if not exists check_out_lat double precision,
  add column if not exists check_out_lng double precision;

comment on column public.attendance.check_in_lat  is 'Latitude captured at check-in (WGS84)';
comment on column public.attendance.check_in_lng  is 'Longitude captured at check-in (WGS84)';
comment on column public.attendance.check_out_lat is 'Latitude captured at check-out (WGS84)';
comment on column public.attendance.check_out_lng is 'Longitude captured at check-out (WGS84)';

-- Plausibility guard: WGS84 latitude must be within [-90, 90] and
-- longitude within [-180, 180]. Nulls are allowed (no fix captured).
alter table public.attendance
  drop constraint if exists attendance_coords_bounds;

alter table public.attendance
  add constraint attendance_coords_bounds check (
    (check_in_lat  is null or check_in_lat  between -90  and 90)
    and (check_out_lat is null or check_out_lat between -90  and 90)
    and (check_in_lng  is null or check_in_lng  between -180 and 180)
    and (check_out_lng is null or check_out_lng between -180 and 180)
  );
