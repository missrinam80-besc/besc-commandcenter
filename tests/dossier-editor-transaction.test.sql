\set ON_ERROR_STOP on
begin;
-- Synthetic records only, rolled back after the test. Setup uses the local owner;
-- every API assertion below runs with authenticated rights and the real RLS.
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','dossier-admin@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','dossier-volunteer@example.invalid');
insert into public.profiles(id,display_name) values
 ('11111111-1111-4111-8111-111111111111','TESTFIXTURE admin'),
 ('22222222-2222-4222-8222-222222222222','TESTFIXTURE vrijwilliger') on conflict(id) do nothing;
insert into public.organizations(id,name,slug) values
 ('33333333-3333-4333-8333-333333333333','TESTFIXTURE — NIET PUBLICEREN','dossier-test'),
 ('44444444-4444-4444-8444-444444444444','TESTFIXTURE andere organisatie','dossier-test-other');
insert into public.organization_members(organization_id,user_id,role,status) values
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','admin','active'),
 ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','volunteer','active');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare org constant uuid:='33333333-3333-4333-8333-333333333333'; root constant uuid:='55555555-5555-4555-8555-555555555555';
 child constant uuid:='66666666-6666-4666-8666-666666666666'; original jsonb; milestone jsonb; result uuid; other_root uuid:=gen_random_uuid(); relation_id uuid:=gen_random_uuid(); relation_base jsonb;
