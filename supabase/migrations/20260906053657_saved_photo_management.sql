-- Immutable uploads first; one short, RLS-protected transaction switches the album.
create or replace function public.save_photo_album(
  p_household uuid, p_style uuid, p_expected uuid[], p_photos jsonb, p_shared_count integer
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  current_ids uuid[];
  desired_ids uuid[];
  entry jsonb;
  photo public.item_images%rowtype;
  ordinal integer := 0;
  prefix text;
  affected integer;
begin
  if auth.uid() is null or not exists(select 1 from public.household_members where household_id=p_household and user_id=auth.uid()) then
    raise exception '无权管理这个谷仓的照片';
  end if;
  perform 1 from public.item_styles where id=p_style and household_id=p_household and deleted_at is null for update;
  if not found then raise exception '收藏不存在或已删除'; end if;
  select count(*) into affected from public.item_instances where item_style_id=p_style and household_id=p_household;
  if affected is distinct from p_shared_count then raise exception '同款持有数量已变化，请重新打开并确认'; end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos)>3 then raise exception '最多保留3张照片'; end if;
  select coalesce(array_agg((v->>'id')::uuid order by n),'{}') into desired_ids from jsonb_array_elements(p_photos) with ordinality as x(v,n);
  if exists(select 1 from unnest(desired_ids) i group by i having count(*)>1 or i is null) then raise exception '照片不能重复'; end if;
  select coalesce(array_agg(id order by sort_order,created_at,id),'{}') into current_ids from public.item_images where household_id=p_household and item_style_id=p_style and deleted_at is null;
  -- Lost-response retry: this exact immutable album is already committed.
  if current_ids = desired_ids then return; end if;
  if p_expected is null or current_ids <> p_expected then raise exception '照片已变化，请重新打开管理照片'; end if;
  prefix := 'households/'||p_household||'/items/'||p_style||'/';
  for entry in select value from jsonb_array_elements(p_photos) loop
    select * into photo from public.item_images where id=(entry->>'id')::uuid;
    if found then
      if photo.household_id<>p_household or photo.item_style_id<>p_style then raise exception '照片不属于当前款式'; end if;
      if photo.deleted_at is not null and photo.deleted_at < now()-interval '7 days' then raise exception '照片已超过7天恢复期'; end if;
    else
      if (entry->>'detail_path') is null or (entry->>'thumbnail_path') is null
        or (entry->>'detail_path') !~ ('^'||prefix||(entry->>'id')||'-detail\.(webp|jpg|jpeg)$')
        or (entry->>'thumbnail_path') !~ ('^'||prefix||(entry->>'id')||'-thumb\.(webp|jpg|jpeg)$') then raise exception '照片路径无效'; end if;
      if coalesce((entry->>'width')::int,0)<=0 or coalesce((entry->>'height')::int,0)<=0 then raise exception '照片尺寸无效'; end if;
      if not exists(select 1 from storage.objects where bucket_id='collection-images' and name=entry->>'detail_path' and (metadata->>'size')::bigint=(entry->>'file_size_bytes')::bigint)
        or not exists(select 1 from storage.objects where bucket_id='collection-images' and name=entry->>'thumbnail_path' and (metadata->>'size')::bigint=(entry->>'thumbnail_size_bytes')::bigint) then raise exception '照片尚未上传完整，旧图保持不变'; end if;
      insert into public.item_images(id,household_id,item_style_id,image_type,detail_path,thumbnail_path,file_size_bytes,thumbnail_size_bytes,width,height,sort_order,created_by)
      values((entry->>'id')::uuid,p_household,p_style,'attachment',entry->>'detail_path',entry->>'thumbnail_path',(entry->>'file_size_bytes')::bigint,(entry->>'thumbnail_size_bytes')::bigint,(entry->>'width')::int,(entry->>'height')::int,ordinal,auth.uid());
    end if;
    ordinal := ordinal+1;
  end loop;
  update public.item_images set deleted_at=now() where household_id=p_household and item_style_id=p_style and deleted_at is null and not(id=any(desired_ids));
  update public.item_images i set deleted_at=null,sort_order=(x.n-1)::int,image_type=case when x.n=1 then 'main'::public.image_type else 'attachment'::public.image_type end
    from unnest(desired_ids) with ordinality x(id,n) where i.id=x.id and i.household_id=p_household and i.item_style_id=p_style;
end;
$$;
revoke all on function public.save_photo_album(uuid,uuid,uuid[],jsonb,integer) from public,anon;
grant execute on function public.save_photo_album(uuid,uuid,uuid[],jsonb,integer) to authenticated;
