begin;
create function public.duplicate_assets(p_organization_id uuid,p_ids uuid[]) returns uuid[]
language plpgsql security invoker set search_path='' as $$
declare item public.assets; copy_id uuid; copies uuid[]:='{}'; matched integer;
begin
 if auth.uid() is null or not private.is_org_manager(p_organization_id) then raise exception 'asset_no_access' using errcode='42501';end if;
 if coalesce(cardinality(p_ids),0) not between 1 and 100 or (select count(distinct id) from unnest(p_ids) id)<>cardinality(p_ids) then raise exception 'asset_selection_unavailable' using errcode='23514';end if;
 perform 1 from public.assets where organization_id=p_organization_id and id=any(p_ids) and deleted_at is null order by id for update;
 select count(*) into matched from public.assets where organization_id=p_organization_id and id=any(p_ids) and deleted_at is null;
 if matched<>cardinality(p_ids) then raise exception 'asset_selection_unavailable' using errcode='42501';end if;
 for item in select * from public.assets where organization_id=p_organization_id and id=any(p_ids) and deleted_at is null order by id loop
  insert into public.assets(organization_id,name,asset_type,status,acquisition_type,owner_person_id,location,acquired_date,purchase_value,current_value,supplier_id,notes,created_by)
  values(p_organization_id,left(item.name,171)||' (kopie)',item.asset_type,'planned',item.acquisition_type,item.owner_person_id,item.location,item.acquired_date,item.purchase_value,item.current_value,item.supplier_id,item.notes,auth.uid())
  returning id into copy_id;
  insert into public.asset_document_links(organization_id,asset_id,document_id,label,url,link_type,position,created_by)
   select p_organization_id,copy_id,document_id,label,url,link_type,position,auth.uid() from public.asset_document_links where organization_id=p_organization_id and asset_id=item.id;
  copies:=array_append(copies,copy_id);
 end loop;
 return copies;
end $$;
revoke all on function public.duplicate_assets(uuid,uuid[]) from public,anon;
grant execute on function public.duplicate_assets(uuid,uuid[]) to authenticated;
commit;
