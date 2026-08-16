-- Create a household, its owner membership and the root location atomically.

create or replace function public.create_household(household_name text default '我们的谷仓')
returns public.households
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  created_household public.households;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  insert into public.households (name, owner_id)
  values (coalesce(nullif(btrim(household_name), ''), '我们的谷仓'), auth.uid())
  returning * into created_household;

  insert into public.household_members (household_id, user_id, role)
  values (created_household.id, auth.uid(), 'admin'::public.member_role);

  insert into public.locations (household_id, name, location_type, created_by, description)
  values (created_household.id, '家', '其他', auth.uid(), '收藏空间根目录');

  return created_household;
end;
$$;

revoke all on function public.create_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
