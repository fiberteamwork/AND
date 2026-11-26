begin;

select plan(2);

insert into auth.users (id, email)
values
    ('10000000-0000-4000-8000-000000000001', 'active-account@example.invalid'),
    ('10000000-0000-4000-8000-000000000002', 'deleted-account@example.invalid');

insert into public.account_profiles (user_id, username, username_key, role)
values (
    '10000000-0000-4000-8000-000000000001',
    'active',
    'active',
    'user'
);

insert into public.projects_berjalan (city, location, name)
values ('Test City', 'Test Location', 'Test Project');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is(
    (select count(*)::integer from public.projects_berjalan),
    1,
    'active account can read running projects'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is(
    (select count(*)::integer from public.projects_berjalan),
    0,
    'deleted account with a remaining JWT cannot read running projects'
);

select * from finish();
rollback;
