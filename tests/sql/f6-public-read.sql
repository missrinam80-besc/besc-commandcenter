-- Local isolated rehearsal only. All fixture writes are rolled back.
begin;
set local session_replication_role=replica;
do $$
declare s public.publication_sites; actor uuid; source_id uuid:=gen_random_uuid();rev uuid:=gen_random_uuid();entry uuid:=gen_random_uuid();channel uuid:=gen_random_uuid();other uuid:=gen_random_uuid();grant_id uuid:=gen_random_uuid(); key text:='TESTFIXTURE-NEVER-USE-THIS-KEY-LIVE-0001';v jsonb;denied boolean;
begin
 select * into s from public.publication_sites limit 1;assert s.id is not null,'Missing local rehearsal site';
 actor:=s.created_by;
 assert not has_function_privilege('anon','public.f6_public_read(uuid,text,text,text,text,integer,timestamptz,uuid)','execute');
 assert not has_function_privilege('authenticated','public.f6_public_read(uuid,text,text,text,text,integer,timestamptz,uuid)','execute');
 assert has_function_privilege('service_role','public.f6_public_read(uuid,text,text,text,text,integer,timestamptz,uuid)','execute');
 assert not has_table_privilege('service_role','private.public_website_grants','select');
 assert not has_table_privilege('authenticated','private.public_website_channels','update');
 update public.publication_sites set active=true where id=s.id;
 insert into public.content_items(id,organization_id,title,created_by)values(source_id,s.organization_id,'TESTFIXTURE F6 source',actor);
 insert into public.publication_revisions(id,organization_id,source_type,source_id,source_revision,revision,payload,payload_sha256,status,created_by)
 values(rev,s.organization_id,'news',source_id,1,1,jsonb_build_object('title','TESTFIXTURE F6 approved news','summary','TESTFIXTURE','body',jsonb_build_object('format','sanitized_html','value','<p>TESTFIXTURE</p>'),'media','[]'::jsonb),repeat('a',64),'approved_for_publication',actor);
 insert into public.publication_entries(public_id,organization_id,site_id,source_type,source_id,locale,slug,selected_revision_id,published_at)
 values(entry,s.organization_id,s.id,'news',source_id,'nl-BE','testfixture-f6-public-read',rev,clock_timestamp()-interval'1 minute');
 insert into private.public_website_channels(id,organization_id,site_id,origin,key_sha256,created_by)
 values(channel,s.organization_id,s.id,'https://f6-fixture.invalid',encode(sha256(convert_to(key,'UTF8')),'hex'),actor);
 denied:=false;begin perform public.f6_public_read(channel,key,'news');exception when insufficient_privilege then denied:=true;end;assert denied,'New channel must be closed';
 update private.public_website_channels set enabled=true where id=channel;
 assert public.f6_public_read(channel,key,'news')='[]'::jsonb,'An enabled channel alone must not publish staging content';
 insert into private.public_website_grants(id,organization_id,channel_id,kind,entry_id,revision_id,entry_epoch,granted_by,reason)
 values(grant_id,s.organization_id,channel,'news',entry,rev,1,actor,'TESTFIXTURE local grant');
 v:=public.f6_public_read(channel,key,'news');assert jsonb_array_length(v)=1,'Exact approved grant should be readable';
 assert v->0->>'title'='TESTFIXTURE F6 approved news';
 assert not(v->0?'organization_id')and not(v->0?'source_id')and not(v->0?'proof_document_id'),'Private metadata leaked';
 denied:=false;begin perform public.f6_public_read(channel,key||'bad','news');exception when insufficient_privilege then denied:=true;end;assert denied,'Wrong key must fail';
 assert public.f6_public_read(channel,key,'news',null,'fr-BE')='[]'::jsonb,'Locale must be scoped';
 insert into private.public_website_channels(id,organization_id,site_id,origin,key_sha256,created_by,enabled)
 values(other,s.organization_id,s.id,'https://f6-other-fixture.invalid',encode(sha256(convert_to(key,'UTF8')),'hex'),actor,true);
 assert public.f6_public_read(other,key,'news')='[]'::jsonb,'Grants must not cross channels';
 update private.public_website_grants set revoked_at=clock_timestamp()where id=grant_id;
 assert public.f6_public_read(channel,key,'news')='[]'::jsonb,'Grant withdrawal must stop reading';
 update private.public_website_grants set revoked_at=null where id=grant_id;
 update public.publication_entries set epoch=2 where public_id=entry;
 assert public.f6_public_read(channel,key,'news')='[]'::jsonb,'A new epoch needs a new grant';
 update public.publication_entries set epoch=1 where public_id=entry;
 update public.publication_revisions set status='withdrawn'where id=rev;
 assert public.f6_public_read(channel,key,'news')='[]'::jsonb,'Source withdrawal must stop reading';
 assert public.f6_public_media(channel,key,gen_random_uuid())is null,'Unknown media must not expose a locator';
 denied:=false;begin perform public.f6_public_workflow(s.organization_id,'channel.state',jsonb_build_object('channel_id',channel,'expected_version',1,'enabled',true,'reason','TESTFIXTURE'),gen_random_uuid());exception when insufficient_privilege then denied:=true;end;assert denied,'No human session must not administer channels';
