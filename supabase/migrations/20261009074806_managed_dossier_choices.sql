begin;
-- Fixed classification allowlist; no workflow states or access roles are editable.
create table public.dossier_choice_options (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 set_key text not null,
 value text not null check(value ~ '^[a-z0-9_]{1,80}$'),
 label text not null check(char_length(trim(label)) between 1 and 120),
 position integer not null default 0 check(position>=0),
 is_default boolean not null default false,
 primary key(organization_id,set_key,value)
);
create unique index dossier_choice_labels_unique on public.dossier_choice_options(organization_id,set_key,lower(trim(label)));
alter table public.dossier_choice_options enable row level security;
revoke all on public.dossier_choice_options from public,anon,authenticated;
grant select,delete on public.dossier_choice_options to authenticated;
grant insert(organization_id,set_key,value,label,position) on public.dossier_choice_options to authenticated;
grant update(label,position) on public.dossier_choice_options to authenticated;
create policy "members read dossier choices" on public.dossier_choice_options for select to authenticated using(private.is_active_member(organization_id));
create policy "admins add dossier choices" on public.dossier_choice_options for insert to authenticated with check(private.is_org_admin(organization_id));
create policy "admins update dossier choices" on public.dossier_choice_options for update to authenticated using(private.is_org_admin(organization_id)) with check(private.is_org_admin(organization_id));
create policy "admins delete dossier choices" on public.dossier_choice_options for delete to authenticated using(private.is_org_admin(organization_id));
create function private.dossier_choice_catalog() returns jsonb language sql immutable set search_path='' as $$ select '[{"key":"budget_envelopes.category","table":"budget_envelopes","field":"category","label":"Budgetten Â· Categorie","editable":true,"defaultValue":"other","values":[{"value":"event","label":"Event"},{"value":"content","label":"Content"},{"value":"equipment","label":"equipment"},{"value":"software","label":"software"},{"value":"marketing","label":"marketing"},{"value":"merchandise","label":"merchandise"},{"value":"transport","label":"transport"},{"value":"venue","label":"venue"},{"value":"administration","label":"administration"},{"value":"giveaway","label":"giveaway"},{"value":"other","label":"Overige"}]},{"key":"expenses.category","table":"expenses","field":"category","label":"Kosten Â· Categorie","editable":true,"defaultValue":"other","values":[{"value":"event","label":"Event"},{"value":"content","label":"Content"},{"value":"equipment","label":"equipment"},{"value":"software","label":"software"},{"value":"marketing","label":"marketing"},{"value":"merchandise","label":"merchandise"},{"value":"transport","label":"transport"},{"value":"venue","label":"venue"},{"value":"administration","label":"administration"},{"value":"giveaway","label":"giveaway"},{"value":"other","label":"Overige"}]},{"key":"income_entries.income_type","table":"income_entries","field":"income_type","label":"Inkomsten Â· Inkomstentype","editable":true,"defaultValue":"other","values":[{"value":"sponsorship","label":"sponsorship"},{"value":"donation","label":"donation"},{"value":"membership","label":"membership"},{"value":"merchandise","label":"merchandise"},{"value":"ticketing","label":"ticketing"},{"value":"grant","label":"grant"},{"value":"refund","label":"refund"},{"value":"other","label":"Overige"}]},{"key":"events.event_type","table":"events","field":"event_type","label":"Events Â· Eventtype","editable":true,"defaultValue":"community","values":[{"value":"community","label":"community"},{"value":"workshop","label":"workshop"},{"value":"livestream","label":"livestream"},{"value":"podcast","label":"podcast"},{"value":"lan","label":"lan"},{"value":"meetup","label":"meetup"},{"value":"tournament","label":"tournament"},{"value":"partner","label":"Partner"},{"value":"charity","label":"charity"},{"value":"other","label":"Overige"}]},{"key":"content_items.content_type","table":"content_items","field":"content_type","label":"Content Â· Contenttype","editable":true,"defaultValue":"social_post","values":[{"value":"idea","label":"Idee"},{"value":"blog","label":"blog"},{"value":"social_post","label":"social post"},{"value":"short_reel","label":"short reel"},{"value":"youtube_video","label":"youtube video"},{"value":"livestream","label":"livestream"},{"value":"podcast","label":"podcast"},{"value":"tutorial","label":"tutorial"},{"value":"review","label":"In review"},{"value":"newsletter","label":"newsletter"},{"value":"community_post","label":"community post"},{"value":"partner_post","label":"partner post"},{"value":"event_promo","label":"event promo"}]},{"key":"partner_interactions.interaction_type","table":"partner_interactions","field":"interaction_type","label":"Sponsors Â· Contacttype","editable":true,"defaultValue":"note","values":[{"value":"email","label":"E-mail"},{"value":"call","label":"Telefoon"},{"value":"meeting","label":"Vergadering"},{"value":"note","label":"Notitie"},{"value":"proposal","label":"Voorstel"},{"value":"contract","label":"Contract"}]},{"key":"community_onboarding_items.item_type","table":"community_onboarding_items","field":"item_type","label":"Community Â· Soort onboarding","editable":true,"defaultValue":"onboarding","values":[{"value":"onboarding","label":"Intake"},{"value":"coaching","label":"coaching"},{"value":"training","label":"training"}]},{"key":"meetings.meeting_type","table":"meetings","field":"meeting_type","label":"Vergaderingen Â· Vergaderingstype","editable":true,"defaultValue":"workgroup","values":[{"value":"board","label":"Bestuur"},{"value":"general_assembly","label":"Algemene vergadering"},{"value":"workgroup","label":"workgroup"},{"value":"project","label":"Project"},{"value":"partner","label":"Partner"},{"value":"other","label":"Overige"}]},{"key":"knowledge_articles.article_type","table":"knowledge_articles","field":"article_type","label":"Kennisbank Â· Artikeltype","editable":true,"defaultValue":"guide","values":[{"value":"procedure","label":"Procedure"},{"value":"guide","label":"Handleiding"},{"value":"policy","label":"Beleid"},{"value":"faq","label":"Veelgestelde vragen"},{"value":"onboarding","label":"Intake"},{"value":"template","label":"Sjabloon"},{"value":"reference","label":"Referentie"},{"value":"other","label":"Overige"}]},{"key":"shop_products.product_type","table":"shop_products","field":"product_type","label":"Shop Â· Producttype","editable":true,"defaultValue":"other","values":[{"value":"emote","label":"emote"},{"value":"overlay","label":"overlay"},{"value":"alert","label":"alert"},{"value":"panel","label":"panel"},{"value":"bundle","label":"bundle"},{"value":"merch","label":"merch"},{"value":"digital","label":"digital"},{"value":"other","label":"Overige"}]},{"key":"assets.asset_type","table":"assets","field":"asset_type","label":"Materialen Â· Materiaaltype","editable":true,"defaultValue":"equipment","values":[{"value":"equipment","label":"equipment"},{"value":"computer","label":"computer"},{"value":"streaming","label":"streaming"},{"value":"furniture","label":"furniture"},{"value":"software","label":"software"},{"value":"vehicle","label":"vehicle"},{"value":"other","label":"Overige"}]},{"key":"association_members.membership_type","table":"association_members","field":"membership_type","label":"VZW Â· Lidmaatschapstype","editable":true,"defaultValue":"effective","values":[{"value":"effective","label":"effective"},{"value":"adherent","label":"adherent"},{"value":"honorary","label":"honorary"},{"value":"volunteer","label":"Vrijwilliger"}]},{"key":"compliance_deadlines.category","table":"compliance_deadlines","field":"category","label":"VZW Â· Deadlinecategorie","editable":true,"defaultValue":null,"values":[{"value":"general_assembly","label":"Algemene vergadering"},{"value":"board","label":"Bestuur"},{"value":"finance","label":"FinanciÃ«n"},{"value":"kbo","label":"kbo"},{"value":"ubo","label":"ubo"},{"value":"tax","label":"Belasting"},{"value":"insurance","label":"Verzekering"},{"value":"subsidy","label":"Subsidie"},{"value":"publication","label":"Publicatie"},{"value":"contract","label":"Contract"},{"value":"other","label":"Overige"}]},{"key":"administrative_documents.document_type","table":"administrative_documents","field":"document_type","label":"VZW Â· Documenttype","editable":true,"defaultValue":null,"values":[{"value":"articles","label":"articles"},{"value":"incorporation","label":"incorporation"},{"value":"official_gazette","label":"official gazette"},{"value":"kbo","label":"kbo"},{"value":"ubo","label":"ubo"},{"value":"vat","label":"vat"},{"value":"minutes","label":"minutes"},{"value":"annual_accounts","label":"annual accounts"},{"value":"budget","label":"budget"},{"value":"insurance","label":"Verzekering"},{"value":"contract","label":"Contract"},{"value":"subsidy","label":"Subsidie"},{"value":"policy","label":"Beleid"},{"value":"register","label":"register"},{"value":"other","label":"Overige"}]}]'::jsonb $$;
revoke all on function private.dossier_choice_catalog() from public,anon,authenticated;

