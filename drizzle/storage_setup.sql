-- Storage setup for curriculum / lesson-plan attachments.
-- Run once in Supabase SQL Editor. Re-runnable.

-- 1. Create the bucket (private; we mint signed URLs at read time).
insert into storage.buckets (id, name, public)
values ('curriculum', 'curriculum', false)
on conflict (id) do nothing;

-- 2. RLS policies. Anyone signed in to the app can upload, read, and delete
--    files in this bucket. Internal tool, so we don't restrict by user/folder.
drop policy if exists "Authenticated users can upload to curriculum"
  on storage.objects;
create policy "Authenticated users can upload to curriculum"
  on storage.objects for insert
  with check (bucket_id = 'curriculum' and auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read curriculum"
  on storage.objects;
create policy "Authenticated users can read curriculum"
  on storage.objects for select
  using (bucket_id = 'curriculum' and auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete from curriculum"
  on storage.objects;
create policy "Authenticated users can delete from curriculum"
  on storage.objects for delete
  using (bucket_id = 'curriculum' and auth.role() = 'authenticated');
