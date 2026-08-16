-- V1 workflow helpers: invite acceptance, atomic movement and updated timestamps.

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.touch_updated_at() from public, anon, authenticated;
grant execute on function private.touch_updated_at() to postgres;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute procedure private.touch_updated_at();

drop trigger if exists households_touch_updated_at on public.households;
create trigger households_touch_updated_at before update on public.households
for each row execute procedure private.touch_updated_at();

drop trigger if exists ips_touch_updated_at on public.ips;
create trigger ips_touch_updated_at before update on public.ips
for each row execute procedure private.touch_updated_at();

drop trigger if exists characters_touch_updated_at on public.characters;
create trigger characters_touch_updated_at before update on public.characters
for each row execute procedure private.touch_updated_at();

drop trigger if exists locations_touch_updated_at on public.locations;
create trigger locations_touch_updated_at before update on public.locations
for each row execute procedure private.touch_updated_at();

drop trigger if exists item_styles_touch_updated_at on public.item_styles;
create trigger item_styles_touch_updated_at before update on public.item_styles
for each row execute procedure private.touch_updated_at();

drop trigger if exists item_instances_touch_updated_at on public.item_instances;
create trigger item_instances_touch_updated_at before update on public.item_instances
for each row execute procedure private.touch_updated_at();

create or replace function public.accept_household_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  invite_row public.household_invites%rowtype;
  account_email text;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  if invite_token is null or length(trim(invite_token)) < 16 then
    raise exception '邀请链接无效';
  end if;

  select *
  into invite_row
  from public.household_invites
  where token_hash = encode(extensions.digest(convert_to(trim(invite_token), 'utf8'), 'sha256'), 'hex')
    and accepted_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception '邀请不存在、已使用或已过期';
  end if;

  select lower(email)
  into account_email
  from auth.users
  where id = auth.uid();

  if account_email is null or account_email <> lower(invite_row.email) then
    raise exception '此邀请仅发送给 %', invite_row.email;
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (invite_row.household_id, auth.uid(), invite_row.role)
  on conflict (household_id, user_id) do update set role = excluded.role;

  update public.household_invites
  set accepted_at = now()
  where id = invite_row.id;

  return invite_row.household_id;
end;
$$;

revoke all on function public.accept_household_invite(text) from public, anon;
grant execute on function public.accept_household_invite(text) to authenticated;

create or replace function public.move_item_instance(
  target_instance uuid,
  target_location uuid,
  target_status public.physical_status,
  target_note text default null
)
returns public.item_instances
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  before_row public.item_instances%rowtype;
  after_row public.item_instances%rowtype;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  select *
  into before_row
  from public.item_instances
  where id = target_instance
    and deleted_at is null
    and private.is_household_member(household_id)
  for update;

  if not found then
    raise exception '收藏实例不存在或无权操作';
  end if;

  if target_location is not null and not exists (
    select 1 from public.locations
    where id = target_location
      and household_id = before_row.household_id
      and deleted_at is null
  ) then
    raise exception '目标位置不存在或不属于当前家庭空间';
  end if;

  update public.item_instances
  set current_location_id = target_location,
      updated_by = auth.uid(),
      physical_status = target_status
  where id = before_row.id
  returning * into after_row;

  insert into public.movement_events (
    household_id, item_instance_id, action_type, from_location_id,
    to_location_id, from_status, to_status, actor_id, note
  ) values (
    before_row.household_id,
    before_row.id,
    case
      when target_status = 'temporarily_out' then 'take_out'::public.movement_action_type
      when before_row.physical_status = 'temporarily_out' and target_status = 'stored' then 'return'::public.movement_action_type
      when target_status = 'displayed' then 'display'::public.movement_action_type
      else 'move'::public.movement_action_type
    end,
    before_row.current_location_id,
    target_location,
    before_row.physical_status,
    target_status,
    auth.uid(),
    target_note
  );

  insert into public.activity_events (
    household_id, actor_id, entity_type, entity_id, action_type, metadata
  ) values (
    before_row.household_id,
    auth.uid(),
    'item_instance',
    before_row.id,
    'move',
    jsonb_build_object('from_location_id', before_row.current_location_id, 'to_location_id', target_location, 'status', target_status)
  );

  return after_row;
end;
$$;

revoke all on function public.move_item_instance(uuid, uuid, public.physical_status, text) from public, anon;
grant execute on function public.move_item_instance(uuid, uuid, public.physical_status, text) to authenticated;
