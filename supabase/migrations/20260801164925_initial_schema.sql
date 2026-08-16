-- 谷仓 V1 数据库：家庭空间、款式档案、实物实例、自由树状位置与操作记录

create extension if not exists "pgcrypto";

create type public.member_role as enum ('admin', 'member');
create type public.completion_status as enum ('complete', 'draft', 'review');
create type public.physical_status as enum ('stored', 'temporarily_out', 'displayed', 'unknown');
create type public.image_type as enum ('main', 'attachment');
create type public.movement_action_type as enum ('move', 'take_out', 'return', 'display');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default '我们的谷仓',
  owner_id uuid not null references public.profiles(id),
  storage_quota_bytes bigint not null default 1073741824,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  role public.member_role not null default 'member',
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.ips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  name_zh text,
  name_ja text,
  name_en text,
  aliases text[] not null default '{}',
  cover_image_id uuid,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  ip_id uuid not null references public.ips(id) on delete cascade,
  name text not null,
  name_original text,
  aliases text[] not null default '{}',
  avatar_image_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  icon text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.series (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  ip_id uuid references public.ips(id) on delete set null,
  name text not null,
  year integer,
  aliases text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  parent_id uuid references public.locations(id) on delete restrict,
  name text not null,
  location_type text not null default 'other',
  description text,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, parent_id, name)
);

create table public.item_styles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  ip_id uuid references public.ips(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  series_id uuid references public.series(id) on delete set null,
  name text not null default '未命名谷子',
  official_name text,
  completion_status public.completion_status not null default 'draft',
  notes text,
  search_text text not null default '',
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.item_style_characters (
  item_style_id uuid not null references public.item_styles(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (item_style_id, character_id)
);

create table public.item_instances (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  item_style_id uuid not null references public.item_styles(id) on delete cascade,
  physical_status public.physical_status not null default 'stored',
  current_location_id uuid references public.locations(id) on delete set null,
  home_location_id uuid references public.locations(id) on delete set null,
  is_sealed boolean not null default false,
  condition_note text,
  acquired_at date,
  acquisition_source text,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.item_images (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  item_style_id uuid not null references public.item_styles(id) on delete cascade,
  image_type public.image_type not null default 'main',
  detail_path text not null,
  thumbnail_path text,
  file_size_bytes bigint not null default 0,
  thumbnail_size_bytes bigint not null default 0,
  width integer,
  height integer,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.location_images (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  image_type public.image_type not null default 'main',
  detail_path text not null,
  thumbnail_path text,
  file_size_bytes bigint not null default 0,
  thumbnail_size_bytes bigint not null default 0,
  width integer,
  height integer,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.movement_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  item_instance_id uuid not null references public.item_instances(id) on delete cascade,
  action_type public.movement_action_type not null,
  from_location_id uuid references public.locations(id) on delete set null,
  to_location_id uuid references public.locations(id) on delete set null,
  from_status public.physical_status,
  to_status public.physical_status,
  actor_id uuid not null references public.profiles(id),
  note text,
  reverses_event_id uuid references public.movement_events(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  entity_type text not null,
  entity_id uuid,
  action_type text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.export_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  format text not null default 'zip',
  file_size_bytes bigint,
  created_at timestamptz not null default now()
);

create index locations_household_parent_idx on public.locations(household_id, parent_id);
create index item_styles_household_search_idx on public.item_styles using gin (to_tsvector('simple', search_text));
create index item_instances_household_location_idx on public.item_instances(household_id, current_location_id);
create index activity_events_household_created_idx on public.activity_events(household_id, created_at desc);

-- Keep security-definer helpers outside the API-exposed `public` schema.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
grant usage on schema private to supabase_auth_admin;

create or replace function private.is_household_member(target_household uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household and user_id = auth.uid()
  );
$$;

create or replace function private.is_household_admin(target_household uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household and user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function private.is_household_owner(target_household uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1 from public.households
    where id = target_household and owner_id = auth.uid()
  );
$$;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

revoke execute on function private.is_household_member(uuid) from anon, authenticated, public;
grant execute on function private.is_household_member(uuid) to authenticated;
revoke execute on function private.is_household_admin(uuid) from anon, authenticated, public;
grant execute on function private.is_household_admin(uuid) to authenticated;
revoke execute on function private.is_household_owner(uuid) from anon, authenticated, public;
grant execute on function private.is_household_owner(uuid) to authenticated;
revoke execute on function private.handle_new_user() from anon, authenticated, public;
grant execute on function private.handle_new_user() to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.ips enable row level security;
alter table public.characters enable row level security;
alter table public.categories enable row level security;
alter table public.series enable row level security;
alter table public.locations enable row level security;
alter table public.item_styles enable row level security;
alter table public.item_style_characters enable row level security;
alter table public.item_instances enable row level security;
alter table public.item_images enable row level security;
alter table public.location_images enable row level security;
alter table public.movement_events enable row level security;
alter table public.activity_events enable row level security;
alter table public.export_events enable row level security;

create policy profiles_self on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy households_member_read on public.households for select to authenticated using (private.is_household_member(id));
create policy households_owner_insert on public.households for insert to authenticated with check (owner_id = auth.uid());
create policy households_admin_update on public.households for update to authenticated using (private.is_household_admin(id)) with check (private.is_household_admin(id));
create policy households_admin_delete on public.households for delete to authenticated using (private.is_household_admin(id));

create policy household_members_read on public.household_members for select to authenticated using (private.is_household_member(household_id));
create policy household_members_admin_write on public.household_members for all to authenticated using (private.is_household_admin(household_id)) with check (private.is_household_admin(household_id));
create policy household_members_self_insert on public.household_members for insert to authenticated with check (user_id = auth.uid() and private.is_household_owner(household_id));

create policy household_invites_member_read on public.household_invites for select to authenticated using (private.is_household_member(household_id));
create policy household_invites_admin_write on public.household_invites for all to authenticated using (private.is_household_admin(household_id)) with check (private.is_household_admin(household_id));

create policy ips_member_access on public.ips for all to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy characters_member_access on public.characters for all to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy categories_member_access on public.categories for all to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy series_member_access on public.series for all to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy locations_member_access on public.locations for all to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy item_styles_member_access on public.item_styles for all to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy item_instances_member_access on public.item_instances for all to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy item_images_member_access on public.item_images for all to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy location_images_member_access on public.location_images for all to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy movement_events_member_access on public.movement_events for all to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy activity_events_member_access on public.activity_events for all to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy export_events_member_access on public.export_events for all to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));

create policy item_style_characters_member_access on public.item_style_characters for all to authenticated using (
  exists (select 1 from public.item_styles s where s.id = item_style_id and private.is_household_member(s.household_id))
) with check (
  exists (select 1 from public.item_styles s where s.id = item_style_id and private.is_household_member(s.household_id))
);

-- Storage 建议使用私有 bucket `collection-images`，路径以 households/{household_id}/ 开头。
-- 上传、读取与删除策略应在 Supabase Storage 页面按同一 is_household_member 规则配置。
