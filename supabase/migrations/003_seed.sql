-- ============================================================================
-- Weblaze EMS v3 — Seed Data
-- Migration: 003_seed.sql
-- Departments, super_admin user, sample data
-- ============================================================================

-- ============================================================================
-- SEED: Departments
-- ============================================================================

-- Upsert departments (idempotent)
insert into public.department (id, name, leads_target, calls_target, is_active)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'Sales',
    20,   -- 20 leads per day target
    50,   -- 50 calls per day target
    true
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Development',
    0,    -- no leads/calls targets for dev team
    0,
    true
  )
on conflict (name) do update set
  leads_target = excluded.leads_target,
  calls_target = excluded.calls_target,
  is_active    = excluded.is_active;

-- ============================================================================
-- SEED: Super Admin User
-- ============================================================================
-- NOTE: The auth.users record must be created first via Supabase Auth
-- (either through the dashboard or programmatically).
-- Once the auth.users row exists with a known UUID, uncomment and run:
--
--   insert into public.app_user (id, name, email, role, must_change_pw)
--   values (
--     '<uuid-from-auth.users>',
--     'Super Admin',
--     'admin@weblaze.co.in',
--     'super_admin',
--     false
--   )
--   on conflict (id) do nothing;
--
-- For local development, you can use the Supabase CLI to create the user:
--   supabase functions new create-super-admin
-- Or manually via SQL after creating the auth entry:
--
-- Example (replace UUID with actual):
-- insert into public.app_user (id, name, email, role, department_id, must_change_pw)
-- values (
--   'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
--   'Super Admin',
--   'admin@weblaze.co.in',
--   'super_admin',
--   null,
--   false
-- )
-- on conflict (id) do nothing;

-- ============================================================================
-- SEED: Sample Employees (for demo/testing)
-- ============================================================================
-- Same caveat as above: auth.users entries must exist first.
-- Replace UUIDs with actual auth.users ids after creating them.

-- insert into public.app_user (id, name, email, role, department_id, must_change_pw)
-- values
--   (
--     'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
--     'Sales Manager',
--     'sales.manager@weblaze.co.in',
--     'admin',
--     '00000000-0000-0000-0000-000000000001',  -- Sales dept
--     false
--   ),
--   (
--     'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
--     'Sales Rep 1',
--     'sales.rep1@weblaze.co.in',
--     'employee',
--     '00000000-0000-0000-0000-000000000001',  -- Sales dept
--     true
--   ),
--   (
--     'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
--     'Dev Manager',
--     'dev.manager@weblaze.co.in',
--     'admin',
--     '00000000-0000-0000-0000-000000000002',  -- Development dept
--     false
--   ),
--   (
--     'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
--     'Developer 1',
--     'dev1@weblaze.co.in',
--     'employee',
--     '00000000-0000-0000-0000-000000000002',  -- Development dept
--     true
--   )
-- on conflict (id) do nothing;

-- ============================================================================
-- SEED: Set department heads (after users exist)
-- ============================================================================
-- update public.department set head_id = '<sales-manager-uuid>'
--   where id = '00000000-0000-0000-0000-000000000001';
--
-- update public.department set head_id = '<dev-manager-uuid>'
--   where id = '00000000-0000-0000-0000-000000000002';
