-- Future events only: never infer historical transitions from current state.
-- This dedicated trigger does not change the generic audit function or RLS.
create function private.log_campaign_deliverable_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare before_data jsonb := '{}'::jsonb; after_data jsonb := '{}'::jsonb;
  record_data jsonb; fields text[] := '{}';
begin
  if tg_table_schema<>'public' or tg_table_name<>'campaign_deliverables' then
    raise exception 'campaign_deliverable_audit_wrong_source';
  end if;
  if tg_op in ('UPDATE','DELETE') then before_data := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then after_data := to_jsonb(new); end if;
  if tg_op='UPDATE' then
    select coalesce(array_agg(change.key order by change.key),'{}') into fields
      from jsonb_each(after_data) change
      where change.value is distinct from before_data->change.key and change.key<>'updated_at';
    if cardinality(fields)=0 then return new; end if;
  end if;
  record_data := case when tg_op='DELETE' then before_data else after_data end;
  insert into public.audit_log(organization_id,entity_type,entity_id,action,actor_id,entity_label,
    changed_fields,previous_status,new_status,metadata,created_at)
  values ((record_data->>'organization_id')::uuid,'campaign_deliverables',(record_data->>'id')::uuid,
    case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
    auth.uid(),record_data->>'title',fields,before_data->>'status',after_data->>'status',
    jsonb_build_object('source_table','campaign_deliverables','campaign_id',record_data->>'campaign_id',
      'previous_approval_status',before_data->>'approval_status','new_approval_status',after_data->>'approval_status'),clock_timestamp());
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
-- The definer can append audit rows that authenticated clients cannot write.
-- It is reachable only through the fixed table trigger, not as a client RPC.
revoke all on function private.log_campaign_deliverable_change() from public,anon,authenticated,service_role;
create trigger campaign_deliverable_audit after insert or update or delete on public.campaign_deliverables
  for each row execute function private.log_campaign_deliverable_change();
