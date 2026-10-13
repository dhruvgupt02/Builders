-- BRIVIO storage buckets. Run in the Supabase SQL editor after schema.sql.
-- Uploads go to "<auth.uid()>/<filename>" so each user can only write inside their own folder.

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('portfolio-media', 'portfolio-media', true, 52428800),       -- 50 MB
  ('verification-evidence', 'verification-evidence', true, 10485760) -- 10 MB
on conflict (id) do nothing;

-- Public read for both buckets
drop policy if exists "brivio_public_read" on storage.objects;
create policy "brivio_public_read" on storage.objects for select
  using (bucket_id in ('portfolio-media', 'verification-evidence'));

-- Logged-in users upload into their own folder
drop policy if exists "brivio_insert_own_folder" on storage.objects;
create policy "brivio_insert_own_folder" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('portfolio-media', 'verification-evidence')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "brivio_update_own_folder" on storage.objects;
create policy "brivio_update_own_folder" on storage.objects for update to authenticated
  using (
    bucket_id in ('portfolio-media', 'verification-evidence')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "brivio_delete_own_folder" on storage.objects;
create policy "brivio_delete_own_folder" on storage.objects for delete to authenticated
  using (
    bucket_id in ('portfolio-media', 'verification-evidence')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
