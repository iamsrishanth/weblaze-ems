-- Durable mobile mutation idempotency and atomic EOD persistence.
-- Forward-only migration. Do not apply to production from the worktree.

create table if not exists public.mobile_idempotency (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.app_user(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  response_payload jsonb,
  response_status integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (actor_id, operation, idempotency_key)
);

create index if not exists idx_mobile_idempotency_expiry
  on public.mobile_idempotency (created_at);

alter table public.mobile_idempotency enable row level security;
alter table public.mobile_idempotency force row level security;

revoke all on public.mobile_idempotency from anon, authenticated;
grant all on public.mobile_idempotency to service_role;

create or replace function public.mobile_submit_eod_idempotent(
  p_actor_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_request_hash text,
  p_report_date date,
  p_summary text,
  p_hours numeric,
  p_task_ids uuid[],
  p_status public.eod_status,
  p_submitted_at timestamptz,
  p_leads integer default null,
  p_calls integer default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.eod_report;
  v_metrics public.daily_metrics;
  v_task_count integer;
  v_sales_enabled boolean;
  v_existing public.mobile_idempotency;
  v_response jsonb;
  v_status public.eod_status;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'This operation requires the trusted server role';
  end if;
  if p_actor_id is null or not exists (
    select 1 from public.app_user where id = p_actor_id and status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'The actor is not an active application user';
  end if;
  if p_operation <> 'eod.submit'
     or p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,128}$'
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'Invalid idempotency input';
  end if;

  -- Serialize different idempotency keys for the same actor/day as well. This
  -- closes the create-vs-create race on eod_report's unique constraint.
  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_id::text || ':' || p_report_date::text, 0)
  );

  insert into public.mobile_idempotency (actor_id, operation, idempotency_key, request_hash)
    values (p_actor_id, p_operation, p_idempotency_key, p_request_hash)
    on conflict (actor_id, operation, idempotency_key) do update
      set request_hash = public.mobile_idempotency.request_hash
    returning * into v_existing;
  if v_existing.request_hash <> p_request_hash then
    raise exception using errcode = '40001', message = 'The idempotency key was reused with a different payload';
  end if;
  if v_existing.status = 'completed' and v_existing.response_payload is not null then
    return jsonb_build_object('replayed', true, 'payload', v_existing.response_payload);
  end if;

  -- Only a new operation reaches mutable date, task and version checks. A
  -- legitimate replay must remain available after midnight or reassignment.
  if p_report_date is distinct from timezone('Asia/Kolkata', now())::date
     or p_hours is null
     or p_hours <= 0
     or p_hours > 99.99
     or p_hours * 100 <> trunc(p_hours * 100)
     or p_summary is null
     or length(btrim(p_summary)) < 10
  then
    raise exception using errcode = '22023', message = 'Invalid EOD input';
  end if;
  if cardinality(coalesce(p_task_ids, '{}'::uuid[])) <> (
    select count(distinct task_id)::integer
    from unnest(coalesce(p_task_ids, '{}'::uuid[])) as task_id
  ) then
    raise exception using errcode = '22023', message = 'Task IDs must not contain duplicates';
  end if;

  select count(*) into v_task_count
  from public.task
  where id = any(coalesce(p_task_ids, '{}'::uuid[]))
    and assigned_to = p_actor_id
    and status = 'done';
  if v_task_count <> cardinality(coalesce(p_task_ids, '{}'::uuid[])) then
    raise exception using errcode = '23514', message = 'Selected tasks are not owned completed tasks';
  end if;

  v_status := case
    when extract(hour from timezone('Asia/Kolkata', now())) >= 18 then 'late'::public.eod_status
    else 'submitted'::public.eod_status
  end;

  select exists (
    select 1 from public.app_user u
    join public.department d on d.id = u.department_id
    where u.id = p_actor_id and lower(d.name) like '%sales%'
  ) into v_sales_enabled;

  if exists (select 1 from public.eod_report where user_id = p_actor_id and report_date = p_report_date) then
    if p_expected_updated_at is null then
      raise exception using errcode = '40001', message = 'Expected report version is required';
    end if;
    update public.eod_report
      set summary = btrim(p_summary), hours_worked = p_hours, tasks_completed = coalesce(p_task_ids, '{}'::uuid[]), status = v_status, submitted_at = now()
      where user_id = p_actor_id and report_date = p_report_date and updated_at = p_expected_updated_at
      returning * into v_report;
    if not found then
      raise exception using errcode = '40001', message = 'Report version conflict';
    end if;
  else
    insert into public.eod_report (user_id, report_date, summary, hours_worked, tasks_completed, status, submitted_at)
      values (p_actor_id, p_report_date, btrim(p_summary), p_hours, coalesce(p_task_ids, '{}'::uuid[]), v_status, now())
      returning * into v_report;
  end if;

  if v_sales_enabled and (p_leads is not null or p_calls is not null) then
    if (p_leads is not null and (p_leads < 0 or p_leads > 2147483647))
       or (p_calls is not null and (p_calls < 0 or p_calls > 2147483647)) then
      raise exception using errcode = '22023', message = 'Sales metrics must be non-negative integers';
    end if;
    insert into public.daily_metrics (user_id, entry_date, leads, calls)
      values (p_actor_id, p_report_date, coalesce(p_leads, 0), coalesce(p_calls, 0))
      on conflict (user_id, entry_date) do update
        set leads = case when p_leads is null then public.daily_metrics.leads else excluded.leads end,
            calls = case when p_calls is null then public.daily_metrics.calls else excluded.calls end;
  end if;

  -- Always return the preserved/current metrics row, including when a caller
  -- edits only the report or omits one metric. This keeps replay responses
  -- faithful to the durable daily_metrics state.
  if v_sales_enabled then
    select * into v_metrics
    from public.daily_metrics
    where user_id = p_actor_id and entry_date = p_report_date;
  end if;

  v_response := jsonb_build_object(
    'report', to_jsonb(v_report),
    'metrics', case when v_metrics.id is null then null else to_jsonb(v_metrics) end
  );
  update public.mobile_idempotency
    set status = 'completed', response_payload = v_response, response_status = 200, completed_at = now()
    where id = v_existing.id;
  return jsonb_build_object('replayed', false, 'payload', v_response);
