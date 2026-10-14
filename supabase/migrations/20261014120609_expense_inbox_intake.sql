begin;
create table public.expense_intakes(
 id uuid primary key,organization_id uuid not null references public.organizations(id),created_by uuid not null references public.profiles(id),
 payload jsonb not null,submitted_at timestamptz,expense_id uuid references public.expenses(id) deferrable initially deferred,created_at timestamptz not null default now(),unique(organization_id,id),unique(expense_id));
alter table public.expense_intakes enable row level security;
revoke all on public.expense_intakes from public,anon,authenticated;
grant select on public.expense_intakes to authenticated;
create index expense_intakes_org_submitted_idx on public.expense_intakes(organization_id,submitted_at) where submitted_at is not null;
create function private.can_review_expense_intake(o uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.organization_members m left join public.organization_access_roles r on r.id=m.access_role_id and r.organization_id=m.organization_id and r.deleted_at is null where m.organization_id=o and m.user_id=auth.uid() and m.status='active' and (m.role in('admin','board') or 'manageInbox'=any(coalesce(r.capabilities,'{}'))));$$;
create function private.can_read_expense_intake(i uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.expense_intakes e where e.id=i and private.is_active_member(e.organization_id) and (e.created_by=auth.uid() or (e.submitted_at is not null and (private.can_review_expense_intake(e.organization_id) or (e.expense_id is not null and exists(select 1 from public.organization_members m left join public.organization_access_roles r on r.id=m.access_role_id and r.organization_id=m.organization_id and r.deleted_at is null where m.organization_id=e.organization_id and m.user_id=auth.uid() and m.status='active' and (m.role in('admin','board') or m.finance_role<>'none' or 'viewFinance'=any(coalesce(r.capabilities,'{}')))))))));$$;
revoke all on function private.can_review_expense_intake(uuid),private.can_read_expense_intake(uuid) from public,anon;
grant execute on function private.can_review_expense_intake(uuid),private.can_read_expense_intake(uuid) to authenticated;
create policy "expense intake readers" on public.expense_intakes for select to authenticated using(private.can_read_expense_intake(id));
create policy "expense intake inbox reviewers" on public.inbox_items for select to authenticated using(source='expense_submission' and private.can_review_expense_intake(organization_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('expense-proofs','expense-proofs',false,5242880,array['application/pdf','image/jpeg','image/png','image/webp']);
create function private.can_upload_expense_proof(p_name text) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null then return false;end if;
 perform 1 from public.expense_intakes e where e.created_by=auth.uid() and private.is_active_member(e.organization_id) and e.submitted_at is null and e.payload->'proof'->>'path'=p_name for update;
 return found;
end$$;
create function private.can_read_expense_proof(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.expense_intakes e where e.payload->'proof'->>'path'=p_name and private.can_read_expense_intake(e.id));$$;
revoke all on function private.can_upload_expense_proof(text),private.can_read_expense_proof(text) from public,anon;
grant execute on function private.can_upload_expense_proof(text),private.can_read_expense_proof(text) to authenticated;
create policy "submitter uploads proof" on storage.objects for insert to authenticated with check(bucket_id='expense-proofs' and private.can_upload_expense_proof(name));
create policy "expense proof readers" on storage.objects for select to authenticated using(bucket_id='expense-proofs' and private.can_read_expense_proof(name));
create policy "submitter removes draft proof" on storage.objects for delete to authenticated using(bucket_id='expense-proofs' and private.can_upload_expense_proof(name));
-- No UPDATE/upsert policy: a submitted proof cannot be replaced or deleted by its author.

create function private.prepare_expense_intake(p_org uuid,p_id uuid,p_values jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare current public.expense_intakes; proof jsonb; ext text; event uuid;
begin
 if auth.uid() is null or not private.is_active_member(p_org) then raise exception 'expense_intake_no_access' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(p_values)<>'object' or p_values is null or exists(select 1 from jsonb_object_keys(p_values) k where k not in('title','amount','expense_date','supplier','invoice_number','claimant_name','notes','event_id','proof')) then raise exception 'expense_intake_fields' using errcode='23514';end if;
 if char_length(btrim(coalesce(p_values->>'title','')) ) not between 2 and 180 or jsonb_typeof(p_values->'amount') is distinct from 'number' or (p_values->>'amount')::numeric<=0 or (p_values->>'amount')::numeric>9999999999.99 or round((p_values->>'amount')::numeric,2)<>(p_values->>'amount')::numeric or coalesce(p_values->>'expense_date','')='' then raise exception 'expense_intake_fields' using errcode='23514';end if;
 if exists(select 1 from unnest(array['title','expense_date','supplier','invoice_number','claimant_name','notes','event_id']) k where jsonb_typeof(p_values->k) is distinct from 'string') then raise exception 'expense_intake_fields' using errcode='23514';end if;
 perform (p_values->>'expense_date')::date;
 if char_length(coalesce(p_values->>'notes',''))>5000 or char_length(coalesce(p_values->>'supplier',''))>180 or char_length(coalesce(p_values->>'invoice_number',''))>180 or char_length(coalesce(p_values->>'claimant_name','')) not between 1 and 180 then raise exception 'expense_intake_fields' using errcode='23514';end if;
 event:=nullif(p_values->>'event_id','')::uuid;
 if event is not null and not exists(select 1 from public.events e where e.id=event and e.organization_id=p_org and e.deleted_at is null) then raise exception 'expense_intake_event' using errcode='42501';end if;
 proof:=p_values->'proof';
 if proof is not null and proof<>'null'::jsonb then
  if jsonb_typeof(proof)<>'object' or exists(select 1 from jsonb_object_keys(proof) k where k not in('path','label','mime','size','sha256')) then raise exception 'expense_intake_proof' using errcode='23514';end if;
  ext:=case proof->>'mime' when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
  if ext is null or proof->>'path' is distinct from p_org::text||'/'||auth.uid()::text||'/'||p_id::text||'/proof.'||ext or char_length(coalesce(proof->>'label','')) not between 1 and 180 or coalesce(proof->>'sha256','')!~'^[a-f0-9]{64}$' or jsonb_typeof(proof->'size') is distinct from 'number' or (proof->>'size')::numeric not between 1 and 5242880 or floor((proof->>'size')::numeric)<>(proof->>'size')::numeric then raise exception 'expense_intake_proof' using errcode='23514';end if;
 end if;
 insert into public.expense_intakes(id,organization_id,created_by,payload) values(p_id,p_org,auth.uid(),p_values) on conflict(id) do nothing;
 select * into current from public.expense_intakes where id=p_id for update;
 if current.organization_id<>p_org or current.created_by<>auth.uid() or current.payload is distinct from p_values then raise exception 'expense_intake_conflict' using errcode='40001';end if;
 return p_id;
end$$;
create function private.finish_expense_intake(p_org uuid,p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare current public.expense_intakes; proof jsonb;
begin
 if auth.uid() is null or not private.is_active_member(p_org) then raise exception 'expense_intake_no_access' using errcode='42501';end if;
 select * into current from public.expense_intakes where id=p_id and organization_id=p_org and created_by=auth.uid() for update;
 if not found then raise exception 'expense_intake_no_access' using errcode='42501';end if;
 if current.submitted_at is not null then return p_id;end if;
 proof:=current.payload->'proof';
 if proof is not null and proof<>'null'::jsonb and not exists(select 1 from storage.objects o where o.bucket_id='expense-proofs' and o.name=proof->>'path' and (o.metadata->>'size')::bigint=(proof->>'size')::bigint and o.metadata->>'mimetype'=proof->>'mime') then raise exception 'expense_intake_proof_missing' using errcode='23514';end if;
 insert into public.inbox_items(id,organization_id,title,description,source,status,priority,created_by) values(p_id,p_org,current.payload->>'title',current.payload->>'notes','expense_submission','new','normal',auth.uid());
 update public.expense_intakes set submitted_at=now() where id=p_id;
 return p_id;
end$$;
alter table public.expenses add column expense_intake_id uuid unique;
alter table public.expenses add constraint expenses_intake_org_binding foreign key(organization_id,expense_intake_id) references public.expense_intakes(organization_id,id);
create function private.guard_expense_intake_binding() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.expense_intake_id is distinct from old.expense_intake_id then raise exception 'expense_intake_binding_immutable' using errcode='42501';end if;
 if new.expense_intake_id is not null and not exists(select 1 from public.expense_intakes e where e.id=new.expense_intake_id and e.organization_id=new.organization_id and e.expense_id=new.id and e.submitted_at is not null) then raise exception 'expense_intake_binding_invalid' using errcode='42501';end if;
 return new;
end$$;
revoke all on function private.guard_expense_intake_binding() from public,anon;
grant execute on function private.guard_expense_intake_binding() to authenticated;
create trigger guard_expense_intake_binding before insert or update of expense_intake_id,organization_id on public.expenses for each row execute function private.guard_expense_intake_binding();
create function private.guard_expense_intake_inbox() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.expense_intakes e where e.id=old.id and e.organization_id=old.organization_id and e.submitted_at is not null) and (new.id,new.organization_id,new.source,new.created_by) is distinct from (old.id,old.organization_id,old.source,old.created_by) then raise exception 'expense_intake_inbox_identity' using errcode='42501';end if;
 return new;
end$$;
revoke all on function private.guard_expense_intake_inbox() from public,anon,authenticated;
create trigger guard_expense_intake_inbox before update of id,organization_id,source,created_by on public.inbox_items for each row execute function private.guard_expense_intake_inbox();
create function private.has_expense_intake_proof(o uuid,i uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.is_active_member(o) and exists(select 1 from public.expense_intakes e join storage.objects s on s.name=e.payload->'proof'->>'path' and s.bucket_id='expense-proofs' where e.id=i and e.organization_id=o and e.submitted_at is not null and e.payload->'proof'->>'sha256'~'^[a-f0-9]{64}$' and (s.metadata->>'size')::bigint=(e.payload->'proof'->>'size')::bigint and s.metadata->>'mimetype'=e.payload->'proof'->>'mime');$$;
revoke all on function private.has_expense_intake_proof(uuid,uuid) from public,anon;
grant execute on function private.has_expense_intake_proof(uuid,uuid) to authenticated;
alter table public.expenses drop constraint expenses_paid_requires_proof;
alter table public.expenses add constraint expenses_paid_requires_proof check(status not in('paid','reimbursed') or proof_url is not null or private.has_expense_intake_proof(organization_id,expense_intake_id));
create function private.convert_expense_intake(p_org uuid,p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare current public.expense_intakes; item public.inbox_items; result uuid;
begin
 if auth.uid() is null or not private.can_review_expense_intake(p_org) or not private.can_manage_finance(p_org) then raise exception 'expense_intake_no_access' using errcode='42501';end if;
 select * into current from public.expense_intakes where id=p_id and organization_id=p_org and submitted_at is not null for update;
 if not found then raise exception 'expense_intake_unavailable' using errcode='42501';end if;
 select * into item from public.inbox_items where id=p_id and organization_id=p_org and deleted_at is null for update;
 if not found or item.source<>'expense_submission' then raise exception 'expense_intake_unavailable' using errcode='42501';end if;
 if current.expense_id is not null then
  if not exists(select 1 from public.expenses where id=current.expense_id and organization_id=p_org and deleted_at is null) then raise exception 'expense_intake_unavailable' using errcode='42501';end if;
  return current.expense_id;
 end if;
 if nullif(current.payload->>'event_id','') is not null then
  perform 1 from public.events e where e.id=(current.payload->>'event_id')::uuid and e.organization_id=p_org and e.deleted_at is null for share;
  if not found then raise exception 'expense_intake_event' using errcode='42501';end if;
 end if;
 if item.status in('processed','archived','rejected') then raise exception 'expense_intake_unavailable' using errcode='23514';end if;
 result:=gen_random_uuid();
 update public.expense_intakes set expense_id=result where id=p_id;
 insert into public.expenses(id,organization_id,title,category,status,amount,expense_date,supplier,invoice_number,claimant_name,notes,event_id,submitted_by,created_by,expense_intake_id)
 values(result,p_org,item.title,case when nullif(current.payload->>'event_id','') is null then 'other' else 'event' end,'requested',(current.payload->>'amount')::numeric,(current.payload->>'expense_date')::date,current.payload->>'supplier',current.payload->>'invoice_number',current.payload->>'claimant_name',item.description,nullif(current.payload->>'event_id','')::uuid,current.created_by,auth.uid(),p_id) returning id into result;
 if result is null then raise exception 'expense_intake_conversion_failed';end if;
 update public.inbox_items set status='processed',reviewer_id=auth.uid(),updated_at=now() where id=p_id;
 return result;
end$$;
-- Narrow public invoker wrappers; privileged mutations remain in the non-exposed private schema.
create function public.prepare_expense_intake(p_org uuid,p_id uuid,p_values jsonb) returns uuid language sql security invoker set search_path='' as $$select private.prepare_expense_intake(p_org,p_id,p_values)$$;
create function public.finish_expense_intake(p_org uuid,p_id uuid) returns uuid language sql security invoker set search_path='' as $$select private.finish_expense_intake(p_org,p_id)$$;
create function public.convert_expense_intake(p_org uuid,p_id uuid) returns uuid language sql security invoker set search_path='' as $$select private.convert_expense_intake(p_org,p_id)$$;
revoke all on function private.prepare_expense_intake(uuid,uuid,jsonb),private.finish_expense_intake(uuid,uuid),private.convert_expense_intake(uuid,uuid),public.prepare_expense_intake(uuid,uuid,jsonb),public.finish_expense_intake(uuid,uuid),public.convert_expense_intake(uuid,uuid) from public,anon;
grant execute on function private.prepare_expense_intake(uuid,uuid,jsonb),private.finish_expense_intake(uuid,uuid),private.convert_expense_intake(uuid,uuid),public.prepare_expense_intake(uuid,uuid,jsonb),public.finish_expense_intake(uuid,uuid),public.convert_expense_intake(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
