do $$
declare
  legacy record;
  source_link public.migration_source_links%rowtype;
  new_id uuid;
  raw jsonb;
  publication_date date;
  publication_link text;
begin
  for legacy in
    select * from public.legacy_records
    where deleted_at is null and converted_target_table is null
      and payload->>'board_name'='[CONTENT] Blog pipeline'
    order by created_at,id
    for update
  loop
    raw:=coalesce(legacy.payload->'raw_fields','{}'::jsonb);
    begin publication_date:=nullif(raw->>'Publicatiedatum','')::date; exception when others then publication_date:=null; end;
    publication_link:=substring(coalesce(raw->>'Link','') from 'https?://[^ ]+');
    select * into source_link from public.migration_source_links where target_table='legacy_records' and target_id=legacy.id order by imported_at desc limit 1;
    if source_link.id is null then raise exception 'missing source link for legacy record %',legacy.id; end if;
    insert into public.content_items(organization_id,title,description,content_type,status,priority,owner_id,primary_channel,channels,deadline,publication_at,publication_url,approval_status,created_by)
    values(legacy.organization_id,trim(legacy.title),nullif(trim(coalesce(raw->>'Notities','')),''),'blog',case when lower(coalesce(legacy.source_status,''))='gepubliceerd' then 'published' when lower(coalesce(legacy.source_status,''))='bezig' then 'production' else 'idea' end,'normal',source_link.imported_by,'Blogger',array['Blogger'],case when lower(coalesce(legacy.source_status,''))<>'gepubliceerd' then publication_date else null end,case when lower(coalesce(legacy.source_status,''))='gepubliceerd' and publication_date is not null then publication_date::timestamp at time zone 'Europe/Brussels' else null end,nullif(publication_link,''),case when lower(coalesce(legacy.source_status,''))='gepubliceerd' then 'approved' else 'not_required' end,source_link.imported_by)
    returning id into new_id;
    insert into public.migration_source_links(organization_id,source_system,source_workspace,source_board_id,source_item_id,target_table,target_id,source_url,source_payload,imported_by)
    values(legacy.organization_id,source_link.source_system,source_link.source_workspace,source_link.source_board_id,source_link.source_item_id,'content_items',new_id,source_link.source_url,source_link.source_payload,source_link.imported_by);
    update public.legacy_records set converted_target_table='content_items',converted_target_id=new_id,converted_at=now(),lifecycle='completed',updated_at=now() where id=legacy.id;
  end loop;
end $$;
