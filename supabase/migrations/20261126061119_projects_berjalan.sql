create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_project_admin()
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
          and role = 'admin'
    );
$$;

revoke all on function private.is_project_admin() from public, anon, authenticated;
grant execute on function private.is_project_admin() to authenticated;

create table public.projects_berjalan (
    id uuid primary key default gen_random_uuid(),
    city text not null check (length(btrim(city)) > 0),
    location text not null check (length(btrim(location)) > 0),
    name text not null check (length(btrim(name)) > 0),
    created_at timestamptz not null default now()
);

alter table public.projects_berjalan enable row level security;

revoke all on table public.projects_berjalan from anon, authenticated;
grant select, insert, update, delete on table public.projects_berjalan to authenticated;

create policy "Signed-in users can view running projects"
on public.projects_berjalan
for select
to authenticated
using (true);

create policy "Admins can add running projects"
on public.projects_berjalan
for insert
to authenticated
with check ((select private.is_project_admin()));

create policy "Admins can update running projects"
on public.projects_berjalan
for update
to authenticated
using ((select private.is_project_admin()))
with check ((select private.is_project_admin()));

create policy "Admins can delete running projects"
on public.projects_berjalan
for delete
to authenticated
using ((select private.is_project_admin()));