-- Trigger code reads all uses, including archived/deleted fiches, after explicit org/admin checks.
create function private.guard_dossier_choice_option() returns trigger language plpgsql security definer set search_path='' as $$
declare definition jsonb; used boolean;
begin
 if tg_op='DELETE' and not exists(select 1 from public.organizations where id=old.organization_id) then return old; end if;
 select value into definition from jsonb_array_elements(private.dossier_choice_catalog()) where value->>'key'=coalesce(new.set_key,old.set_key);
 if definition is null then raise exception 'choice_protected_set' using errcode='23514'; end if;
 if tg_op='INSERT' and pg_trigger_depth()>1 and exists(select 1 from jsonb_array_elements(definition->'values') v where v->>'value'=new.value and v->>'label'=new.label) and new.is_default=coalesce(new.value=definition->>'defaultValue',false) then return new; end if;
 if auth.uid() is null or not private.is_org_admin(coalesce(new.organization_id,old.organization_id)) then raise exception 'choice_no_access' using errcode='42501'; end if;
 if tg_op='DELETE' then
  if old.is_default then raise exception 'choice_default_protected' using errcode='23514'; end if;
  execute format('select exists(select 1 from public.%I where organization_id=$1 and %I=$2)',definition->>'table',definition->>'field') into used using old.organization_id,old.value;
  if used then raise exception 'choice_in_use' using errcode='23503'; end if;
  return old;
 end if;
 if tg_op='UPDATE' and (new.organization_id,new.set_key,new.value,new.is_default) is distinct from (old.organization_id,old.set_key,old.value,old.is_default) then raise exception 'choice_identity_protected' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.guard_dossier_choice_option() from public,anon,authenticated;