end$$;

do $$
declare actor uuid;org uuid;session_id uuid;site uuid;request_id uuid:=gen_random_uuid();answer jsonb;again jsonb;channel uuid;denied boolean;e public.publication_entries;grant_id uuid;key text:='TESTFIXTURE-LOCAL-WORKFLOW-KEY-0001';
begin
 select v.account_user_id,v.organization_id,s.id into actor,org,session_id
 from public.association_identity_verifications v join auth.sessions s on s.user_id=v.account_user_id
 where v.revoked_at is null and exists(select 1 from public.governance_mandates g where g.member_id=v.member_id and g.organization_id=v.organization_id and g.role='chair' and g.status='active' and g.deleted_at is null)limit 1;
 assert actor is not null,'Missing restored chair/session fixture context';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',session_id)::text,true);
 assert private.f2_account(org)and private.f1_chair(org),'Restored chair must remain valid in isolated copy';
 select id into site from public.publication_sites where organization_id=org limit 1;assert site is not null;
 answer:=public.f6_public_workflow(org,'channel.create',jsonb_build_object('site_id',site,'origin','https://f6-workflow-fixture.invalid','key_sha256',repeat('b',64),'reason','TESTFIXTURE local workflow'),request_id);
 channel:=(answer->>'id')::uuid;
 again:=public.f6_public_workflow(org,'channel.create',jsonb_build_object('site_id',site,'origin','https://f6-workflow-fixture.invalid','key_sha256',repeat('b',64),'reason','TESTFIXTURE local workflow'),request_id);
 assert again=answer,'Same request must replay its receipt';
 assert(select not enabled from private.public_website_channels where id=channel),'Workflow must create a closed channel';
 denied:=false;begin perform public.f6_public_workflow(org,'channel.create',jsonb_build_object('site_id',site,'origin','https://different-fixture.invalid','key_sha256',repeat('b',64),'reason','TESTFIXTURE local workflow'),request_id);exception when serialization_failure then denied:=true;end;assert denied,'A request ID cannot change its meaning';
 perform public.f6_public_workflow(org,'channel.state',jsonb_build_object('channel_id',channel,'expected_version',1,'enabled',false,'reason','TESTFIXTURE local close'),gen_random_uuid());
 denied:=false;begin perform public.f6_public_workflow(org,'channel.state',jsonb_build_object('channel_id',channel,'expected_version',1,'enabled',true,'reason','TESTFIXTURE stale update'),gen_random_uuid());exception when serialization_failure then denied:=true;end;assert denied,'Stale administration must fail';
 select * into e from public.publication_entries where site_id=site and slug='testfixture-f6-public-read';assert e.public_id is not null;
 update public.publication_revisions set status='approved_for_publication'where id=e.selected_revision_id;
 answer:=public.f6_public_workflow(org,'grant.add',jsonb_build_object('channel_id',channel,'expected_version',2,'kind','news','entry_id',e.public_id,'revision_id',e.selected_revision_id,'entry_epoch',e.epoch,'reason','TESTFIXTURE exact grant'),gen_random_uuid());grant_id:=(answer->>'id')::uuid;
 perform public.f6_public_workflow(org,'channel.key',jsonb_build_object('channel_id',channel,'expected_version',3,'key_sha256',encode(sha256(convert_to(key,'UTF8')),'hex'),'reason','TESTFIXTURE key binding'),gen_random_uuid());
 perform public.f6_public_workflow(org,'channel.state',jsonb_build_object('channel_id',channel,'expected_version',4,'enabled',true,'reason','TESTFIXTURE enable'),gen_random_uuid());
 assert jsonb_array_length(public.f6_public_read(channel,key,'news'))=1,'Workflow-granted revision should be readable';
 perform public.f6_public_workflow(org,'grant.withdraw',jsonb_build_object('channel_id',channel,'expected_version',5,'grant_id',grant_id,'reason','TESTFIXTURE withdrawal'),gen_random_uuid());
 assert public.f6_public_read(channel,key,'news')='[]'::jsonb,'Workflow withdrawal should stop reading';
 answer:=public.f6_public_status(org);assert answer?'channels'and answer?'grants';
 assert not exists(select 1 from jsonb_array_elements(answer->'channels')x where x?'key_sha256'),'Administrative status should not return the key hash';
end$$;

rollback;
select 'F6 local read boundary checks passed; fixtures rolled back';
