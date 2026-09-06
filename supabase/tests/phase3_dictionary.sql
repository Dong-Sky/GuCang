-- Run on gucang-test only. All fixture changes roll back, including counters.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.household_members limit 1),true);
set local role authenticated;
do $$
declare
 h uuid; u uuid:=auth.uid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
 s uuid:=gen_random_uuid(); i uuid:=gen_random_uuid(); code text; p jsonb; rejected boolean:=false;
 ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid();
begin
 select household_id into h from public.household_members where user_id=u limit 1;
 if h is null then raise exception 'Test member required'; end if;
 insert into public.ips(id,household_id,name,created_by) values(a,h,'phase3 source '||a,u),(b,h,'phase3 target '||b,u);
 insert into public.characters(id,household_id,ip_id,name,created_by) values(c,h,a,'角色甲',u),(d,h,a,'角色乙',u);
 insert into public.item_styles(id,household_id,name,ip_id,created_by,updated_by) values(s,h,'phase3 fixture',a,u,u);
 insert into public.item_instances(id,household_id,item_style_id,created_by,updated_by) values(i,h,s,u,u) returning inventory_code into code;
 insert into public.item_style_characters(item_style_id,character_id) values(s,c),(s,d);
 perform public.set_style_characters(s,array[d,c,d]);
 if (select count(*) from public.item_style_characters where item_style_id=s)<>2 then raise exception 'Multiple character save failed'; end if;
 begin perform public.set_style_characters(s,array[gen_random_uuid()]); exception when others then rejected:=true; end;
 if not rejected or (select count(*) from public.item_style_characters where item_style_id=s)<>2 then raise exception 'Invalid character failed to roll back'; end if;
 p:=public.manage_dictionary(h,'characters',c,d);
 if (p->>'instances')::int<>1 then raise exception 'Bad preview count'; end if;
 perform public.manage_dictionary(h,'characters',c,d,p_preview=>false,p_expected=>p->>'token');
 if (select count(*) from public.item_style_characters where item_style_id=s)<>1 then raise exception 'Duplicate character link'; end if;
 p:=public.manage_dictionary(h,'ips',a,b);
 perform public.manage_dictionary(h,'ips',a,b,p_preview=>false,p_expected=>p->>'token');
 if (select ip_id from public.item_styles where id=s)<>b or (select ip_id from public.characters where id=d)<>b then raise exception 'IP references not moved'; end if;
 if (select inventory_code from public.item_instances where id=i)<>code then raise exception 'Code changed'; end if;
 if not (select ('phase3 source '||a)=any(aliases) from public.ips where id=b) then raise exception 'Old name lost'; end if;
 p:=public.manage_dictionary(h,'ips',b,p_name=>'Renamed '||b,p_aliases=>array['alias']);
 begin
   perform public.manage_dictionary(h,'ips',b,p_name=>'Renamed '||b,p_aliases=>array['alias'],p_preview=>false,p_expected=>'stale');
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'Stale preview accepted'; end if;
 perform public.manage_dictionary(h,'ips',b,p_name=>'Renamed '||b,p_aliases=>array['alias'],p_preview=>false,p_expected=>p->>'token');
 rejected:=false;
 begin perform public.manage_dictionary(gen_random_uuid(),'ips',b); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Cross household access accepted'; end if;
 insert into public.categories(id,household_id,name) values(ca,h,'test category a'),(cb,h,'test category b');
 insert into public.series(id,household_id,name,ip_id) values(sa,h,'test series a',b),(sb,h,'test series b',b);
 update public.item_styles set category_id=ca,series_id=sa where id=s;
 p:=public.manage_dictionary(h,'categories',ca,cb);
 perform public.manage_dictionary(h,'categories',ca,cb,p_preview=>false,p_expected=>p->>'token');
 p:=public.manage_dictionary(h,'series',sa,sb);
 perform public.manage_dictionary(h,'series',sa,sb,p_preview=>false,p_expected=>p->>'token');
 if (select category_id from public.item_styles where id=s)<>cb or (select series_id from public.item_styles where id=s)<>sb then raise exception 'Category/series merge failed'; end if;
end $$;
reset role;
select not has_function_privilege('anon','public.manage_dictionary(uuid,text,uuid,uuid,text,text[],boolean,text)','EXECUTE') as anonymous_blocked;
select not has_function_privilege('anon','public.set_style_characters(uuid,uuid[])','EXECUTE') as character_anonymous_blocked;
rollback;
