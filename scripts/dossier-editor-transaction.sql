-- User approved the fixed 22-model transaction on 2026-10-08.
-- No new table grants, policies, service-role writes or generic callable writer.
begin;
create function public.save_dossier_bundle(p_organization_id uuid,p_bundle jsonb)
returns uuid language plpgsql security invoker set search_path='' as $function$
declare
 catalog constant jsonb := '__FIXED_CATALOG__'::jsonb;
 cfg jsonb; def jsonb; change jsonb; current_row jsonb; data jsonb; patch jsonb;
 root_id uuid; row_key text; field text; ref jsonb; available boolean; allowed boolean;
 tbl text; predicate text; columns_sql text; values_sql text; assignments_sql text;
 endpoint_type text; endpoint_id uuid; endpoint_table text;
 m public.organization_members%rowtype; caps text[]; seen text[]:='{}'; count_rows bigint;
 is_root boolean; is_new boolean; deleting boolean; changes jsonb; parent_value text;
begin
 if auth.uid() is null then raise exception 'dossier_no_access' using errcode='42501'; end if;
 select * into m from public.organization_members where organization_id=p_organization_id and user_id=auth.uid() and status='active';
 if not found then raise exception 'dossier_no_access' using errcode='42501'; end if;
 select r.capabilities into caps from public.organization_access_roles r where r.id=m.access_role_id and r.organization_id=p_organization_id and r.deleted_at is null;
 cfg:=catalog->(p_bundle->>'kind');
 if cfg is null or jsonb_typeof(p_bundle->'root') is distinct from 'object' or jsonb_typeof(p_bundle->'parts') is distinct from 'array' or jsonb_array_length(p_bundle->'parts')>250 then
   raise exception 'dossier_invalid_bundle' using errcode='23514';
 end if;
 root_id:=(p_bundle->'root'->>'id')::uuid;
 if root_id is null or coalesce((p_bundle->'root'->>'delete')::boolean,false) then raise exception 'dossier_invalid_root' using errcode='23514'; end if;
 -- Lock the main dossier even for a children-only save. Its deletion and another
 -- editor save cannot interleave with this transaction.
 if not (p_bundle->'root'->>'new')::boolean then
   execute format('select to_jsonb(t) from public.%I t where id=$1 and organization_id=$2 %s for update',cfg->>'table',case when (cfg->>'soft')::boolean then 'and deleted_at is null' else '' end) into current_row using root_id,p_organization_id;
   if current_row is null then raise exception 'dossier_unavailable' using errcode='42501'; end if;
   if current_row is distinct from p_bundle->'root'->'base' then raise exception 'dossier_conflict' using errcode='40001'; end if;
 end if;
 -- Inserts/updates before deletes, in fixed dependency order. A referenced budget
 -- or registration settings row therefore exists before its new children.
 changes:=jsonb_build_array((p_bundle->'root')||jsonb_build_object('_root',true));
 for def in select value from jsonb_array_elements(cfg->'collections') loop
   changes:=changes||coalesce((select jsonb_agg(value) from jsonb_array_elements(p_bundle->'parts') where value->>'collection'=def->>'table' and not coalesce((value->>'delete')::boolean,false)),'[]'::jsonb);
 end loop;
 for def in select value from jsonb_array_elements(cfg->'collections') with ordinality d(value,n) order by n desc loop
   changes:=changes||coalesce((select jsonb_agg(value) from jsonb_array_elements(p_bundle->'parts') where value->>'collection'=def->>'table' and coalesce((value->>'delete')::boolean,false)),'[]'::jsonb);
 end loop;
 if jsonb_array_length(changes)<>jsonb_array_length(p_bundle->'parts')+1 then raise exception 'dossier_unknown_part' using errcode='23514'; end if;
 for change in select value from jsonb_array_elements(changes) loop
   is_root:=coalesce((change->>'_root')::boolean,false);
   if is_root then def:=cfg; else select value into def from jsonb_array_elements(cfg->'collections') where value->>'table'=change->>'collection'; end if;
   tbl:=def->>'table'; is_new:=(change->>'new')::boolean; deleting:=coalesce((change->>'delete')::boolean,false); row_key:=change->>'id'; patch:=change->'values';
   if is_new is null or row_key is null or jsonb_typeof(patch) is distinct from 'object' then raise exception 'dossier_invalid_change' using errcode='23514'; end if;
   if tbl||':'||row_key=any(seen) then raise exception 'dossier_duplicate_change' using errcode='23514'; end if;
   seen:=array_append(seen,tbl||':'||row_key);
   allowed:=case def->>'capability'
     when 'active' then true when 'submitExpenses' then is_new or private.can_manage_finance(p_organization_id)
     when 'manageFinance' then private.can_manage_finance(p_organization_id)
     when 'manageEvents' then private.can_manage_events(p_organization_id)
     when 'manageContent' then private.can_manage_content(p_organization_id)
     when 'manageProjects' then private.can_manage_projects(p_organization_id)
     else m.role in ('admin','board') or def->>'capability'=any(coalesce(caps,'{}')) end;
   if not coalesce(allowed,false) then raise exception 'dossier_no_access' using errcode='42501'; end if;
   if exists(select 1 from jsonb_object_keys(patch) k where not (def->'fields' ? k)) then raise exception 'dossier_unknown_field' using errcode='23514'; end if;
   predicate:=format('target.%I::text=$1',def->>'key');
   if (def->>'org')::boolean then predicate:=predicate||' and target.organization_id=$2'; end if;
   if not is_root then
     if tbl='record_relationships' then
       predicate:=predicate||format(' and ((target.source_id::text=$3 and target.source_type=%L) or (target.target_id::text=$3 and target.target_type=%L))',def->>'entityValue',def->>'entityValue');
     elsif coalesce((def->>'through')::boolean,false) then
       predicate:=predicate||format(' and exists(select 1 from public.record_relationships rel where rel.organization_id=$2 and ((rel.source_type=%L and rel.source_id::text=$3 and rel.target_type=''task'' and rel.target_id=target.id) or (rel.target_type=%L and rel.target_id::text=$3 and rel.source_type=''task'' and rel.source_id=target.id)))',def->>'entityValue',def->>'entityValue');
     else predicate:=predicate||format(' and target.%I::text=$3',def->>'parentField'); end if;
     if def->>'entityField' is not null and tbl<>'record_relationships' then predicate:=predicate||format(' and target.%I::text=%L',def->>'entityField',def->>'entityValue'); end if;
   end if;
   if (def->>'soft')::boolean then predicate:=predicate||' and target.deleted_at is null'; end if;
   current_row:=null;
   if not is_new then
     execute format('select to_jsonb(target) from public.%I target where %s for update',tbl,predicate) into current_row using row_key,p_organization_id,root_id::text;
     if current_row is null then raise exception 'dossier_unavailable' using errcode='42501'; end if;
     if current_row is distinct from change->'base' then raise exception 'dossier_conflict' using errcode='40001'; end if;
   end if;
   if deleting then
     if is_new or is_root or coalesce((def->>'singleton')::boolean,false) then raise exception 'dossier_invalid_delete' using errcode='23514'; end if;
     if (def->>'soft')::boolean then execute format('update public.%I target set deleted_at=now() where %s',tbl,predicate) using row_key,p_organization_id,root_id::text;
     else execute format('delete from public.%I target where %s',tbl,predicate) using row_key,p_organization_id,root_id::text; end if;
     get diagnostics count_rows=row_count;
     if count_rows<>1 then raise exception 'dossier_unavailable' using errcode='42501'; end if;
     continue;
   end if;
   data:=coalesce(current_row,'{}'::jsonb)||patch;
   if is_new then
     data:=data||jsonb_build_object(def->>'key',row_key);
     if (def->>'org')::boolean then data:=data||jsonb_build_object('organization_id',p_organization_id); end if;
     for field in select jsonb_array_elements_text(def->'actors') loop data:=data||jsonb_build_object(field,auth.uid()); end loop;
   elsif patch ? (def->>'key') and patch->>(def->>'key') is distinct from row_key then raise exception 'dossier_identity_changed' using errcode='23514';
   end if;
   if not is_root then
     parent_value:=root_id::text;
     if tbl='record_relationships' and not is_new and current_row->>'target_id'=parent_value and current_row->>'target_type'=def->>'entityValue' then
       if patch ?| array['target_id','target_type'] then raise exception 'dossier_identity_changed' using errcode='23514'; end if;
     else
       if tbl='record_relationships' and patch ?| array['source_id','source_type'] and (data->>'source_id' is distinct from parent_value or data->>'source_type' is distinct from def->>'entityValue') then raise exception 'dossier_identity_changed' using errcode='23514'; end if;
       if not coalesce((def->>'through')::boolean,false) then data:=data||jsonb_build_object(def->>'parentField',parent_value); end if;
       if def->>'entityField' is not null then data:=data||jsonb_build_object(def->>'entityField',def->>'entityValue'); end if;
     end if;
   end if;
   -- Formal approvals/publications/payments use the dedicated existing actions.
   if patch ? 'approval_status' then raise exception 'dossier_separate_approval' using errcode='23514'; end if;
   if tbl='budget_envelopes' and patch->>'status'='approved' then raise exception 'dossier_separate_approval' using errcode='23514'; end if;
   if tbl='expenses' and (patch ?| array['paid_at','payment_reference'] or patch->>'status' in ('paid','approved','reimbursed')) then raise exception 'dossier_separate_payment' using errcode='23514'; end if;
   if tbl='expenses' and not private.can_manage_finance(p_organization_id) and coalesce(data->>'status','planned') not in ('planned','requested','reimbursement_due') then raise exception 'dossier_no_access' using errcode='42501'; end if;
   if tbl='newsletters' and not is_new and current_row->>'status' not in ('draft','changes_requested','rejected','failed') then raise exception 'dossier_locked_newsletter' using errcode='23514'; end if;
   if tbl='google_resource_links' and data->>'resource_type' not in ('document','folder') then raise exception 'dossier_separate_integration_action' using errcode='23514'; end if;
   if tbl='google_resource_links' and (is_new or patch ?| array['google_id','web_url','resource_type']) then
     -- A manually changed registration no longer claims verified Drive metadata.
     patch:=patch||jsonb_build_object('source_version',null,'source_modified_at',null,'source_checked_at',null);
     data:=data||patch;
   end if;
   if tbl='record_relationships' and (is_new or patch ?| array['source_id','source_type','target_id','target_type']) then
     if data->>'source_id'=root_id::text and data->>'source_type'=def->>'entityValue' then endpoint_type:=data->>'target_type';endpoint_id:=(data->>'target_id')::uuid;
     else endpoint_type:=data->>'source_type';endpoint_id:=(data->>'source_id')::uuid; end if;
     endpoint_table:=case endpoint_type when 'project' then 'projects' when 'event' then 'events' when 'campaign' then 'campaigns' when 'content' then 'content_items' when 'partner' then 'partners' when 'community_person' then 'community_people' when 'task' then 'tasks' else null end;
     if endpoint_table is null or endpoint_id is null then raise exception 'dossier_invalid_relation' using errcode='23514'; end if;
     execute format('select exists(select 1 from public.%I where id=$1 and organization_id=$2 and deleted_at is null)',endpoint_table) into available using endpoint_id,p_organization_id;
     if not available then raise exception 'dossier_reference_unavailable' using errcode='42501'; end if;
   end if;
   if tbl='newsletters' and patch<>'{}'::jsonb then
     -- Local edits must not approve an older Gmail concept or show stale HTML.
     patch:=patch||jsonb_build_object('body_html',null,'last_error','Werk het Gmail-concept bij voordat je goedkeuring vraagt.');
     data:=data||patch;
   end if;
   if tbl='events' then
     if patch ? 'start_at' and data->>'start_at' is not null then patch:=patch||jsonb_build_object('start_date',((data->>'start_at')::timestamptz at time zone 'Europe/Brussels')::date); end if;
     if patch ? 'end_at' and data->>'end_at' is not null then patch:=patch||jsonb_build_object('end_date',((data->>'end_at')::timestamptz at time zone 'Europe/Brussels')::date); end if;
     data:=data||patch;
   end if;
   if tbl='tasks' and patch ? 'status' then patch:=patch||jsonb_build_object('completed_at',case when data->>'status'='done' then now() else null end); data:=data||patch; end if;
   if tbl='projects' and data->>'status'='done' and (is_new or current_row->>'status' is distinct from 'done') and exists(select 1 from unnest(array['goal','deliverables','acceptance_criteria','closure_evaluation']) f where nullif(btrim(data->>f),'') is null) then raise exception 'dossier_project_outcomes_required' using errcode='23514'; end if;
   if tbl='knowledge_articles' and patch->>'status'='published' and data->>'published_at' is null then patch:=patch||jsonb_build_object('published_at',now()); data:=data||patch; end if;
   for ref in select value from jsonb_array_elements(def->'references') loop
     if not is_new and not patch ? (ref->>'field') then continue; end if;
     if data->>(ref->>'field') is null then continue; end if;
     if ref->>'table'='profiles' then
       select exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=(data->>(ref->>'field'))::uuid and status='active') into available;
     elsif (ref->>'org')::boolean then
       execute format('select exists(select 1 from public.%I where id=$1 and organization_id=$2 %s)',ref->>'table',case when (ref->>'soft')::boolean then 'and deleted_at is null' else '' end) into available using (data->>(ref->>'field'))::uuid,p_organization_id;
     else available:=true; end if;
     if not available then raise exception 'dossier_reference_unavailable' using errcode='42501'; end if;
   end loop;
   if tbl='knowledge_articles' and not is_new and patch<>'{}'::jsonb then
     insert into public.knowledge_revisions(article_id,title,summary,body,status,changed_by,change_note) values(root_id,current_row->>'title',current_row->>'summary',current_row->>'body',current_row->>'status',auth.uid(),'Gezamenlijke dossieropslag');
   end if;
   if not is_new and patch='{}'::jsonb then continue; end if;
   if (def->>'updated')::boolean then data:=data||jsonb_build_object('updated_at',clock_timestamp()); end if;
   if def->'actors' ? 'updated_by' then data:=data||jsonb_build_object('updated_by',auth.uid()); end if;
   if is_new then
     select string_agg(format('%I',k),','),string_agg(format('r.%I',k),',') into columns_sql,values_sql from jsonb_object_keys(data) k;
     execute format('insert into public.%I as target (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(target)',tbl,columns_sql,values_sql,tbl) into current_row using data;
     if current_row is null then raise exception 'dossier_unavailable' using errcode='42501'; end if;
     if coalesce((def->>'through')::boolean,false) then
       insert into public.record_relationships(organization_id,source_type,source_id,target_type,target_id,relationship_type,created_by) values(p_organization_id,def->>'entityValue',root_id,'task',row_key::uuid,'related',auth.uid());
     end if;
     if tbl='campaigns' then
       for ref in select * from jsonb_array_elements(jsonb_build_array(jsonb_build_object('field','project_id','type','project','relation','part_of'),jsonb_build_object('field','event_id','type','event','relation','supports'),jsonb_build_object('field','partner_id','type','partner','relation','sponsor'))) loop
         if data->>(ref->>'field') is not null then insert into public.record_relationships(organization_id,source_type,source_id,target_type,target_id,relationship_type,created_by) values(p_organization_id,'campaign',row_key::uuid,ref->>'type',(data->>(ref->>'field'))::uuid,ref->>'relation',auth.uid()); end if;
       end loop;
     end if;
   else
     select string_agg(format('%I=r.%I',k,k),',') into assignments_sql from jsonb_object_keys(patch||case when (def->>'updated')::boolean then jsonb_build_object('updated_at',true) else '{}'::jsonb end||case when def->'actors' ? 'updated_by' then jsonb_build_object('updated_by',true) else '{}'::jsonb end) k;
     execute format('update public.%I target set %s from jsonb_populate_record(null::public.%I,$4) r where %s',tbl,assignments_sql,tbl,predicate) using row_key,p_organization_id,root_id::text,data;
     get diagnostics count_rows=row_count;
     if count_rows<>1 then raise exception 'dossier_unavailable' using errcode='42501'; end if;
   end if;
 end loop;
 return root_id;
end;
$function$;
revoke all on function public.save_dossier_bundle(uuid,jsonb) from public,anon;
grant execute on function public.save_dossier_bundle(uuid,jsonb) to authenticated;
commit;
