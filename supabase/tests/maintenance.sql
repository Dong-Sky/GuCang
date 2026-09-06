-- Execute only on gucang-test. All synthetic data is rolled back.
begin;
do $$
declare u uuid; h uuid:=gen_random_uuid(); solo uuid:=gen_random_uuid(); shared uuid:=gen_random_uuid(); recent uuid:=gen_random_uuid(); job uuid; blocked boolean:=false;
begin
 select id into u from public.profiles order by created_at limit 1;
 if u is null then raise exception 'Test requires an existing test profile'; end if;
 insert into public.households(id,name,owner_id) values(h,'maintenance-rollback-test',u);
 insert into public.household_members(household_id,user_id,role) values(h,u,'admin');
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.item_styles(id,household_id,created_by,updated_by) values(solo,h,u,u),(shared,h,u,u),(recent,h,u,u);
 insert into public.item_instances(household_id,item_style_id,created_by,updated_by,deleted_at) values
 (h,solo,u,u,now()-interval '8 days'),(h,shared,u,u,now()-interval '8 days'),(h,shared,u,u,null),(h,recent,u,u,now()-interval '6 days');
 insert into public.item_images(household_id,item_style_id,created_by,detail_path,thumbnail_path) values
 (h,solo,u,'households/'||h||'/solo.webp','households/'||h||'/solo-thumb.webp'),
 (h,shared,u,'households/'||h||'/shared.webp','households/'||h||'/shared-thumb.webp');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('role','authenticated',true);
 perform public.prepare_maintenance(h);
 if exists(select 1 from public.item_styles where id=solo) then raise exception 'Expired solo retained'; end if;
 if (select count(*) from public.item_instances where household_id=h)<>2 then raise exception 'Active or recent item changed'; end if;
 if not exists(select 1 from public.item_images where item_style_id=shared) then raise exception 'Shared photos removed'; end if;
 select id into job from public.maintenance_jobs where household_id=h and item_style_id=solo and cardinality(paths)=2 and status='pending';
 if job is null then raise exception 'Media paths not retained'; end if;
 perform public.prepare_maintenance(h);
 if (select count(*) from public.maintenance_jobs where household_id=h)<>2 then raise exception 'Retry duplicated jobs'; end if;
 perform public.record_maintenance_attempt(h,job,false,'simulated offline');
 if not exists(select 1 from public.maintenance_jobs where id=job and status='failed' and attempts=1) then raise exception 'Failure not durable'; end if;
 perform public.record_maintenance_attempt(h,job,true,null);
 if not exists(select 1 from public.maintenance_jobs where id=job and status='done' and attempts=2 and last_error is null) then raise exception 'Retry did not complete'; end if;
 begin perform public.prepare_maintenance(gen_random_uuid()); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Cross household request accepted'; end if;
end $$;
select true as maintenance_regression_passed;
rollback;
