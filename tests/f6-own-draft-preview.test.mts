import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {f1Database,q,j} from './helpers/f1-database.mts';
import {ownPageDraftsSchema} from '../src/lib/f6-own-draft-contract.ts';

test('Own chair preview survives editor withdrawal and rejects other authors, organisations, stale sources and revoked sessions',async()=>{
 const f=await f1Database();try{
 const sessions=new Map<string,string>();
 for(const user of [f.ids.chair,f.ids.member,f.ids.reviewer,f.ids.other]){
  const id=randomUUID();sessions.set(user,id);await f.owner();
  await f.db.exec(`update auth.users set email_confirmed_at=now() where id=${q(user)};insert into auth.sessions(id,user_id)values(${q(id)},${q(user)});`);
 }
 const actor=async(user:string)=>{await f.owner();await f.actor(user);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:user,role:'authenticated',session_id:sessions.get(user)}))},false)`);};
 const site=randomUUID();await f.owner();
 await f.db.exec(`insert into public.publication_sites(id,organization_id,host,active,key_sha256,created_by)values
 (${q(site)},${q(f.ids.org)},'website-dev.belgianstreamerscommunity.be',false,${q(createHash('sha256').update('TESTFIXTURE').digest('hex'))},${q(f.ids.chair)});`);
 const payload={slug:'home',locale:'nl-BE',title:'TESTFIXTURE own page',summary:'TESTFIXTURE',body:{format:'plain_text',value:'TESTFIXTURE <script>literal plain text</script>'},navigation:false,links:[],hero:null};
 const draft=async(data:unknown)=>(await f.db.query<{v:{id:string}}>(`select public.f4_content_workflow(${q(site)},'content.draft',${j(data)},${q(randomUUID())})v`)).rows[0].v;
 await actor(f.ids.chair);const original=await draft({kind:'page',dossier_id:null,expected_revision:0,payload,proof_document_id:f.ids.policyDoc,migration_record_id:null});
 await f.owner();const dossier=(await f.db.query<{dossier_id:string}>(`select dossier_id from private.site_content_revisions where id=${q(original.id)}`)).rows[0].dossier_id;
 await actor(f.ids.chair);const latest=await draft({kind:'page',dossier_id:dossier,expected_revision:1,payload:{...payload,title:'TESTFIXTURE latest own page'},proof_document_id:f.ids.policyDoc,migration_record_id:null});
 await f.call('identity.assign',{user_id:f.ids.reviewer,role:'publication_editor'});
 await actor(f.ids.reviewer);await draft({kind:'page',dossier_id:null,expected_revision:0,payload:{...payload,slug:'other-author'},proof_document_id:f.ids.policyDoc,migration_record_id:null});
 await f.owner();const editor=(await f.db.query<{id:string}>(`select id from public.workflow_assignments where organization_id=${q(f.ids.org)} and user_id=${q(f.ids.chair)} and role='publication_editor' and revoked_at is null`)).rows[0].id;
 await actor(f.ids.chair);await f.call('identity.unassign',{id:editor});
 const preview=async(s=site)=>(await f.db.query<{v:unknown}>(`select public.f6_own_page_drafts(${q(s)})v`)).rows[0].v;
 const read=ownPageDraftsSchema.parse(await preview());assert.equal(read.items.length,1);assert.equal(read.items[0].revision_id,latest.id);assert.equal(read.items[0].revision,2);assert.equal(read.items[0].status,'draft');assert.equal(read.items[0].payload.title,'TESTFIXTURE latest own page');
 assert(!JSON.stringify(read).includes('proof_document_id'));assert(!JSON.stringify(read).includes('other-author'));
 const snapshots=async()=>{await f.owner();return(await f.db.query<{v:unknown}>(`select jsonb_build_object('revisions',(select jsonb_agg(to_jsonb(r)order by id)from private.site_content_revisions r),'roles',(select jsonb_agg(to_jsonb(a)order by id)from public.workflow_assignments a),'entries',(select count(*)from private.site_content_entries))v`)).rows[0].v;};
 const before=await snapshots();await actor(f.ids.chair);await preview();assert.deepEqual(await snapshots(),before);
 await actor(f.ids.member);await assert.rejects(preview(),/not_authorized/);
 await actor(f.ids.reviewer);await assert.rejects(preview(),/not_authorized/);
 await actor(f.ids.other);await assert.rejects(preview(),/not_authorized/);
 await actor(f.ids.chair);await assert.rejects(preview(randomUUID()),/not_authorized/);
 await f.owner();const grants=(await f.db.query<{v:{anon:boolean;authenticated:boolean;service:boolean}}>(`select jsonb_build_object('anon',has_function_privilege('anon','public.f6_own_page_drafts(uuid)','EXECUTE'),'authenticated',has_function_privilege('authenticated','public.f6_own_page_drafts(uuid)','EXECUTE'),'service',has_function_privilege('service_role','public.f6_own_page_drafts(uuid)','EXECUTE'))v`)).rows[0].v;
 assert.deepEqual(grants,{anon:false,authenticated:true,service:false});
 await f.db.exec(`update public.document_registry set label='TESTFIXTURE source changed'where id=${q(f.ids.policyDoc)}`);await actor(f.ids.chair);assert.equal(ownPageDraftsSchema.parse(await preview()).items.length,0);
 await f.owner();await f.db.exec(`delete from auth.sessions where id=${q(sessions.get(f.ids.chair))}`);await actor(f.ids.chair);await assert.rejects(preview(),/not_authorized/);
 }finally{await f.db.close();}
});

test('Own preview contract rejects non-drafts, extra private data and unsafe links',()=>{
 const id=randomUUID(),payload={slug:'home',locale:'nl-BE',title:'TESTFIXTURE',summary:'TESTFIXTURE',body:{format:'plain_text',value:'TESTFIXTURE'},navigation:false,links:[],hero:null};
 const item={dossier_id:id,revision_id:id,revision:1,status:'draft',payload};
 assert(ownPageDraftsSchema.safeParse({items:[item]}).success);
 for(const changed of [{...item,status:'approved'},{...item,proof_document_id:id},{...item,payload:{...payload,links:[{label:'TESTFIXTURE',href:'javascript:alert(1)'}]}}])assert(!ownPageDraftsSchema.safeParse({items:[changed]}).success);
 assert(!ownPageDraftsSchema.safeParse({items:Array(51).fill(item)}).success);
});
