create or replace function private.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.account_profiles
        where user_id = (select auth.uid())
    );
$$;

revoke all on function private.is_active_account() from public, anon, authenticated;
grant execute on function private.is_active_account() to authenticated;

drop policy if exists "Signed-in users can view running projects"
on public.projects_berjalan;

create policy "Active accounts can view running projects"
on public.projects_berjalan
for select
to authenticated
using ((select private.is_active_account()));