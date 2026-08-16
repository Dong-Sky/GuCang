-- V1 private image storage for compressed collection and location images.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'collection-images',
  'collection-images',
  false,
  5242880,
  array['image/webp', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists collection_images_member_read on storage.objects;
create policy collection_images_member_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'collection-images'
  and (storage.foldername(name))[1] = 'households'
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and (select private.is_household_member(((storage.foldername(name))[2])::uuid))
);

drop policy if exists collection_images_member_upload on storage.objects;
create policy collection_images_member_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'collection-images'
  and (storage.foldername(name))[1] = 'households'
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and (select private.is_household_member(((storage.foldername(name))[2])::uuid))
);

drop policy if exists collection_images_member_update on storage.objects;
create policy collection_images_member_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'collection-images'
  and (storage.foldername(name))[1] = 'households'
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and (select private.is_household_member(((storage.foldername(name))[2])::uuid))
)
with check (
  bucket_id = 'collection-images'
  and (storage.foldername(name))[1] = 'households'
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and (select private.is_household_member(((storage.foldername(name))[2])::uuid))
);

drop policy if exists collection_images_member_delete on storage.objects;
create policy collection_images_member_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'collection-images'
  and (storage.foldername(name))[1] = 'households'
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  and (select private.is_household_member(((storage.foldername(name))[2])::uuid))
);
