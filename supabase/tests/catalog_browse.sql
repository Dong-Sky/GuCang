-- Test project only, read-only validation under authenticated RLS.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.household_members limit 1),true);
set local role authenticated;
do $$
declare h uuid; first_page jsonb; second_page jsonb; summary jsonb; code text; actual bigint; rejected boolean:=false;
begin
 select household_id into strict h from public.household_members where user_id=auth.uid() limit 1;
 select count(*) into actual from public.item_instances i join public.item_styles s on s.id=i.item_style_id where i.household_id=h and i.deleted_at is null and s.deleted_at is null;
 summary:=public.catalog_summary(h);
 first_page:=public.browse_catalog(h,'','{}',1,2);
 second_page:=public.browse_catalog(h,'','{}',2,2);
 assert (summary->>'total')::bigint=actual,'summary total';
 assert (first_page->>'total')::bigint=actual,'page total';
 assert jsonb_array_length(first_page->'instances')<=2,'page bound';
 if actual>2 then
  assert not exists(select 1 from jsonb_array_elements(first_page->'instances') a join jsonb_array_elements(second_page->'instances') b on a->>'id'=b->>'id'),'page overlap';
 end if;
 select i.inventory_code into code from public.item_instances i join public.item_styles s on s.id=i.item_style_id where i.household_id=h and i.deleted_at is null and s.deleted_at is null and i.inventory_code is not null order by i.inventory_number limit 1;
 if code is not null then assert (public.browse_catalog(h,code,'{}',1,24)->>'total')::bigint=1,'full catalog code search'; end if;
 begin perform public.browse_catalog('00000000-0000-0000-0000-000000000000'); exception when others then rejected:=true; end;
 assert rejected,'cross-household access must be denied';
 rejected:=false;
 begin perform public.browse_catalog(h,'','{}',1,500); exception when others then rejected:=true; end;
 assert rejected,'page bound enforced';
end $$;
rollback;
