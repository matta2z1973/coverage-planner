-- One-time reset — drops all coverage planner tables and metadata.
-- Run before regenerating the migration after schema changes.
-- Safe to re-run.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_auth_user();

drop table if exists public.reminder_log cascade;
drop table if exists public.coverage_slots cascade;
drop table if exists public.coverage_files cascade;
drop table if exists public.coverage_requests cascade;
drop table if exists public.academic_days cascade;
drop table if exists public.academic_years cascade;
drop table if exists public.block_templates cascade;
drop table if exists public.cohorts cascade;
drop table if exists public.divisions cascade;
drop table if exists public.profiles cascade;

drop type if exists public.user_role;
drop type if exists public.division_code;
drop type if exists public.day_type;
drop type if exists public.slot_status;
drop type if exists public.rotation_kind;

-- Drizzle migrations metadata
drop schema if exists drizzle cascade;
