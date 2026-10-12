-- Only the trusted server-side password setup flow may clear this flag.
-- Without this guard, any authenticated client could update its own app_user row
-- and set must_change_pw = false without changing its Auth password.

create or replace function public.prevent_direct_password_setup_flag_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.must_change_pw is distinct from new.must_change_pw
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
  then
    raise exception using errcode = '42501', message = 'must_change_pw can only be changed by the trusted server';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_password_setup_flag on public.app_user;

create trigger protect_password_setup_flag
  before update of must_change_pw on public.app_user
  for each row
  execute function public.prevent_direct_password_setup_flag_change();

revoke update (must_change_pw) on public.app_user from anon, authenticated;