-- The option row lock conflicts with deletion. All writers, including imports/RPCs, validate.
create function private.validate_dossier_choice() returns trigger language plpgsql security definer set search_path='' as $$
declare selected_value text; found_value text;
begin
 if auth.uid() is not null and not private.is_active_member(new.organization_id) then raise exception 'choice_no_access' using errcode='42501'; end if;
 selected_value:=to_jsonb(new)->>tg_argv[1];
 if selected_value is null then return new; end if;
 select value into found_value from public.dossier_choice_options where organization_id=new.organization_id and set_key=tg_argv[0] and value=selected_value for key share;
 if found_value is null then raise exception 'choice_unavailable' using errcode='23503',detail=tg_argv[0]; end if;
 return new;
end $$;
revoke all on function private.validate_dossier_choice() from public,anon,authenticated;

create function private.seed_dossier_choices() returns trigger language plpgsql security definer set search_path='' as $$
declare definition jsonb; option jsonb; n integer;
begin
 for definition in select value from jsonb_array_elements(private.dossier_choice_catalog()) loop
  n:=0;
  for option in select value from jsonb_array_elements(definition->'values') loop
   insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) values(new.id,definition->>'key',option->>'value',option->>'label',n,coalesce(option->>'value'=definition->>'defaultValue',false)) on conflict do nothing;
   n:=n+1;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function private.seed_dossier_choices() from public,anon,authenticated;
