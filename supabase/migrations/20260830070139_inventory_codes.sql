-- Stable household-scoped codes belong to physical instances, not styles.
-- Additive and compatible with older clients. No image/storage mutations.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Stop concurrent inserts only for this short, atomic backfill. Never keep a
-- table lock open while waiting for a client, network call or photo upload.
lock table public.item_styles, public.item_instances in access exclusive mode;

create table private.inventory_code_backups (
  entity_type text not null,
  entity_id uuid not null,
  before_row jsonb not null,
  backed_up_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);
alter table private.inventory_code_backups enable row level security;
revoke all on private.inventory_code_backups from public, anon, authenticated;
insert into private.inventory_code_backups (entity_type, entity_id, before_row)
select 'item_instances', id, to_jsonb(i) from public.item_instances i
union all
select 'item_styles', id, to_jsonb(s) from public.item_styles s;

alter table public.item_instances add column inventory_number bigint;
alter table public.item_instances add column inventory_code text generated always as
  ('GC-' || lpad(inventory_number::text, greatest(6, length(inventory_number::text)), '0')) stored;

-- Preserve original timestamps so a maintenance backfill is not shown as a
-- user edit. These named triggers are re-enabled before the transaction ends.
alter table public.item_instances disable trigger item_instances_touch_updated_at;
alter table public.item_styles disable trigger item_styles_touch_updated_at;
with numbered as (
  select id, row_number() over (partition by household_id order by created_at, id) as number
  from public.item_instances -- Include trash; never merge look-alike records.
)
update public.item_instances i set inventory_number = n.number
from numbered n where i.id = n.id;

alter table public.item_instances alter column inventory_number set not null;
alter table public.item_instances add constraint item_instances_inventory_positive check (inventory_number > 0);
alter table public.item_instances add constraint item_instances_household_inventory_key unique (household_id, inventory_number);

create table private.inventory_counters (
  household_id uuid primary key references public.households(id) on delete cascade,
  last_number bigint not null default 0 check (last_number >= 0)
);
alter table private.inventory_counters enable row level security;
revoke all on private.inventory_counters from public, anon, authenticated;
insert into private.inventory_counters (household_id, last_number)
select household_id, max(inventory_number) from public.item_instances group by household_id;

-- A style's completeness covers its shared IP/category only. Location remains
-- an instance-level check, so a duplicate stored elsewhere cannot change it.
update public.item_styles set completion_status =
  case when ip_id is not null and category_id is not null then 'complete'::public.completion_status
       else 'draft'::public.completion_status end
where completion_status <> 'review';
alter table public.item_styles alter column name set default '';
alter table public.item_instances enable trigger item_instances_touch_updated_at;
alter table public.item_styles enable trigger item_styles_touch_updated_at;

create function private.assign_inventory_number()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  existing_number bigint;
  existing_household uuid;
begin
  if tg_op = 'UPDATE' then
    if new.inventory_number is distinct from old.inventory_number
       or new.household_id is distinct from old.household_id then
      raise exception '收藏编号及所属谷仓不能更改' using errcode = '22000';
    end if;
    return new;
  end if;
  -- The definer can access the private counter, not bypass household authority.
  if auth.uid() is null or not private.is_household_member(new.household_id) then
    raise exception '无权在这个谷仓分配编号' using errcode = '42501';
  end if;
  insert into private.inventory_counters (household_id, last_number)
  values (new.household_id, 0) on conflict (household_id) do nothing;
  perform 1 from private.inventory_counters where household_id = new.household_id for update;

  -- Re-check under the household lock: simultaneous retries with the same UUID
  -- keep their original number, including INSERT ... ON CONFLICT DO UPDATE.
  select i.inventory_number, i.household_id into existing_number, existing_household
  from public.item_instances i where i.id = new.id;
  if found then
    if existing_household <> new.household_id then
      raise exception '收藏实例不属于当前谷仓' using errcode = '42501';
    end if;
    new.inventory_number := existing_number;
  else
    update private.inventory_counters set last_number = last_number + 1
    where household_id = new.household_id returning last_number into new.inventory_number;
  end if;
  return new;
end;
$$;
revoke all on function private.assign_inventory_number() from public, anon, authenticated;
create trigger item_instances_inventory_number before insert or update on public.item_instances
for each row execute function private.assign_inventory_number();

create function private.set_style_completeness()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if new.completion_status <> 'review' then
    new.completion_status := case when new.ip_id is not null and new.category_id is not null
      then 'complete'::public.completion_status else 'draft'::public.completion_status end;
  end if;
  return new;
end;
$$;
revoke all on function private.set_style_completeness() from public, anon, authenticated;
create trigger item_styles_completeness before insert or update on public.item_styles
for each row execute function private.set_style_completeness();

comment on column public.item_instances.inventory_number is 'Immutable household-local ordinal; deleted numbers are never reused.';
comment on column public.item_instances.inventory_code is 'GC- prefix, minimum 6 digits, expands without renumbering historical instances.';
comment on table private.inventory_code_backups is 'Pre-numbering records for recovery. Private; no photo files are modified by this migration.';

-- Abort the entire migration if a pre-existing field (including timestamps,
-- names, soft-delete flags, ownership or location) changed unexpectedly.
do $$ begin
  if (select count(*) from public.item_instances) <> (select count(*) from private.inventory_code_backups where entity_type = 'item_instances')
     or exists (select 1 from public.item_instances i join private.inventory_code_backups b
       on b.entity_type = 'item_instances' and b.entity_id = i.id
       where to_jsonb(i) - 'inventory_number' - 'inventory_code' <> b.before_row)
     or (select count(*) from public.item_styles) <> (select count(*) from private.inventory_code_backups where entity_type = 'item_styles')
     or exists (select 1 from public.item_styles s join private.inventory_code_backups b
       on b.entity_type = 'item_styles' and b.entity_id = s.id
       where to_jsonb(s) - 'completion_status' <> b.before_row - 'completion_status') then
    raise exception '编号迁移完整性校验失败，全部回滚';
  end if;
end $$;
commit;