begin
 result:=public.save_dossier_bundle(org,jsonb_build_object('kind','project','root',jsonb_build_object('id',root,'new',true,'values',jsonb_build_object('title','TESTFIXTURE project'),'base',null),'parts',jsonb_build_array(jsonb_build_object('collection','project_milestones','id',child,'new',true,'values',jsonb_build_object('title','TESTFIXTURE mijlpaal'),'base',null))));
 if result<>root or not exists(select 1 from public.project_milestones where id=child and project_id=root) then raise exception 'creation failed'; end if;
 select to_jsonb(p) into original from public.projects p where id=root;
 select to_jsonb(p) into milestone from public.project_milestones p where id=child;
 -- Valid root update + invalid child must leave the root and child untouched.
 begin
   perform public.save_dossier_bundle(org,jsonb_build_object('kind','project','root',jsonb_build_object('id',root,'new',false,'base',original,'values',jsonb_build_object('title','should rollback')),'parts',jsonb_build_array(jsonb_build_object('collection','project_milestones','id',child,'new',false,'base',milestone,'values',jsonb_build_object('title','')))));
   raise exception 'expected constraint rejection';
 exception when check_violation then null; end;
 if (select title from public.projects where id=root)<>'TESTFIXTURE project' then raise exception 'partial write'; end if;
 -- A stale snapshot is rejected before overwriting anything.
 begin
   perform public.save_dossier_bundle(org,jsonb_build_object('kind','project','root',jsonb_build_object('id',root,'new',false,'base',original||'{"title":"stale"}'::jsonb,'values','{"title":"wrong"}'::jsonb),'parts','[]'::jsonb));
   raise exception 'expected conflict';
 exception when serialization_failure then null; end;
 -- Unknown field, collection and organization all fail closed.
 begin
   perform public.save_dossier_bundle(org,jsonb_build_object('kind','project','root',jsonb_build_object('id',root,'new',false,'base',original,'values','{"organization_id":"44444444-4444-4444-8444-444444444444"}'::jsonb),'parts','[]'::jsonb));
   raise exception 'expected field rejection';
 exception when check_violation then null; end;
 begin
   perform public.save_dossier_bundle(org,jsonb_build_object('kind','project','root',jsonb_build_object('id',root,'new',false,'base',original,'values','{}'::jsonb),'parts','[{"collection":"organization_members","id":"attacker","new":true,"values":{}}]'::jsonb));
   raise exception 'expected collection rejection';
 exception when check_violation then null; end;
 begin
   perform public.save_dossier_bundle('44444444-4444-4444-8444-444444444444',jsonb_build_object('kind','project','root',jsonb_build_object('id',root,'new',false,'base',original,'values','{}'::jsonb),'parts','[]'::jsonb));
   raise exception 'expected organization rejection';
 exception when insufficient_privilege then null; end;
 -- One successful commit includes root, existing child and a new child.
 perform public.save_dossier_bundle(org,jsonb_build_object('kind','project','root',jsonb_build_object('id',root,'new',false,'base',original,'values',jsonb_build_object('title','TESTFIXTURE bijgewerkt')),'parts',jsonb_build_array(jsonb_build_object('collection','project_milestones','id',child,'new',false,'base',milestone,'values','{"is_done":true}'::jsonb))));
 if (select title from public.projects where id=root)<>'TESTFIXTURE bijgewerkt' or not (select is_done from public.project_milestones where id=child) then raise exception 'joint update failed'; end if;
 perform public.save_dossier_bundle(org,jsonb_build_object('kind','project','root',jsonb_build_object('id',other_root,'new',true,'values','{"title":"TESTFIXTURE tweede project"}'::jsonb),'parts','[]'::jsonb));
 select to_jsonb(p) into original from public.projects p where id=other_root;
 begin
   perform public.save_dossier_bundle(org,jsonb_build_object('kind','project','root',jsonb_build_object('id',other_root,'new',false,'base',original,'values','{}'::jsonb),'parts',jsonb_build_array(jsonb_build_object('collection','project_milestones','id',child,'new',false,'base',milestone,'values','{"title":"wrong parent"}'::jsonb))));
   raise exception 'expected parent rejection';
 exception when check_violation or insufficient_privilege or serialization_failure then null; end;
 insert into public.record_relationships(id,organization_id,source_type,source_id,target_type,target_id,relationship_type,created_by) values(relation_id,org,'project',root,'project',other_root,'related',auth.uid());
 select to_jsonb(r) into relation_base from public.record_relationships r where id=relation_id;
 perform public.save_dossier_bundle(org,jsonb_build_object('kind','project','root',jsonb_build_object('id',other_root,'new',false,'base',original,'values','{}'::jsonb),'parts',jsonb_build_array(jsonb_build_object('collection','record_relationships','id',relation_id,'new',false,'base',relation_base,'values','{"relationship_type":"related"}'::jsonb))));
 select to_jsonb(r) into relation_base from public.record_relationships r where id=relation_id;
 perform public.save_dossier_bundle(org,jsonb_build_object('kind','project','root',jsonb_build_object('id',other_root,'new',false,'base',original,'values','{}'::jsonb),'parts',jsonb_build_array(jsonb_build_object('collection','record_relationships','id',relation_id,'new',false,'base',relation_base,'delete',true,'values','{}'::jsonb))));
 if exists(select 1 from public.record_relationships where id=relation_id) then raise exception 'incoming relationship removal failed'; end if;
 raise notice 'PASS child parent isolation and incoming relationship update/removal';
 raise notice 'PASS creation, rollback, conflict, field/catalog isolation, organization isolation, joint update';
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$begin
 begin
   perform public.save_dossier_bundle('33333333-3333-4333-8333-333333333333','{"kind":"project","root":{"id":"77777777-7777-4777-8777-777777777777","new":true,"values":{"title":"not permitted"}},"parts":[]}');
   raise exception 'expected role rejection';
 exception when insufficient_privilege then null; end;
 raise notice 'PASS volunteer cannot create project';
 perform public.save_dossier_bundle('33333333-3333-4333-8333-333333333333','{"kind":"expense","root":{"id":"99999999-9999-4999-8999-999999999999","new":true,"values":{"title":"TESTFIXTURE vrijwilligerkost","amount":1,"status":"requested"}},"parts":[]}');
 if not exists(select 1 from public.expenses where id='99999999-9999-4999-8999-999999999999' and submitted_by=auth.uid()) then raise exception 'expense submitter not preserved'; end if;
 begin
   perform public.save_dossier_bundle('33333333-3333-4333-8333-333333333333','{"kind":"expense","root":{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","new":true,"values":{"title":"TESTFIXTURE verboden betaling","amount":1,"status":"paid"}},"parts":[]}');
   raise exception 'expected payment rejection';
 exception when check_violation or insufficient_privilege then null; end;
 raise notice 'PASS volunteer expense submission and payment restriction';
end $$;
reset role;
do $$begin
 if has_function_privilege('anon','public.save_dossier_bundle(uuid,jsonb)','EXECUTE') then raise exception 'anonymous execute'; end if;
 if (select prosecdef from pg_proc where oid='public.save_dossier_bundle(uuid,jsonb)'::regprocedure) then raise exception 'elevated privileges'; end if;
 raise notice 'PASS invoker and anonymous access';
end $$;
rollback;
