-- Preview only until the user approves a separately backed-up production release.
alter table public.categories add column if not exists aliases text[] not null default '{}';

create or replace function public.manage_dictionary(
  p_household uuid, p_kind text, p_source uuid, p_target uuid default null,
  p_name text default null, p_aliases text[] default '{}',
  p_preview boolean default true, p_expected text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  src jsonb; dst jsonb; scope_ip uuid; target_ip uuid;
  ids uuid[]; child_ids uuid[] := '{}'; series_ids uuid[] := '{}';
  row_count integer; live_count integer; token text; plan jsonb; names text[];
  column_name text; duplicate_name boolean;
begin
  if p_preview is null then raise exception '缺少操作模式'; end if;
  if auth.uid() is null or not exists(select 1 from public.household_members where household_id=p_household and user_id=auth.uid()) then
    raise exception '无权管理此家庭空间';
  end if;
  if p_kind not in ('ips','characters','categories','series') or p_kind is null then raise exception '不支持的资料类型'; end if;
  -- Briefly serialize dictionary operations with writes, so a confirmed preview
  -- cannot leave newly linked records pointing at a retired source.
  if not p_preview then
    lock table public.ips, public.characters, public.categories, public.series, public.item_styles, public.item_style_characters in share row exclusive mode;
  end if;
  execute format('select to_jsonb(t) from public.%I t where id=$1 and household_id=$2 and deleted_at is null', p_kind) into src using p_source,p_household;
  if src is null then raise exception '原资料已变化，请刷新后重新预览'; end if;
  if p_target is not null then
    if p_source=p_target then raise exception '不能合并到自己'; end if;
    execute format('select to_jsonb(t) from public.%I t where id=$1 and household_id=$2 and deleted_at is null',p_kind) into dst using p_target,p_household;
    if dst is null then raise exception '目标不存在或不属于此家庭空间'; end if;
    scope_ip := (src->>'ip_id')::uuid; target_ip := (dst->>'ip_id')::uuid;
    if p_kind in ('characters','series') and scope_ip is distinct from target_ip then raise exception '角色和系列只能在同一 IP 内合并'; end if;
  else
    if nullif(btrim(p_name),'') is null or length(p_name)>120 then raise exception '名称需为 1–120 个字符'; end if;
    execute format('select exists(select 1 from public.%I t where household_id=$1 and id<>$2 and deleted_at is null and lower(btrim(name))=lower(btrim($3)) and ($4 not in (''characters'',''series'') or (to_jsonb(t)->>''ip_id'') is not distinct from ($5->>''ip_id'')))',p_kind)
      into duplicate_name using p_household,p_source,p_name,p_kind,src;
    if duplicate_name then raise exception '同名资料已存在，请使用合并'; end if;
  end if;
  if cardinality(coalesce(p_aliases,'{}'))>30 or exists(select 1 from unnest(p_aliases) n where length(n)>120) then raise exception '别名最多 30 个，每个最多 120 字'; end if;
  column_name := case p_kind when 'ips' then 'ip_id' when 'categories' then 'category_id' when 'series' then 'series_id' end;
  if p_kind='characters' then
    select coalesce(array_agg(s.id order by s.id),'{}') into ids from public.item_styles s
    where s.household_id=p_household and exists(select 1 from public.item_style_characters l where l.item_style_id=s.id and l.character_id=p_source);
  else
    execute format('select coalesce(array_agg(id order by id),''{}'') from public.item_styles where household_id=$1 and %I=$2',column_name) into ids using p_household,p_source;
  end if;
  if p_kind='ips' then
    select coalesce(array_agg(id order by id),'{}') into child_ids from public.characters where household_id=p_household and ip_id=p_source;
    select coalesce(array_agg(id order by id),'{}') into series_ids from public.series where household_id=p_household and ip_id=p_source;
  end if;
  select count(*),count(*) filter(where i.deleted_at is null and s.deleted_at is null) into row_count,live_count
    from public.item_instances i join public.item_styles s on s.id=i.item_style_id where i.household_id=p_household and i.item_style_id=any(ids);
  token := md5(jsonb_build_array(src,dst,ids,child_ids,series_ids,row_count,live_count,btrim(p_name),p_aliases)::text);
  plan := jsonb_build_object('token',token,'styles',cardinality(ids),'instances',row_count,'active',live_count,'children',cardinality(child_ids),'series',cardinality(series_ids),'source',src->>'name','target',coalesce(dst->>'name',btrim(p_name)));
  if p_preview then return plan; end if;
  if p_expected is distinct from token then raise exception '影响范围已变化，请重新预览后确认'; end if;
  if p_target is null then
    select coalesce(array_agg(distinct btrim(n)) filter(where btrim(n)<>''),'{}') into names from unnest(coalesce(p_aliases,'{}') || case when src->>'name'<>btrim(p_name) then array[src->>'name'] else '{}'::text[] end) n;
    execute format('update public.%I set name=$1,aliases=$2 where id=$3 and household_id=$4',p_kind) using btrim(p_name),names,p_source,p_household;
  else
    select coalesce(array_agg(distinct n),'{}') into names from (
      select jsonb_array_elements_text(coalesce(src->'aliases','[]')) n union select jsonb_array_elements_text(coalesce(dst->'aliases','[]')) union select src->>'name'
    ) a where nullif(btrim(n),'') is not null;
    execute format('update public.%I set aliases=$1 where id=$2 and household_id=$3',p_kind) using names,p_target,p_household;
    if p_kind='characters' then
      insert into public.item_style_characters(item_style_id,character_id,sort_order)
        select item_style_id,p_target,sort_order from public.item_style_characters where character_id=p_source and item_style_id=any(ids)
        on conflict(item_style_id,character_id) do nothing;
      delete from public.item_style_characters where character_id=p_source and item_style_id=any(ids);
    else
      execute format('update public.item_styles set %I=$1,updated_by=auth.uid() where household_id=$2 and id=any($3)',column_name) using p_target,p_household,ids;
    end if;
    if p_kind='ips' then
      update public.characters set ip_id=p_target where household_id=p_household and id=any(child_ids);
      update public.series set ip_id=p_target where household_id=p_household and id=any(series_ids);
    end if;
    execute format('update public.%I set deleted_at=now() where id=$1 and household_id=$2',p_kind) using p_source,p_household;
  end if;
  insert into public.activity_events(household_id,actor_id,action_type,entity_type,entity_id,metadata)
    values(p_household,auth.uid(),case when p_target is null then 'dictionary_rename' else 'dictionary_merge' end,p_kind,p_source,plan);
  return plan || jsonb_build_object('applied',true);
end;
$$;
revoke all on function public.manage_dictionary(uuid,text,uuid,uuid,text,text[],boolean,text) from public,anon;
grant execute on function public.manage_dictionary(uuid,text,uuid,uuid,text,text[],boolean,text) to authenticated;

create or replace function public.set_style_characters(p_style uuid, p_characters uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare h uuid; ip uuid;
begin
  select household_id,ip_id into h,ip from public.item_styles where id=p_style for update;
  if h is null or auth.uid() is null or not exists(select 1 from public.household_members where household_id=h and user_id=auth.uid()) then raise exception '无权更新角色'; end if;
  if p_characters is null or cardinality(p_characters)>50 then raise exception '角色数量无效'; end if;
  if exists(select 1 from unnest(p_characters) c where c is null or not exists(select 1 from public.characters where id=c and household_id=h and ip_id=ip and deleted_at is null)) then raise exception '角色与 IP 不匹配'; end if;
  delete from public.item_style_characters where item_style_id=p_style;
  insert into public.item_style_characters(item_style_id,character_id,sort_order)
    select p_style,c,min(n)::integer-1 from unnest(p_characters) with ordinality t(c,n) group by c;
end $$;
revoke all on function public.set_style_characters(uuid,uuid[]) from public,anon;
grant execute on function public.set_style_characters(uuid,uuid[]) to authenticated;