create trigger seed_dossier_choices after insert on public.organizations for each row execute function private.seed_dossier_choices();

create function public.dossier_choice_usage(p_organization_id uuid) returns table(set_key text,value text,usage_count bigint)
language plpgsql security definer set search_path='' as $$
declare definition jsonb;
begin
 if auth.uid() is null or not private.is_org_admin(p_organization_id) then raise exception 'choice_no_access' using errcode='42501'; end if;
 for definition in select v from jsonb_array_elements(private.dossier_choice_catalog()) as d(v) loop
  return query execute format('select %L::text,t.%I::text,count(*) from public.%I t where t.organization_id=$1 and t.%I is not null group by t.%I',definition->>'key',definition->>'field',definition->>'table',definition->>'field',definition->>'field') using p_organization_id;
 end loop;
end $$;
revoke all on function public.dossier_choice_usage(uuid) from public,anon;
grant execute on function public.dossier_choice_usage(uuid) to authenticated;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'budget_envelopes.category','event','Event',0,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'budget_envelopes.category','content','Content',1,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'budget_envelopes.category','equipment','equipment',2,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'budget_envelopes.category','software','software',3,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'budget_envelopes.category','marketing','marketing',4,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'budget_envelopes.category','merchandise','merchandise',5,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'budget_envelopes.category','transport','transport',6,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'budget_envelopes.category','venue','venue',7,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'budget_envelopes.category','administration','administration',8,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'budget_envelopes.category','giveaway','giveaway',9,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'budget_envelopes.category','other','Overige',10,true from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position) select distinct organization_id,'budget_envelopes.category',category,'Bestaande waarde: '||category,1000 from public.budget_envelopes where category is not null and category ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attname='category' where con.conrelid='public.budget_envelopes'::regclass and con.contype='c' and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.budget_envelopes drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_category before insert or update of category,organization_id on public.budget_envelopes for each row execute function private.validate_dossier_choice('budget_envelopes.category','category');
create index if not exists managed_choice_budget_envelopes_category_idx on public.budget_envelopes(organization_id,category);
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'expenses.category','event','Event',0,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'expenses.category','content','Content',1,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'expenses.category','equipment','equipment',2,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'expenses.category','software','software',3,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'expenses.category','marketing','marketing',4,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'expenses.category','merchandise','merchandise',5,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'expenses.category','transport','transport',6,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'expenses.category','venue','venue',7,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'expenses.category','administration','administration',8,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'expenses.category','giveaway','giveaway',9,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'expenses.category','other','Overige',10,true from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position) select distinct organization_id,'expenses.category',category,'Bestaande waarde: '||category,1000 from public.expenses where category is not null and category ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attname='category' where con.conrelid='public.expenses'::regclass and con.contype='c' and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.expenses drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_category before insert or update of category,organization_id on public.expenses for each row execute function private.validate_dossier_choice('expenses.category','category');
create index if not exists managed_choice_expenses_category_idx on public.expenses(organization_id,category);
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'income_entries.income_type','sponsorship','sponsorship',0,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'income_entries.income_type','donation','donation',1,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'income_entries.income_type','membership','membership',2,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'income_entries.income_type','merchandise','merchandise',3,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'income_entries.income_type','ticketing','ticketing',4,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'income_entries.income_type','grant','grant',5,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'income_entries.income_type','refund','refund',6,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'income_entries.income_type','other','Overige',7,true from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position) select distinct organization_id,'income_entries.income_type',income_type,'Bestaande waarde: '||income_type,1000 from public.income_entries where income_type is not null and income_type ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attname='income_type' where con.conrelid='public.income_entries'::regclass and con.contype='c' and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.income_entries drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_income_type before insert or update of income_type,organization_id on public.income_entries for each row execute function private.validate_dossier_choice('income_entries.income_type','income_type');
create index if not exists managed_choice_income_entries_income_type_idx on public.income_entries(organization_id,income_type);
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'events.event_type','community','community',0,true from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'events.event_type','workshop','workshop',1,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'events.event_type','livestream','livestream',2,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'events.event_type','podcast','podcast',3,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'events.event_type','lan','lan',4,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'events.event_type','meetup','meetup',5,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'events.event_type','tournament','tournament',6,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'events.event_type','partner','Partner',7,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'events.event_type','charity','charity',8,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'events.event_type','other','Overige',9,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position) select distinct organization_id,'events.event_type',event_type,'Bestaande waarde: '||event_type,1000 from public.events where event_type is not null and event_type ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attname='event_type' where con.conrelid='public.events'::regclass and con.contype='c' and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.events drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_event_type before insert or update of event_type,organization_id on public.events for each row execute function private.validate_dossier_choice('events.event_type','event_type');
create index if not exists managed_choice_events_event_type_idx on public.events(organization_id,event_type);
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'content_items.content_type','idea','Idee',0,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'content_items.content_type','blog','blog',1,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'content_items.content_type','social_post','social post',2,true from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'content_items.content_type','short_reel','short reel',3,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'content_items.content_type','youtube_video','youtube video',4,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'content_items.content_type','livestream','livestream',5,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'content_items.content_type','podcast','podcast',6,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'content_items.content_type','tutorial','tutorial',7,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'content_items.content_type','review','In review',8,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'content_items.content_type','newsletter','newsletter',9,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'content_items.content_type','community_post','community post',10,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'content_items.content_type','partner_post','partner post',11,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'content_items.content_type','event_promo','event promo',12,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position) select distinct organization_id,'content_items.content_type',content_type,'Bestaande waarde: '||content_type,1000 from public.content_items where content_type is not null and content_type ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attname='content_type' where con.conrelid='public.content_items'::regclass and con.contype='c' and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.content_items drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_content_type before insert or update of content_type,organization_id on public.content_items for each row execute function private.validate_dossier_choice('content_items.content_type','content_type');
create index if not exists managed_choice_content_items_content_type_idx on public.content_items(organization_id,content_type);
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'partner_interactions.interaction_type','email','E-mail',0,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'partner_interactions.interaction_type','call','Telefoon',1,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'partner_interactions.interaction_type','meeting','Vergadering',2,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'partner_interactions.interaction_type','note','Notitie',3,true from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'partner_interactions.interaction_type','proposal','Voorstel',4,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'partner_interactions.interaction_type','contract','Contract',5,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position) select distinct organization_id,'partner_interactions.interaction_type',interaction_type,'Bestaande waarde: '||interaction_type,1000 from public.partner_interactions where interaction_type is not null and interaction_type ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attname='interaction_type' where con.conrelid='public.partner_interactions'::regclass and con.contype='c' and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.partner_interactions drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_interaction_type before insert or update of interaction_type,organization_id on public.partner_interactions for each row execute function private.validate_dossier_choice('partner_interactions.interaction_type','interaction_type');
create index if not exists managed_choice_partner_interactions_interaction_type_idx on public.partner_interactions(organization_id,interaction_type);
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'community_onboarding_items.item_type','onboarding','Intake',0,true from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'community_onboarding_items.item_type','coaching','coaching',1,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'community_onboarding_items.item_type','training','training',2,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position) select distinct organization_id,'community_onboarding_items.item_type',item_type,'Bestaande waarde: '||item_type,1000 from public.community_onboarding_items where item_type is not null and item_type ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attname='item_type' where con.conrelid='public.community_onboarding_items'::regclass and con.contype='c' and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.community_onboarding_items drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_item_type before insert or update of item_type,organization_id on public.community_onboarding_items for each row execute function private.validate_dossier_choice('community_onboarding_items.item_type','item_type');
create index if not exists managed_choice_community_onboarding_items_item_type_idx on public.community_onboarding_items(organization_id,item_type);
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'meetings.meeting_type','board','Bestuur',0,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'meetings.meeting_type','general_assembly','Algemene vergadering',1,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'meetings.meeting_type','workgroup','workgroup',2,true from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'meetings.meeting_type','project','Project',3,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'meetings.meeting_type','partner','Partner',4,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'meetings.meeting_type','other','Overige',5,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position) select distinct organization_id,'meetings.meeting_type',meeting_type,'Bestaande waarde: '||meeting_type,1000 from public.meetings where meeting_type is not null and meeting_type ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attname='meeting_type' where con.conrelid='public.meetings'::regclass and con.contype='c' and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.meetings drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_meeting_type before insert or update of meeting_type,organization_id on public.meetings for each row execute function private.validate_dossier_choice('meetings.meeting_type','meeting_type');
create index if not exists managed_choice_meetings_meeting_type_idx on public.meetings(organization_id,meeting_type);
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'knowledge_articles.article_type','procedure','Procedure',0,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'knowledge_articles.article_type','guide','Handleiding',1,true from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'knowledge_articles.article_type','policy','Beleid',2,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'knowledge_articles.article_type','faq','Veelgestelde vragen',3,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'knowledge_articles.article_type','onboarding','Intake',4,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'knowledge_articles.article_type','template','Sjabloon',5,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'knowledge_articles.article_type','reference','Referentie',6,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'knowledge_articles.article_type','other','Overige',7,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position) select distinct organization_id,'knowledge_articles.article_type',article_type,'Bestaande waarde: '||article_type,1000 from public.knowledge_articles where article_type is not null and article_type ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attname='article_type' where con.conrelid='public.knowledge_articles'::regclass and con.contype='c' and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.knowledge_articles drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_article_type before insert or update of article_type,organization_id on public.knowledge_articles for each row execute function private.validate_dossier_choice('knowledge_articles.article_type','article_type');
create index if not exists managed_choice_knowledge_articles_article_type_idx on public.knowledge_articles(organization_id,article_type);
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'shop_products.product_type','emote','emote',0,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'shop_products.product_type','overlay','overlay',1,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'shop_products.product_type','alert','alert',2,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'shop_products.product_type','panel','panel',3,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'shop_products.product_type','bundle','bundle',4,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'shop_products.product_type','merch','merch',5,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'shop_products.product_type','digital','digital',6,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'shop_products.product_type','other','Overige',7,true from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position) select distinct organization_id,'shop_products.product_type',product_type,'Bestaande waarde: '||product_type,1000 from public.shop_products where product_type is not null and product_type ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attname='product_type' where con.conrelid='public.shop_products'::regclass and con.contype='c' and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.shop_products drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_product_type before insert or update of product_type,organization_id on public.shop_products for each row execute function private.validate_dossier_choice('shop_products.product_type','product_type');
create index if not exists managed_choice_shop_products_product_type_idx on public.shop_products(organization_id,product_type);
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'assets.asset_type','equipment','equipment',0,true from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'assets.asset_type','computer','computer',1,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'assets.asset_type','streaming','streaming',2,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'assets.asset_type','furniture','furniture',3,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'assets.asset_type','software','software',4,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'assets.asset_type','vehicle','vehicle',5,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'assets.asset_type','other','Overige',6,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position) select distinct organization_id,'assets.asset_type',asset_type,'Bestaande waarde: '||asset_type,1000 from public.assets where asset_type is not null and asset_type ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attname='asset_type' where con.conrelid='public.assets'::regclass and con.contype='c' and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.assets drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_asset_type before insert or update of asset_type,organization_id on public.assets for each row execute function private.validate_dossier_choice('assets.asset_type','asset_type');
create index if not exists managed_choice_assets_asset_type_idx on public.assets(organization_id,asset_type);
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'association_members.membership_type','effective','effective',0,true from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'association_members.membership_type','adherent','adherent',1,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'association_members.membership_type','honorary','honorary',2,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'association_members.membership_type','volunteer','Vrijwilliger',3,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position) select distinct organization_id,'association_members.membership_type',membership_type,'Bestaande waarde: '||membership_type,1000 from public.association_members where membership_type is not null and membership_type ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attname='membership_type' where con.conrelid='public.association_members'::regclass and con.contype='c' and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.association_members drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_membership_type before insert or update of membership_type,organization_id on public.association_members for each row execute function private.validate_dossier_choice('association_members.membership_type','membership_type');
create index if not exists managed_choice_association_members_membership_type_idx on public.association_members(organization_id,membership_type);
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'compliance_deadlines.category','general_assembly','Algemene vergadering',0,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'compliance_deadlines.category','board','Bestuur',1,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'compliance_deadlines.category','finance','FinanciÃ«n',2,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'compliance_deadlines.category','kbo','kbo',3,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'compliance_deadlines.category','ubo','ubo',4,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'compliance_deadlines.category','tax','Belasting',5,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'compliance_deadlines.category','insurance','Verzekering',6,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'compliance_deadlines.category','subsidy','Subsidie',7,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'compliance_deadlines.category','publication','Publicatie',8,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'compliance_deadlines.category','contract','Contract',9,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'compliance_deadlines.category','other','Overige',10,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position) select distinct organization_id,'compliance_deadlines.category',category,'Bestaande waarde: '||category,1000 from public.compliance_deadlines where category is not null and category ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attname='category' where con.conrelid='public.compliance_deadlines'::regclass and con.contype='c' and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.compliance_deadlines drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_category before insert or update of category,organization_id on public.compliance_deadlines for each row execute function private.validate_dossier_choice('compliance_deadlines.category','category');
create index if not exists managed_choice_compliance_deadlines_category_idx on public.compliance_deadlines(organization_id,category);
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','articles','articles',0,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','incorporation','incorporation',1,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','official_gazette','official gazette',2,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','kbo','kbo',3,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','ubo','ubo',4,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','vat','vat',5,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','minutes','minutes',6,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','annual_accounts','annual accounts',7,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','budget','budget',8,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','insurance','Verzekering',9,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','contract','Contract',10,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','subsidy','Subsidie',11,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','policy','Beleid',12,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','register','register',13,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default) select id,'administrative_documents.document_type','other','Overige',14,false from public.organizations on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position) select distinct organization_id,'administrative_documents.document_type',document_type,'Bestaande waarde: '||document_type,1000 from public.administrative_documents where document_type is not null and document_type ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con join pg_attribute a on a.attrelid=con.conrelid and a.attname='document_type' where con.conrelid='public.administrative_documents'::regclass and con.contype='c' and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.administrative_documents drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_document_type before insert or update of document_type,organization_id on public.administrative_documents for each row execute function private.validate_dossier_choice('administrative_documents.document_type','document_type');
create index if not exists managed_choice_administrative_documents_document_type_idx on public.administrative_documents(organization_id,document_type);
create trigger guard_dossier_choice_option before insert or update or delete on public.dossier_choice_options for each row execute function private.guard_dossier_choice_option();
notify pgrst, 'reload schema';
commit;
