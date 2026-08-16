-- Repair records created before normal item entry stopped automatically reusing
-- a style with the same name/IP/category/series. Each affected save produced
-- one instance and one main image, so pairing by creation order is lossless.

create temporary table repair_candidates on commit drop as
with instance_counts as (
  select item_style_id, count(*)::integer as instance_count
  from public.item_instances
  where deleted_at is null
  group by item_style_id
),
image_counts as (
  select
    item_style_id,
    count(*)::integer as image_count,
    bool_and(image_type = 'main' and sort_order = 0) as only_main_images
  from public.item_images
  where deleted_at is null
  group by item_style_id
)
select styles.id as style_id, instances.instance_count
from public.item_styles styles
join instance_counts instances on instances.item_style_id = styles.id
join image_counts images on images.item_style_id = styles.id
where styles.deleted_at is null
  and instances.instance_count > 1
  and images.image_count = instances.instance_count
  and images.only_main_images;

create temporary table repair_instances on commit drop as
select
  instances.item_style_id as style_id,
  instances.id as instance_id,
  instances.created_at as instance_created_at,
  row_number() over (
    partition by instances.item_style_id
    order by instances.created_at, instances.id
  )::integer as ordinal,
  count(*) over (partition by instances.item_style_id)::integer as instance_count
from public.item_instances instances
join repair_candidates candidates on candidates.style_id = instances.item_style_id
where instances.deleted_at is null;

create temporary table repair_images on commit drop as
select
  images.item_style_id as style_id,
  images.id as image_id,
  row_number() over (
    partition by images.item_style_id
    order by images.created_at, images.id
  )::integer as ordinal
from public.item_images images
join repair_candidates candidates on candidates.style_id = images.item_style_id
where images.deleted_at is null;

-- Link rows have no timestamp in V1. Their physical insertion order still
-- preserves the order in which each new character first appeared.
create temporary table repair_characters on commit drop as
select
  links.item_style_id as style_id,
  links.character_id,
  row_number() over (
    partition by links.item_style_id
    order by links.ctid
  )::integer as ordinal,
  count(*) over (partition by links.item_style_id)::integer as character_count
from public.item_style_characters links
join repair_candidates candidates on candidates.style_id = links.item_style_id;

create temporary table repair_map on commit drop as
select
  instances.style_id,
  instances.instance_id,
  images.image_id,
  instances.instance_created_at,
  instances.ordinal,
  instances.instance_count,
  case
    when instances.ordinal = 1 then instances.style_id
    else gen_random_uuid()
  end as new_style_id,
  case
    when coalesce(character_counts.character_count, 0) = 0 then null
    when character_counts.character_count = 1 then (
      select characters.character_id
      from repair_characters characters
      where characters.style_id = instances.style_id
        and characters.ordinal = 1
    )
    when character_counts.character_count = instances.instance_count then (
      select characters.character_id
      from repair_characters characters
      where characters.style_id = instances.style_id
        and characters.ordinal = instances.ordinal
    )
    when instances.ordinal = instances.instance_count then (
      select characters.character_id
      from repair_characters characters
      where characters.style_id = instances.style_id
      order by characters.ordinal desc
      limit 1
    )
    else (
      select characters.character_id
      from repair_characters characters
      where characters.style_id = instances.style_id
        and characters.ordinal = 1
    )
  end as character_id
from repair_instances instances
join repair_images images
  on images.style_id = instances.style_id
 and images.ordinal = instances.ordinal
left join (
  select style_id, max(character_count)::integer as character_count
  from repair_characters
  group by style_id
) character_counts on character_counts.style_id = instances.style_id;

do $$
begin
  if (select count(*) from repair_map) <> (select coalesce(sum(instance_count), 0) from repair_candidates) then
    raise exception 'Merged item repair could not pair every instance with an image';
  end if;
end
$$;

-- Keep a private, complete pre-repair snapshot so this data operation can be
-- audited or reversed without relying on a user export.
create table if not exists private.item_merge_repair_backups (
  id uuid primary key default gen_random_uuid(),
  repair_key text not null unique,
  created_at timestamptz not null default now(),
  snapshot jsonb not null
);

