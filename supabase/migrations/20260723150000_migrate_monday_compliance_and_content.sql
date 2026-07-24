do $$
declare
  legacy record;
  source_link public.migration_source_links%rowtype;
  raw jsonb;
  new_id uuid;
  due_moment timestamptz;
  publication_moment timestamptz;
  description_text text;
  mapped_content_type text;
  mapped_content_status text;
  mapped_channel text;
begin
  for legacy in
    select * from public.legacy_records
    where deleted_at is null
      and converted_target_table is null
      and payload->>'board_name' = '[FIN] Legal & compliance'
    order by created_at, id
    for update
  loop
    raw := coalesce(legacy.payload->'raw_fields', '{}'::jsonb);
    begin
      due_moment := nullif(raw->>'Deadline', '')::date::timestamp at time zone 'Europe/Brussels';
    exception when others then
      due_moment := null;
    end;
    description_text := nullif(concat_ws(E'\n\n',
      nullif(raw->>'Opmerking', ''),
      nullif(concat_ws(E'\n',
        case when coalesce(raw->>'Type verplichting', '') <> '' then 'Type verplichting: ' || (raw->>'Type verplichting') end,
        case when coalesce(raw->>'Frequentie', '') <> '' then 'Frequentie: ' || (raw->>'Frequentie') end,
        case when coalesce(raw->>'Instantie / organisatie', '') <> '' then 'Instantie / organisatie: ' || (raw->>'Instantie / organisatie') end,
        case when coalesce(raw->>'Herinnering sturen op', '') <> '' then 'Oorspronkelijke herinneringsdatum: ' || (raw->>'Herinnering sturen op') end,
        case when coalesce(raw->>'Owner', '') <> '' then 'Oorspronkelijke eigenaar: ' || (raw->>'Owner') end,
        case when coalesce(raw->>'Documentlink', '') <> '' then 'Document: ' || (raw->>'Documentlink') end,
        case when coalesce(raw->>'Google Calendar event', '') <> '' then 'Google Calendar: ' || (raw->>'Google Calendar event') end
      ), '')
    ), '');

    select * into source_link from public.migration_source_links
    where target_table = 'legacy_records' and target_id = legacy.id
    order by imported_at desc limit 1;
    if source_link.id is null then raise exception 'missing source link %', legacy.id; end if;

    insert into public.tasks(organization_id, title, description, status, priority, due_at, created_by)
    values(legacy.organization_id, trim(legacy.title), description_text, 'todo', 'normal', due_moment, source_link.imported_by)
    returning id into new_id;

    insert into public.migration_source_links(organization_id, source_system, source_workspace, source_board_id, source_item_id, target_table, target_id, source_url, source_payload, imported_by)
    values(legacy.organization_id, source_link.source_system, source_link.source_workspace, source_link.source_board_id, source_link.source_item_id, 'tasks', new_id, source_link.source_url, source_link.source_payload, source_link.imported_by);
    update public.legacy_records set converted_target_table='tasks', converted_target_id=new_id, converted_at=now(), lifecycle='completed', updated_at=now() where id=legacy.id;
  end loop;

  for legacy in
    select * from public.legacy_records
    where deleted_at is null
      and converted_target_table is null
      and payload->>'board_name' in ('[COMMS] Newsletter planning', '[CONTENT] Content master', '[EVENT] Event deliverables')
    order by created_at, id
    for update
  loop
    raw := coalesce(legacy.payload->'raw_fields', '{}'::jsonb);
    begin
      publication_moment := nullif(coalesce(nullif(raw->>'Verzenddatum',''), nullif(raw->>'Publicatiedatum',''), nullif(raw->>'Deadline','')), '')::date::timestamp at time zone 'Europe/Brussels';
    exception when others then
      publication_moment := null;
    end;
    mapped_content_type := case
      when legacy.payload->>'board_name' = '[COMMS] Newsletter planning' then 'newsletter'
      when legacy.payload->>'board_name' = '[EVENT] Event deliverables' then 'social_post'
      when lower(coalesce(raw->>'Contenttype','')) = 'interview' then 'youtube_video'
      else 'community_post'
    end;
    mapped_content_status := case
      when lower(coalesce(legacy.source_status,'')) = 'vastgelopen' then 'draft'
      when lower(coalesce(legacy.source_status,'')) in ('klaar','ingeleverd','gecontroleerd') then 'approved'
      else 'idea'
    end;
    mapped_channel := case
      when legacy.payload->>'board_name' = '[COMMS] Newsletter planning' then 'Nieuwsbrief'
      when lower(legacy.title) like '%discord%' then 'Discord'
      when lower(legacy.title) like '%instagram%' then 'Instagram'
      else null
    end;
    description_text := nullif(concat_ws(E'\n\n',
      nullif(coalesce(raw->>'Notities', raw->>'Beschrijving & notities'), ''),
      nullif(concat_ws(E'\n',
        case when coalesce(raw->>'Tags','') <> '' then 'Tags: ' || (raw->>'Tags') end,
        case when coalesce(raw->>'Verzendgroep','') <> '' then 'Verzendgroep: ' || (raw->>'Verzendgroep') end,
        case when coalesce(raw->>'Verantw.','') <> '' then 'Oorspronkelijke verantwoordelijke: ' || (raw->>'Verantw.') end,
        case when coalesce(raw->>'CTA','') <> '' then 'CTA: ' || (raw->>'CTA') end,
        case when coalesce(raw->>'Productiefase','') <> '' then 'Productiefase: ' || (raw->>'Productiefase') end,
        case when coalesce(raw->>'Type content','') <> '' then 'Type content: ' || (raw->>'Type content') end
      ), '')
    ), '');

    select * into source_link from public.migration_source_links
    where target_table = 'legacy_records' and target_id = legacy.id
    order by imported_at desc limit 1;
    if source_link.id is null then raise exception 'missing source link %', legacy.id; end if;

    insert into public.content_items(organization_id, title, description, content_type, status, priority, owner_id, primary_channel, channels, deadline, publication_at, publication_url, created_by)
    values(
      legacy.organization_id, trim(legacy.title), description_text, mapped_content_type, mapped_content_status, 'normal', source_link.imported_by,
      mapped_channel, case when mapped_channel is null then '{}'::text[] else array[mapped_channel] end,
      case when legacy.payload->>'board_name' = '[EVENT] Event deliverables' then publication_moment::date else null end,
      case when legacy.payload->>'board_name' <> '[EVENT] Event deliverables' then publication_moment else null end,
      nullif(coalesce(raw->>'Link webpage', raw->>'Link'), ''), source_link.imported_by
    ) returning id into new_id;

    insert into public.migration_source_links(organization_id, source_system, source_workspace, source_board_id, source_item_id, target_table, target_id, source_url, source_payload, imported_by)
    values(legacy.organization_id, source_link.source_system, source_link.source_workspace, source_link.source_board_id, source_link.source_item_id, 'content_items', new_id, source_link.source_url, source_link.source_payload, source_link.imported_by);
    update public.legacy_records set converted_target_table='content_items', converted_target_id=new_id, converted_at=now(), lifecycle='completed', updated_at=now() where id=legacy.id;
  end loop;

  update public.legacy_records
  set lifecycle='archived', updated_at=now()
  where deleted_at is null and converted_target_table is null
    and (payload->>'board_name' in ('Februari 2025','Maart 2025','April 2025','Mei 2025')
      or payload->>'board_name' = 'Subitems van [CONTENT] Content master');
end $$;
