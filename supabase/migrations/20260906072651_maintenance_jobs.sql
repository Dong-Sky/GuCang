-- Preview only. No cron and no startup mutations. Cleanup requires an admin action.
create table public.maintenance_jobs (
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id) on delete cascade,
 item_style_id uuid not null,
 removed_instances integer not null check (removed_instances > 0),
 paths text[] not null,
 status text not null default 'pending' check(status in ('pending','failed','done')),
 attempts integer not null default 0,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.maintenance_jobs enable row level security;
create policy maintenance_admin on public.maintenance_jobs for all to authenticated
 using(private.is_household_admin(household_id)) with check(private.is_household_admin(household_id));
grant select,insert,update on public.maintenance_jobs to authenticated;
create index maintenance_pending on public.maintenance_jobs(household_id,status,created_at);

create function public.prepare_maintenance(target_household uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s record; removed integer; photos text[]; jobs integer:=0;
begin
 if auth.uid() is null or not private.is_household_admin(target_household) then raise exception '仅管理员可以清理'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_household::text,5));
 for s in select st.id from public.item_styles st where st.household_id=target_household
  and exists(select 1 from public.item_instances i where i.item_style_id=st.id and i.household_id=target_household and i.deleted_at<now()-interval '7 days')
  order by st.id limit 20 for update of st skip locked
 loop
  delete from public.item_instances where household_id=target_household and item_style_id=s.id and deleted_at<now()-interval '7 days';
  get diagnostics removed=row_count;
  if removed=0 then continue; end if;
  photos:=array[]::text[];
  if not exists(select 1 from public.item_instances where item_style_id=s.id) then
   select coalesce(array_agg(distinct p),array[]::text[]) into photos from public.item_images im
     cross join lateral unnest(array[im.detail_path,im.thumbnail_path]) p where im.item_style_id=s.id and im.household_id=target_household and p is not null;
   if exists(select 1 from unnest(photos) p where p not like 'households/'||target_household::text||'/%' or position('..' in p)>0 or position(chr(92) in p)>0) then raise exception '清理路径异常，已取消'; end if;
   delete from public.item_styles where id=s.id and household_id=target_household;
   -- Preserve a path if ANY remaining metadata still references it.
   select coalesce(array_agg(p),array[]::text[]) into photos from unnest(photos) p where
    not exists(select 1 from public.item_images im where im.detail_path=p or im.thumbnail_path=p)
    and not exists(select 1 from public.location_images im where im.detail_path=p or im.thumbnail_path=p);
  end if;
  -- The retained outbox and metadata deletion commit together; failed media deletes remain retryable.
  insert into public.maintenance_jobs(household_id,item_style_id,removed_instances,paths,status)
   values(target_household,s.id,removed,photos,case when cardinality(photos)=0 then 'done' else 'pending' end);
  jobs:=jobs+1;
 end loop;
 return jsonb_build_object('prepared',jobs);
end $$;
create function public.list_maintenance(target_household uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not private.is_household_admin(target_household) then raise exception '仅管理员可以查看'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(j)),'[]'::jsonb) from
  (select * from public.maintenance_jobs where household_id=target_household order by (status='done'),created_at desc,id limit 100) j);
end $$;
create function public.record_maintenance_attempt(target_household uuid,target_job uuid,succeeded boolean,error_text text default null) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not private.is_household_admin(target_household) then raise exception '仅管理员可以清理'; end if;
 update public.maintenance_jobs set status=case when succeeded then 'done' else 'failed' end, attempts=attempts+1,last_error=case when succeeded then null else left(error_text,300) end,updated_at=now()
 where id=target_job and household_id=target_household and status<>'done';
end $$;
revoke all on function public.prepare_maintenance(uuid),public.list_maintenance(uuid),public.record_maintenance_attempt(uuid,uuid,boolean,text) from public,anon;
grant execute on function public.prepare_maintenance(uuid),public.list_maintenance(uuid),public.record_maintenance_attempt(uuid,uuid,boolean,text) to authenticated;
