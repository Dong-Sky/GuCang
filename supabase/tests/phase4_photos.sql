begin;
set local statement_timeout='20s';
select set_config('request.jwt.claim.sub',(select user_id::text from public.household_members limit 1),true);
select set_config('test.household',(select household_id::text from public.household_members where user_id=auth.uid() limit 1),true);
select set_config('test.style',gen_random_uuid()::text,true);
insert into public.item_styles(id,household_id,name,created_by,updated_by) values(current_setting('test.style')::uuid,current_setting('test.household')::uuid,'phase4 rollback fixture',auth.uid(),auth.uid());
insert into public.item_instances(household_id,item_style_id,created_by,updated_by) values(current_setting('test.household')::uuid,current_setting('test.style')::uuid,auth.uid(),auth.uid());
insert into public.item_images(id,household_id,item_style_id,detail_path,thumbnail_path,sort_order,created_by)
select ('f4000000-0000-4000-8000-00000000000'||n)::uuid,current_setting('test.household')::uuid,current_setting('test.style')::uuid,'fixture-detail-'||n,'fixture-thumb-'||n,n-1,auth.uid() from generate_series(1,3) n;
set local role authenticated;
do $$
declare
 h uuid:=current_setting('test.household')::uuid;
 s uuid:=current_setting('test.style')::uuid;
 a uuid:='f4000000-0000-4000-8000-000000000001';
 b uuid:='f4000000-0000-4000-8000-000000000002';
 c uuid:='f4000000-0000-4000-8000-000000000003';
 ids uuid[];
begin
 perform public.save_photo_album(h,s,array[a,b,c],jsonb_build_array(jsonb_build_object('id',c),jsonb_build_object('id',b),jsonb_build_object('id',a)),1);
 select array_agg(id order by sort_order) into ids from public.item_images where item_style_id=s and deleted_at is null;
 assert ids=array[c,b,a],'sort failed';
 -- Same payload after a lost response is harmless, despite old expected order.
 perform public.save_photo_album(h,s,array[a,b,c],jsonb_build_array(jsonb_build_object('id',c),jsonb_build_object('id',b),jsonb_build_object('id',a)),1);
 perform public.save_photo_album(h,s,array[c,b,a],jsonb_build_array(jsonb_build_object('id',c),jsonb_build_object('id',a)),1);
 assert (select deleted_at is not null from public.item_images where id=b),'remove failed';
 assert (select detail_path='fixture-detail-2' from public.item_images where id=b),'old file altered';
 perform public.save_photo_album(h,s,array[c,a],jsonb_build_array(jsonb_build_object('id',c),jsonb_build_object('id',a),jsonb_build_object('id',b)),1);
 assert (select deleted_at is null from public.item_images where id=b),'restore failed';
 begin
   perform public.save_photo_album(h,s,array[a,b,c],'[]',1);
   raise exception 'TEST stale accepted';
 exception when others then if sqlerrm not like '%照片已变化%' then raise; end if; end;
 begin
   perform public.save_photo_album(h,s,array[c,a,b],jsonb_build_array(jsonb_build_object('id',c),jsonb_build_object('id',c)),1);
   raise exception 'TEST duplicate accepted';
 exception when others then if sqlerrm not like '%不能重复%' then raise; end if; end;
 begin
   perform public.save_photo_album(h,s,array[c,a,b],'[]',2);
   raise exception 'TEST shared count accepted';
 exception when others then if sqlerrm not like '%持有数量%' then raise; end if; end;
 begin
   perform public.save_photo_album(h,s,array[c,a,b],jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'detail_path','wrong','thumbnail_path','wrong')),1);
   raise exception 'TEST invalid upload accepted';
 exception when others then if sqlerrm not like '%路径无效%' then raise; end if; end;
 assert (select count(*)=3 from public.item_images where item_style_id=s and deleted_at is null),'failed transaction changed old album';
 -- A valid path without both uploaded variants must not remove old photos.
 begin
   perform public.save_photo_album(h,s,array[c,a,b],jsonb_build_array(jsonb_build_object(
     'id','f4000000-0000-4000-8000-000000000004',
     'detail_path','households/'||h||'/items/'||s||'/f4000000-0000-4000-8000-000000000004-detail.webp',
     'thumbnail_path','households/'||h||'/items/'||s||'/f4000000-0000-4000-8000-000000000004-thumb.webp',
     'width',100,'height',120,'file_size_bytes',10,'thumbnail_size_bytes',5)),1);
   raise exception 'TEST missing upload accepted';
 exception when others then if sqlerrm not like '%尚未上传完整%' then raise; end if; end;
 assert (select count(*)=3 from public.item_images where item_style_id=s and deleted_at is null),'missing file altered album';
 perform public.save_photo_album(h,s,array[c,a,b],'[]',1);
 update public.item_images set deleted_at=now()-interval '8 days' where id=b;
 begin
   perform public.save_photo_album(h,s,'{}',jsonb_build_array(jsonb_build_object('id',b)),1);
   raise exception 'TEST expired accepted';
 exception when others then if sqlerrm not like '%超过7天%' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin
   perform public.save_photo_album(h,s,'{}','[]',1);
   raise exception 'TEST outsider accepted';
 exception when others then if sqlerrm not like '%无权%' then raise; end if; end;
end $$;
reset role;
select not has_function_privilege('anon','public.save_photo_album(uuid,uuid,uuid[],jsonb,integer)','execute') as anon_blocked,
       not prosecdef as invoker
from pg_proc where oid='public.save_photo_album(uuid,uuid,uuid[],jsonb,integer)'::regprocedure;
rollback;
