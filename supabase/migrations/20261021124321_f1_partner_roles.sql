begin;
create table public.partner_roles(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),partner_id uuid not null references public.partners(id) on delete restrict,
 role text not null check(role in('sponsor','esports','community','event','education','social_impact')),valid_from date not null default current_date,valid_until date,
 proof_document_id uuid references public.document_registry(id) on delete restrict,created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),revoked_at timestamptz,
 provenance text not null default 'explicit_review' check(provenance='explicit_review'),check(valid_until is null or valid_until>=valid_from),unique(organization_id,id)
);
create unique index f1_partner_role_current on public.partner_roles(organization_id,partner_id,role) where revoked_at is null;
create index f1_partner_role_partner on public.partner_roles(partner_id);
create index f1_partner_role_proof on public.partner_roles(proof_document_id);
create index f1_partner_role_actor on public.partner_roles(created_by);
alter table public.record_relationships add column contribution_role text check(contribution_role in('sponsor','esports','community','event','education','social_impact'));
alter table public.record_relationships add column role_provenance text not null default 'legacy_classification' check(role_provenance in('legacy_classification','explicit_review'));
create function private.f1_partner_guard() returns trigger language plpgsql security definer set search_path='' as $$declare relevant boolean;chosen text;selected_partner uuid;begin
 -- The contribution setting is untrusted input, never an authorization token.
 -- The invoker editor keeps its original RLS and child-table grants throughout.
 chosen:=nullif(current_setting('besc.f1_partner_contribution',true),'');
 if tg_table_name='campaigns' then
  relevant:=new.partner_id is not null and(tg_op='INSERT' or new.partner_id is distinct from old.partner_id);selected_partner:=new.partner_id;
 else
  relevant:=(new.source_type in('campaign','event') and new.target_type='partner') or(new.target_type in('campaign','event') and new.source_type='partner');
  if tg_op='UPDATE' and row(new.source_type,new.source_id,new.target_type,new.target_id,new.relationship_type,new.contribution_role,new.role_provenance) is not distinct from row(old.source_type,old.source_id,old.target_type,old.target_id,old.relationship_type,old.contribution_role,old.role_provenance) then return new;end if;
  selected_partner:=case when new.source_type='partner' then new.source_id else new.target_id end;
 end if;
 if relevant and not private.f1_writing(new.organization_id) then
  if chosen is null or not private.f1_role(new.organization_id,'partner_editor') or not exists(select 1 from public.partner_roles r join public.partners p on p.id=r.partner_id and p.organization_id=r.organization_id where r.organization_id=new.organization_id and r.partner_id=selected_partner and r.role=chosen and r.revoked_at is null and r.valid_from<=current_date and(r.valid_until is null or r.valid_until>=current_date) and p.deleted_at is null) then raise exception 'f1_choose_partner_contribution' using errcode='42501';end if;
  if tg_table_name='record_relationships' then new.relationship_type:=chosen;new.contribution_role:=chosen;new.role_provenance:='explicit_review';end if;
  perform private.f1_audit(new.organization_id,gen_random_uuid(),'partner.editor_contribution');
 end if;return new;
end$$;
revoke all on function private.f1_partner_guard() from public,anon,authenticated,service_role;
create trigger f1_campaign_partner before insert or update on public.campaigns for each row execute function private.f1_partner_guard();
create trigger f1_relationship_partner before insert or update on public.record_relationships for each row execute function private.f1_partner_guard();
create function private.f1_partner(o uuid,op text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare answer uuid;p uuid;contribution text;source_t text;source_i uuid;v jsonb;begin
 if not private.f1_role(o,'partner_editor') then raise exception 'f1_partner_access_required' using errcode='42501';end if;
 if op='partner.revoke' then update public.partner_roles set revoked_at=clock_timestamp() where organization_id=o and id=(d->>'id')::uuid and revoked_at is null returning id into answer;
 else
  p:=case when op='partner.campaign' then (d->'values'->>'partner_id')::uuid else (d->>'partner_id')::uuid end;
  if not exists(select 1 from public.partners where id=p and organization_id=o and deleted_at is null) then raise exception 'f1_partner_unavailable';end if;
  if op='partner.role' then
   if nullif(d->>'proof_document_id','') is not null and not private.f1_document_visible(o,(d->>'proof_document_id')::uuid) then raise exception 'f1_proof_unavailable';end if;
   insert into public.partner_roles(organization_id,partner_id,role,valid_from,valid_until,proof_document_id,created_by) values(o,p,d->>'role',coalesce(nullif(d->>'valid_from','')::date,current_date),nullif(d->>'valid_until','')::date,nullif(d->>'proof_document_id','')::uuid,auth.uid()) returning id into answer;
  elsif op in('partner.campaign','partner.relate') then
   contribution:=d->>'contribution_role';
   if not exists(select 1 from public.partner_roles where organization_id=o and partner_id=p and role=contribution and revoked_at is null and valid_from<=current_date and(valid_until is null or valid_until>=current_date)) then raise exception 'f1_explicit_partner_role_required';end if;
   if op='partner.campaign' then
    v:=d->'values';answer:=public.create_campaign_bundle(o,v,array(select jsonb_array_elements_text(coalesce(d->'deliverables','[]'::jsonb))));
    update public.record_relationships set relationship_type=contribution,contribution_role=contribution,role_provenance='explicit_review' where organization_id=o and source_type='campaign' and source_id=answer and target_type='partner' and target_id=p;
   else
    source_t:=d->>'source_type';source_i:=(d->>'source_id')::uuid;
    if source_t not in('campaign','event') then raise exception 'f1_invalid_source';end if;
    perform private.lock_active_relationship_dossier(o,source_t,source_i);
    insert into public.record_relationships(organization_id,source_type,source_id,target_type,target_id,relationship_type,contribution_role,role_provenance,created_by) values(o,source_t,source_i,'partner',p,contribution,contribution,'explicit_review',auth.uid()) returning id into answer;
   end if;
  else raise exception 'f1_unknown_operation';end if;
 end if;
 if answer is null then raise exception 'f1_not_available';end if;return jsonb_build_object('id',answer);
end$$;
revoke all on function private.f1_partner(uuid,text,jsonb) from public,anon,authenticated,service_role;
alter table public.partner_roles enable row level security;
revoke all on public.partner_roles from public,anon,authenticated,service_role;
grant select on public.partner_roles to authenticated;
create policy f1_partner_roles_read on public.partner_roles for select to authenticated using(private.is_active_member(organization_id) and (proof_document_id is null or private.f1_document_visible(organization_id,proof_document_id)));
commit;
