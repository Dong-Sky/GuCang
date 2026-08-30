-- Run only on gucang-test after the inventory_codes migration.
-- Uses an existing test profile, creates isolated fixtures, then rolls them ALL
-- back. Never runs a hard-delete test against an existing collection.
begin;
set local statement_timeout = '20s';
do $$
declare
  actor uuid;
  home_a uuid := gen_random_uuid();
  home_b uuid := gen_random_uuid();
  forbidden_home uuid := gen_random_uuid();
  style_a uuid := gen_random_uuid();
  style_b uuid := gen_random_uuid();
  forbidden_style uuid := gen_random_uuid();
  ip uuid := gen_random_uuid();
  category uuid := gen_random_uuid();
  location uuid := gen_random_uuid();
  first_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  discarded_id uuid := gen_random_uuid();
  n bigint;
  code text;
begin
  select id into actor from public.profiles order by created_at, id limit 1;
  if actor is null then raise exception 'A test profile is required'; end if;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  insert into public.households(id,name,owner_id) values
    (home_a,'GC numbering test A',actor),(home_b,'GC numbering test B',actor),(forbidden_home,'GC forbidden test',actor);
  insert into public.household_members(household_id,user_id,role) values (home_a,actor,'admin'),(home_b,actor,'admin');
  insert into public.ips(id,household_id,name,created_by) values(ip,home_a,'GC test IP',actor);
  insert into public.categories(id,household_id,name) values(category,home_a,'GC test category');
  insert into public.locations(id,household_id,name,created_by) values(location,home_a,'GC test location',actor);
  insert into public.item_styles(id,household_id,name,ip_id,category_id,created_by,updated_by) values(style_a,home_a,'',ip,category,actor,actor);
  insert into public.item_styles(id,household_id,name,created_by,updated_by) values(style_b,home_b,'',actor,actor),(forbidden_style,forbidden_home,'',actor,actor);

  execute 'set local role authenticated';
  if (select completion_status from public.item_styles where id=style_a) <> 'complete' then raise exception 'Optional name incorrectly marked draft'; end if;
  insert into public.item_instances(id,household_id,item_style_id,created_by,updated_by,current_location_id,home_location_id)
  values(first_id,home_a,style_a,actor,actor,location,location),(second_id,home_a,style_a,actor,actor,location,location);
  if (select inventory_code from public.item_instances where id=first_id) <> 'GC-000001'
     or (select inventory_code from public.item_instances where id=second_id) <> 'GC-000002' then raise exception 'Instances of same style need independent codes'; end if;
  insert into public.item_instances(id,household_id,item_style_id,created_by,updated_by)
  values(first_id,home_a,style_a,actor,actor)
  on conflict(id) do update set updated_by=excluded.updated_by, inventory_number=excluded.inventory_number;
  if (select inventory_code from public.item_instances where id=first_id) <> 'GC-000001' then raise exception 'Retry renumbered an instance'; end if;

  begin
    update public.item_instances set inventory_number=999 where id=first_id;
    raise exception 'Number edit should have failed';
  exception when sqlstate '22000' then null; end;
  begin
    update public.item_instances set household_id=home_b where id=first_id;
    raise exception 'Household reassignment should have failed';
  exception when sqlstate '22000' then null; end;
  begin
    insert into public.item_instances(household_id,item_style_id,created_by,updated_by) values(forbidden_home,forbidden_style,actor,actor);
    raise exception 'Unrelated household insert should have failed';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from private.inventory_counters;
    raise exception 'Counter must not be client-readable';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated','private.assign_inventory_number()','EXECUTE')
     or has_table_privilege('anon','private.inventory_code_backups','SELECT') then raise exception 'Private privilege leak'; end if;

  perform public.move_item_instance(first_id,null,'temporarily_out','GC regression only');
  perform public.move_item_instance(first_id,location,'stored','GC regression only');
  update public.item_instances set deleted_at=now() where id=first_id;
  update public.item_instances set deleted_at=null where id=first_id;
  if (select inventory_code from public.item_instances where id=first_id) <> 'GC-000001' then raise exception 'Lifecycle changed code'; end if;
  insert into public.item_instances(id,household_id,item_style_id,created_by,updated_by,inventory_number)
  values(discarded_id,home_a,style_a,actor,actor,99999) returning inventory_number into n;
  if n <> 3 then raise exception 'Client supplied a number or retry consumed another number'; end if;
  delete from public.item_instances where id=discarded_id;
  insert into public.item_instances(household_id,item_style_id,created_by,updated_by) values(home_a,style_a,actor,actor) returning inventory_number into n;
  if n <> 4 then raise exception 'Deleted maximum number was reused'; end if;
  insert into public.item_instances(household_id,item_style_id,created_by,updated_by) values(home_b,style_b,actor,actor) returning inventory_code into code;
  if code <> 'GC-000001' then raise exception 'Households did not have independent counters'; end if;

  execute 'reset role';
  update private.inventory_counters set last_number=999999 where household_id=home_a;
  execute 'set local role authenticated';
  insert into public.item_instances(household_id,item_style_id,created_by,updated_by) values(home_a,style_a,actor,actor) returning inventory_code into code;
  if code <> 'GC-1000000' then raise exception 'Code was truncated beyond six digits'; end if;
  if (select inventory_code from public.item_instances where id=first_id) <> 'GC-000001' then raise exception 'Old code changed during expansion'; end if;
  execute 'reset role';
end $$;
select 'PASS: optional name, per-instance numbering, retry, immutable identity, RLS, private counters, move, trash, restore, no reuse, household isolation and 7-digit expansion' as result;
rollback;