end;
$$;

revoke all on function public.mobile_submit_eod_idempotent(uuid, text, text, text, date, text, numeric, uuid[], public.eod_status, timestamptz, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.mobile_submit_eod_idempotent(uuid, text, text, text, date, text, numeric, uuid[], public.eod_status, timestamptz, integer, integer, timestamptz) to service_role;

-- Correct PostgreSQL's date_trunc('week') Monday boundary. The old +1 produced Tuesday.
create or replace function public.process_weekly_rollup()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start date := date_trunc('week', timezone('Asia/Kolkata', now()))::date;
  v_week_end date := v_week_start + 5;
begin
  insert into public.weekly_report (user_id, week_start, week_end, leads_total, calls_total, tasks_completed, eod_submitted, days_present, generated_at)
  select u.id, v_week_start, v_week_end,
    coalesce((select sum(leads)::int from public.daily_metrics where user_id = u.id and entry_date between v_week_start and v_week_end), 0),
    coalesce((select sum(calls)::int from public.daily_metrics where user_id = u.id and entry_date between v_week_start and v_week_end), 0),
    coalesce((select count(*)::int from public.task where assigned_to = u.id and status = 'done' and completed_at is not null and timezone('Asia/Kolkata', completed_at)::date between v_week_start and v_week_end), 0),
    coalesce((select count(*)::int from public.eod_report where user_id = u.id and status in ('submitted', 'late') and report_date between v_week_start and v_week_end), 0),
    coalesce((select count(*)::int from public.attendance where user_id = u.id and check_in_at is not null and work_date between v_week_start and v_week_end), 0),
    now()
  from public.app_user u where u.status = 'active'
  on conflict (user_id, week_start) do update set week_end = excluded.week_end, leads_total = excluded.leads_total, calls_total = excluded.calls_total, tasks_completed = excluded.tasks_completed, eod_submitted = excluded.eod_submitted, days_present = excluded.days_present, generated_at = excluded.generated_at;
  perform public.prune_mobile_idempotency();
end;
$$;

-- Keep mobile idempotency bounded. Schedule remains server-owned and must be verified after deployment.
create or replace function public.prune_mobile_idempotency()
returns void language sql security definer set search_path = public
as $$ delete from public.mobile_idempotency where created_at < now() - interval '7 days'; $$;

revoke all on function public.prune_mobile_idempotency() from public, anon, authenticated;
grant execute on function public.prune_mobile_idempotency() to service_role;