insert into private.item_merge_repair_backups (repair_key, snapshot)
select
  'split_merged_styles_20260816',
  jsonb_build_object(
    'item_styles', (
      select coalesce(jsonb_agg(to_jsonb(styles) order by styles.created_at, styles.id), '[]'::jsonb)
      from public.item_styles styles
      where styles.id in (select style_id from repair_candidates)
    ),
    'item_instances', (
      select coalesce(jsonb_agg(to_jsonb(instances) order by instances.created_at, instances.id), '[]'::jsonb)
      from public.item_instances instances
      where instances.item_style_id in (select style_id from repair_candidates)
    ),
    'item_images', (
      select coalesce(jsonb_agg(to_jsonb(images) order by images.created_at, images.id), '[]'::jsonb)
      from public.item_images images
      where images.item_style_id in (select style_id from repair_candidates)
    ),
    'item_style_characters', (
      select coalesce(jsonb_agg(to_jsonb(links)), '[]'::jsonb)
      from public.item_style_characters links
      where links.item_style_id in (select style_id from repair_candidates)
    ),
    'repair_map', (
      select coalesce(jsonb_agg(to_jsonb(mapping) order by mapping.style_id, mapping.ordinal), '[]'::jsonb)
      from repair_map mapping
    )
  )
where exists (select 1 from repair_candidates)
on conflict (repair_key) do nothing;

insert into public.item_styles (
  id,
  household_id,
  ip_id,
  category_id,
  series_id,
  name,
  official_name,
  completion_status,
  notes,
  search_text,
  created_by,
  updated_by,
  created_at,
  updated_at,
  deleted_at
)
select
  mapping.new_style_id,
  styles.household_id,
  styles.ip_id,
  styles.category_id,
  styles.series_id,
  styles.name,
  styles.official_name,
  styles.completion_status,
  styles.notes,
  styles.search_text,
  styles.created_by,
  styles.updated_by,
  mapping.instance_created_at,
  mapping.instance_created_at,
  styles.deleted_at
from repair_map mapping
join public.item_styles styles on styles.id = mapping.style_id
where mapping.ordinal > 1;

update public.item_instances instances
set item_style_id = mapping.new_style_id
from repair_map mapping
where instances.id = mapping.instance_id
  and mapping.ordinal > 1;

update public.item_images images
set item_style_id = mapping.new_style_id
from repair_map mapping
where images.id = mapping.image_id
  and mapping.ordinal > 1;

delete from public.item_style_characters
where item_style_id in (select style_id from repair_candidates);

insert into public.item_style_characters (item_style_id, character_id, sort_order)
select distinct mapping.new_style_id, mapping.character_id, 0
from repair_map mapping
where mapping.character_id is not null;

update public.item_styles styles
set search_text = concat_ws(
  ' ',
  nullif(btrim(styles.name), ''),
  (select nullif(btrim(ips.name), '') from public.ips ips where ips.id = styles.ip_id),
  (
    select nullif(string_agg(characters.name, ' ' order by links.sort_order, characters.name), '')
    from public.item_style_characters links
    join public.characters characters on characters.id = links.character_id
    where links.item_style_id = styles.id
  ),
  (select nullif(btrim(categories.name), '') from public.categories categories where categories.id = styles.category_id),
  (select nullif(btrim(series.name), '') from public.series series where series.id = styles.series_id),
  nullif(btrim(styles.notes), '')
)
where styles.id in (select new_style_id from repair_map);

do $$
begin
  if exists (
    select 1
    from repair_map mapping
    left join public.item_instances instances on instances.item_style_id = mapping.new_style_id and instances.deleted_at is null
    left join public.item_images images on images.item_style_id = mapping.new_style_id and images.deleted_at is null
    group by mapping.new_style_id
    having count(distinct instances.id) <> 1 or count(distinct images.id) <> 1
  ) then
    raise exception 'Merged item repair produced an invalid style-to-instance/image mapping';
  end if;
end
$$;
