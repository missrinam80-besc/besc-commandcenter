\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values('11111111-1111-4111-8111-111111111111','dossier-models@example.invalid');
insert into public.profiles(id,display_name) values('11111111-1111-4111-8111-111111111111','TESTFIXTURE admin') on conflict do nothing;
insert into public.organizations(id,name,slug) values('33333333-3333-4333-8333-333333333333','TESTFIXTURE — NIET PUBLICEREN','dossier-models');
insert into public.organization_members(organization_id,user_id,role,status) values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','admin','active');
insert into public.mailing_lists(id,organization_id,name,created_by) values('88888888-8888-4888-8888-888888888888','33333333-3333-4333-8333-333333333333','TESTFIXTURE lijst','11111111-1111-4111-8111-111111111111');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare item record; org constant uuid:='33333333-3333-4333-8333-333333333333'; new_id uuid; member_id uuid; values jsonb; original jsonb; milestone_id uuid;
begin
 for item in select * from (values
 ('task','tasks','title'),('project','projects','title'),('event','events','title'),('campaign','campaigns','title'),('partner','partners','name'),('community','community_people','display_name'),('social','social_posts','title'),('content','content_items','title'),('meeting','meetings','title'),('inbox','inbox_items','title'),('knowledge','knowledge_articles','title'),('budget','budget_envelopes','name'),('expense','expenses','title'),('income','income_entries','title'),('product','shop_products','name'),('launch','merch_launches','title'),('asset','assets','name'),('newsletter','newsletters','title'),('member','association_members','full_name'),('mandate','governance_mandates','role_label'),('deadline','compliance_deadlines','title'),('administration','administrative_documents','title')) as models(kind,tbl,title_field) loop
   new_id:=gen_random_uuid(); values:=jsonb_build_object(item.title_field,'TESTFIXTURE '||item.kind);
   if item.kind in ('expense','income') then values:=values||'{"amount":1}'::jsonb; end if;
   if item.kind='newsletter' then values:=values||'{"subject":"TESTFIXTURE onderwerp","body_text":"TESTFIXTURE — NIET PUBLICEREN","mailing_list_id":"88888888-8888-4888-8888-888888888888"}'::jsonb; end if;
   if item.kind='mandate' then values:=values||jsonb_build_object('member_id',member_id,'role','director'); end if;
   if item.kind='deadline' then values:=values||'{"category":"other"}'::jsonb; end if;
   if item.kind='administration' then values:=values||'{"document_type":"other"}'::jsonb; end if;
   perform public.save_dossier_bundle(org,jsonb_build_object('kind',item.kind,'root',jsonb_build_object('id',new_id,'new',true,'values',values),'parts','[]'::jsonb));
   if item.kind='member' then member_id:=new_id; end if;
   execute format('select to_jsonb(t) from public.%I t where id=$1',item.tbl) into original using new_id;
   if original is null then raise exception 'missing model %',item.kind; end if;
   perform public.save_dossier_bundle(org,jsonb_build_object('kind',item.kind,'root',jsonb_build_object('id',new_id,'new',false,'base',original,'values',jsonb_build_object(item.title_field,'TESTFIXTURE bijgewerkt '||item.kind)),'parts','[]'::jsonb));
   if item.kind='event' then
     execute format('select to_jsonb(t) from public.%I t where id=$1',item.tbl) into original using new_id;
     milestone_id:=gen_random_uuid();
     perform public.save_dossier_bundle(org,jsonb_build_object('kind','event','root',jsonb_build_object('id',new_id,'new',false,'base',original,'values','{}'::jsonb),'parts',jsonb_build_array(jsonb_build_object('collection','tasks','id',milestone_id,'new',true,'values','{"title":"TESTFIXTURE eventtaak"}'::jsonb))));
     if not exists(select 1 from public.record_relationships where source_id=new_id and target_id=milestone_id) then raise exception 'missing event task relation'; end if;
     perform public.save_dossier_bundle(org,jsonb_build_object('kind','event','root',jsonb_build_object('id',new_id,'new',false,'base',original,'values','{}'::jsonb),'parts',jsonb_build_array(
       jsonb_build_object('collection','event_materials','id',gen_random_uuid(),'new',true,'values','{"name":"TESTFIXTURE materiaal","quantity":1}'::jsonb),
       jsonb_build_object('collection','event_giveaways','id',gen_random_uuid(),'new',true,'values','{"name":"TESTFIXTURE giveaway","quantity_planned":2}'::jsonb),
       jsonb_build_object('collection','event_schedule_items','id',gen_random_uuid(),'new',true,'values','{"title":"TESTFIXTURE programma","kind":"program","starts_at":"2026-10-09T10:00:00Z","ends_at":"2026-10-09T11:00:00Z"}'::jsonb),
       jsonb_build_object('collection','event_registration_settings','id',new_id,'new',true,'values','{"mode":"internal","capacity":10}'::jsonb),
       jsonb_build_object('collection','event_registrations','id',gen_random_uuid(),'new',true,'values','{"name":"TESTFIXTURE deelnemer","quantity":1}'::jsonb),
       jsonb_build_object('collection','budget_envelopes','id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','new',true,'values','{"name":"TESTFIXTURE budget","planned_amount":100}'::jsonb),
       jsonb_build_object('collection','expenses','id',gen_random_uuid(),'new',true,'values','{"title":"TESTFIXTURE kost","amount":2,"budget_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'::jsonb),
       jsonb_build_object('collection','income_entries','id',gen_random_uuid(),'new',true,'values','{"title":"TESTFIXTURE inkomst","amount":3,"budget_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'::jsonb)
     )));
     if not exists(select 1 from public.event_registrations where event_id=new_id) or not exists(select 1 from public.expenses where event_id=new_id and budget_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'event parts missing'; end if;
     raise notice 'PASS event schedule, materials, giveaways, registration dependency, budget/cost/income dependency';
   end if;
   raise notice 'PASS create and update %',item.kind;
 end loop;
end $$;
rollback;
