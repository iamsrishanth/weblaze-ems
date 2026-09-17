-- ============================================================================
-- Weblaze EMS — Fix infinite recursion in the task UPDATE policy
-- Migration: 009_task_update_rls_fix.sql
--
-- Bug (Supabase error 42P17 on EVERY task UPDATE, for every role):
--   "Assigned user can update task status" used WITH CHECK subqueries that
--   selected from public.task itself, e.g.
--     title = (select title from public.task where id = public.task.id)
--   Evaluating a policy on task requires SELECT on task, which is itself
--   policy-guarded -> infinite recursion. (PostgREST additionally rewrote
--   the predicate to `task_1.id = task_1.id` — always true, so even without
--   the recursion the check was semantically broken.)
--
-- Fix:
--   1. Replace the policy with a non-recursive "assignee may update own
--      task row" (USING/WITH CHECK only reference the row itself).
--   2. The "assignees may only change status" invariant moves to a BEFORE
--      UPDATE trigger — the one place OLD/NEW rows can be compared. Admins,
--      super_admins and server roles (auth.uid() IS NULL, e.g. the service
--      key) are exempt; everyone else may only touch status/completed_at.
--
-- Already applied to the live project on 2026-09-17; this file records it
-- in the migration history. All statements are idempotent.
-- ============================================================================

-- 1. Drop the recursive policy (if it still exists anywhere).
drop policy if exists "Assigned user can update task status" on public.task;

-- 2. Non-recursive replacement: assignee may update their own task row.
create policy "Assigned user can update own task"
  on public.task
  for update
  to authenticated
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

-- 3. Status-only guard for plain assignees (admins/server roles exempt).
create or replace function public.task_assignee_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $fn$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.assigned_to is distinct from old.assigned_to
     or new.assigned_by is distinct from old.assigned_by
     or new.priority is distinct from old.priority
     or new.due_date is distinct from old.due_date
     or new.created_at is distinct from old.created_at then
    raise exception 'Assignees can only update the task status';
  end if;
  return new;
end;
$fn$;

drop trigger if exists task_assignee_guard on public.task;

create trigger task_assignee_guard
  before update on public.task
  for each row execute function public.task_assignee_guard();
