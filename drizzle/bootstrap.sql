-- Coverage Planner — one-time bootstrap.
-- Run after `npm run db:migrate`.
-- Re-runnable; everything is idempotent.

-- 1. Seed divisions.
insert into public.divisions (code, label)
values
  ('US', 'Upper School'),
  ('MS', 'Middle School')
on conflict (code) do nothing;

-- 2. Seed cohorts.
--    US: single cohort.
--    MS: 5th, 6th, 7th-8th — three cohorts with shared block names but distinct timings.
insert into public.cohorts (division_id, code, label, sort_order)
select d.id, 'US', 'Upper School', 0 from public.divisions d where d.code = 'US'
on conflict (division_id, code) do nothing;

insert into public.cohorts (division_id, code, label, sort_order)
select d.id, '5', '5th Grade', 0 from public.divisions d where d.code = 'MS'
on conflict (division_id, code) do nothing;

insert into public.cohorts (division_id, code, label, sort_order)
select d.id, '6', '6th Grade', 1 from public.divisions d where d.code = 'MS'
on conflict (division_id, code) do nothing;

insert into public.cohorts (division_id, code, label, sort_order)
select d.id, '7-8', '7th-8th Grade', 2 from public.divisions d where d.code = 'MS'
on conflict (division_id, code) do nothing;

-- 3. Trigger: auto-create a profiles row when a new auth.users row appears.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'faculty'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 4. Backfill profiles for any users who signed up before the trigger existed.
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  u.raw_user_meta_data->>'full_name',
  'faculty'
from auth.users u
on conflict (id) do nothing;

-- 5. Promote the bootstrap admin. Edit the email if needed.
update public.profiles
set role = 'admin'
where email = 'abbondanziom@greenhill.org';
