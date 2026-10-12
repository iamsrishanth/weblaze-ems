-- Weblaze EMS work schedule timing contract.
-- Office hours: 10:00-18:00 IST.
-- Attendance: before 09:50 early, 09:50-10:15 on time, after 10:15 late.
-- EOD: submissions after 23:00 IST are late; missing reports are materialized after 23:00.

create or replace function public.process_eod_cutoff()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_org_now timestamp := timezone('Asia/Kolkata', v_now);
  v_today date := v_org_now::date;
begin
  if extract(isodow from v_org_now) = 7
     or (extract(hour from v_org_now) * 60 + extract(minute from v_org_now)) <= 1380 then
    return;
  end if;

  insert into public.eod_report (user_id, report_date, summary, status, submitted_at)
  select u.id, v_today, 'Missed EOD — auto-generated', 'missed', v_now
  from public.app_user u
  where u.status = 'active'
    and not exists (
      select 1 from public.eod_report e
      where e.user_id = u.id and e.report_date = v_today
    )
  on conflict (user_id, report_date) do nothing;

  insert into public.audit_log (actor_id, action, target_type, details)
  values (
    null,
    'eod_cutoff_processed',
    'eod_report',
    jsonb_build_object(
      'report_date', v_today,
      'timezone', 'Asia/Kolkata',
      'deadline', '23:00',
      'rows_affected', (select count(*) from public.eod_report where report_date = v_today and status = 'missed')
    )
  );
end;
$$;

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
  v_org_now timestamp := timezone('Asia/Kolkata', now());
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'This operation requires the trusted server role';
  end if;
  if p_actor_id is null or not exists (select 1 from public.app_user where id = p_actor_id and status = 'active') then
    raise exception using errcode = '22023', message = 'The actor is not an active application user';
  end if;
  if p_operation <> 'eod.submit' or p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,128}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid idempotency input';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || ':' || p_report_date::text, 0));
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

  if p_report_date is distinct from v_org_now::date
     or p_hours is null or p_hours <= 0 or p_hours > 99.99
     or p_hours * 100 <> trunc(p_hours * 100)
     or p_summary is null or length(btrim(p_summary)) < 10 then
    raise exception using errcode = '22023', message = 'Invalid EOD input';
  end if;
  if cardinality(coalesce(p_task_ids, '{}'::uuid[])) <> (
    select count(distinct task_id)::integer from unnest(coalesce(p_task_ids, '{}'::uuid[])) as task_id
  ) then
    raise exception using errcode = '22023', message = 'Task IDs must not contain duplicates';
  end if;

  select count(*) into v_task_count from public.task
  where id = any(coalesce(p_task_ids, '{}'::uuid[])) and assigned_to = p_actor_id and status = 'done';
  if v_task_count <> cardinality(coalesce(p_task_ids, '{}'::uuid[])) then
    raise exception using errcode = '23514', message = 'Selected tasks are not owned completed tasks';
  end if;

  v_status := case
    when (extract(hour from v_org_now) * 60 + extract(minute from v_org_now)) > 1380 then 'late'::public.eod_status
    else 'submitted'::public.eod_status
  end;

  select exists (
    select 1 from public.app_user u join public.department d on d.id = u.department_id
    where u.id = p_actor_id and lower(d.name) like '%sales%'
  ) into v_sales_enabled;

  if exists (select 1 from public.eod_report where user_id = p_actor_id and report_date = p_report_date) then
    if p_expected_updated_at is null then
      raise exception using errcode = '40001', message = 'Expected report version is required';
    end if;
    update public.eod_report
      set summary = btrim(p_summary), hours_worked = p_hours,
          tasks_completed = coalesce(p_task_ids, '{}'::uuid[]), status = v_status, submitted_at = now()
      where user_id = p_actor_id and report_date = p_report_date and updated_at = p_expected_updated_at
      returning * into v_report;
    if not found then raise exception using errcode = '40001', message = 'Report version conflict'; end if;
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

  if v_sales_enabled then
    select * into v_metrics from public.daily_metrics where user_id = p_actor_id and entry_date = p_report_date;
  end if;
  v_response := jsonb_build_object('report', to_jsonb(v_report), 'metrics', case when v_metrics.id is null then null else to_jsonb(v_metrics) end);
  update public.mobile_idempotency
    set status = 'completed', response_payload = v_response, response_status = 200, completed_at = now()
    where id = v_existing.id;
  return jsonb_build_object('replayed', false, 'payload', v_response);
end;
$$;

revoke all on function public.mobile_submit_eod_idempotent(uuid, text, text, text, date, text, numeric, uuid[], public.eod_status, timestamptz, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.mobile_submit_eod_idempotent(uuid, text, text, text, date, text, numeric, uuid[], public.eod_status, timestamptz, integer, integer, timestamptz) to service_role;

create or replace view public.v_missed_eod as
select u.id as user_id, u.name, u.department_id, d.name as department_name,
  timezone('Asia/Kolkata', now())::date as report_date, now() as checked_at_utc
from public.app_user u
join public.department d on u.department_id = d.id
where u.status = 'active'
  and extract(isodow from timezone('Asia/Kolkata', now())) <> 7
  and not exists (
    select 1 from public.eod_report e
    where e.user_id = u.id and e.report_date = timezone('Asia/Kolkata', now())::date
  )
  and (extract(hour from timezone('Asia/Kolkata', now())) * 60
       + extract(minute from timezone('Asia/Kolkata', now()))) > 1380;

-- Replace the old 18:05 IST cutoff job with a post-23:00 IST run.
do $$
begin
  perform cron.unschedule('eod-cutoff');
exception when others then
  null;
end;
$$;
select cron.schedule('eod-cutoff', '35 17 * * 1-6', $job$select public.process_eod_cutoff();$job$);
