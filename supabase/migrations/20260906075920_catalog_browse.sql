-- Read-only, household-scoped endpoints. RLS remains effective for every query.
create or replace function public.catalog_summary(target_household uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.household_members where household_id=target_household and user_id=(select auth.uid())) then raise exception '无权访问该谷仓'; end if;
 with active as (
  select i.*, (s.completion_status='review' or ip.id is null or c.id is null or (i.current_location_id is null and i.home_location_id is null)) as incomplete
  from public.item_instances i join public.item_styles s on s.id=i.item_style_id and s.household_id=i.household_id
  left join public.ips ip on ip.id=s.ip_id and ip.deleted_at is null
  left join public.categories c on c.id=s.category_id and c.deleted_at is null
  where i.household_id=target_household and i.deleted_at is null and s.deleted_at is null
 ), sizes as (
  select file_size_bytes+thumbnail_size_bytes bytes from public.item_images where household_id=target_household
  union all select file_size_bytes+thumbnail_size_bytes from public.location_images where household_id=target_household and deleted_at is null
 ) select jsonb_build_object('total',count(*),'draft',count(*) filter(where incomplete),'out',count(*) filter(where physical_status='temporarily_out'),'pending',count(*) filter(where incomplete or physical_status='temporarily_out'),'imageBytes',coalesce((select sum(bytes) from sizes),0)) into result from active;
 return result;
end $$;

create or replace function public.browse_catalog(target_household uuid, query_text text default '', filters jsonb default '{}', page_number integer default 1, page_size integer default 24)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; q text:=lower(normalize(trim(coalesce(query_text,'')),NFKC)); ids uuid[]; total_count bigint; actual_page integer; digits text;
begin
 if not exists(select 1 from public.household_members where household_id=target_household and user_id=(select auth.uid())) then raise exception '无权访问该谷仓'; end if;
 if page_size is null or page_size<1 or page_size>48 or page_number is null or page_number<1 or length(q)>500 then raise exception '分页或搜索参数无效'; end if;
 if q ~ '^(gc\s*-?\s*)?[0-9]+$' then digits:=coalesce(nullif(ltrim(regexp_replace(q,'[^0-9]','','g'),'0'),''),'0'); end if;
 with recursive walk as (
  select id start_id,id,parent_id,name::text path,array[id] seen from public.locations where household_id=target_household and deleted_at is null
  union all select w.start_id,p.id,p.parent_id,p.name||' / '||w.path,w.seen||p.id from walk w join public.locations p on p.id=w.parent_id and p.household_id=target_household and p.deleted_at is null where not p.id=any(w.seen)
 ), paths as (select distinct on(start_id) start_id,path,seen from walk order by start_id,cardinality(seen) desc), matched as (
 select i.id,i.inventory_number,i.created_at,greatest(i.updated_at,s.updated_at) updated
 from public.item_instances i join public.item_styles s on s.id=i.item_style_id and s.household_id=i.household_id
 left join public.ips ip on ip.id=s.ip_id and ip.deleted_at is null
 left join public.categories c on c.id=s.category_id and c.deleted_at is null
 left join public.series se on se.id=s.series_id and se.deleted_at is null
 left join paths p on p.start_id=coalesce(i.current_location_id,i.home_location_id)
 where i.household_id=target_household and i.deleted_at is null and s.deleted_at is null
 and (coalesce(filters->>'ip','')='' or ip.id::text=filters->>'ip')
 and (coalesce(filters->>'category','')='' or c.id::text=filters->>'category')
 and (coalesce(filters->>'series','')='' or se.id::text=filters->>'series')
 and (coalesce(filters->>'status','')='' or i.physical_status::text=filters->>'status')
 and (coalesce(filters->>'location','')='' or filters->>'location'=any(array(select v::text from unnest(p.seen) v)))
 and (coalesce(filters->>'character','')='' or exists(select 1 from public.item_style_characters l join public.characters ch on ch.id=l.character_id and ch.deleted_at is null where l.item_style_id=s.id and ch.id::text=filters->>'character'))
 and (q='' or (digits is not null and i.inventory_number::text=digits) or (q !~ '^gc\s*-?\s*[0-9]+$' and strpos(lower(normalize(concat_ws(' ',s.name,s.official_name,s.notes,ip.name,c.name,se.name,coalesce(p.path,'未指定位置'),(select string_agg(ch.name,' ') from public.item_style_characters l join public.characters ch on ch.id=l.character_id and ch.deleted_at is null where l.item_style_id=s.id)),NFKC)),q)>0))
 ), ordered as (select *,row_number() over(order by
  case when filters->>'sort'='updated' then updated end desc,
  case when filters->>'sort'='oldest' then inventory_number end asc nulls last,
  case when coalesce(filters->>'sort','newest')<>'oldest' then inventory_number end desc nulls last,
  case when filters->>'sort'='oldest' then created_at end asc,
  created_at desc,id) n from matched)
 select coalesce(array_agg(id order by n),'{}'),count(*) into ids,total_count from ordered;
 actual_page:=least(page_number,greatest(1,ceil(total_count::numeric/page_size)::integer));
 ids:=ids[((actual_page-1)*page_size+1):(actual_page*page_size)];
 select jsonb_build_object('total',total_count,'page',actual_page,
 'instances',coalesce((select jsonb_agg(to_jsonb(i) order by array_position(ids,i.id)) from public.item_instances i where i.id=any(ids) and i.household_id=target_household),'[]'),
 'styles',coalesce((select jsonb_agg(s) from public.item_styles s where s.household_id=target_household and s.id in(select item_style_id from public.item_instances where id=any(ids))),'[]'),
 'images',coalesce((select jsonb_agg(im) from public.item_images im where im.household_id=target_household and im.item_style_id in(select item_style_id from public.item_instances where id=any(ids))),'[]'),
 'links',coalesce((select jsonb_agg(l) from public.item_style_characters l where l.item_style_id in(select item_style_id from public.item_instances where id=any(ids) and household_id=target_household)),'[]')) into result;
 return result;
end $$;
revoke all on function public.catalog_summary(uuid) from public,anon;
revoke all on function public.browse_catalog(uuid,text,jsonb,integer,integer) from public,anon;
grant execute on function public.catalog_summary(uuid),public.browse_catalog(uuid,text,jsonb,integer,integer) to authenticated;
