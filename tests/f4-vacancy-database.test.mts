import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {f1Database,q,j} from './helpers/f1-database.mts';
import {vacancyPublicationSchema} from '../src/lib/vacancy-contract.ts';
import {intakeOwnSchema,intakeDetailSchema} from '../src/lib/f4-intake-contract.ts';
test('Vacancy chain: independent publication, exact application snapshot, scoped handler, stale version and closed vacancy',async()=>{
 const f=await f1Database();try{
  const sessions=new Map<string,string>();for(const u of [f.ids.chair,f.ids.member,f.ids.reviewer]){const id=randomUUID();sessions.set(u,id);await f.owner();await f.db.exec(`update auth.users set email_confirmed_at=now() where id=${q(u)};insert into auth.sessions(id,user_id) values(${q(id)},${q(u)});`);}
  const actor=async(u:string)=>{await f.owner();await f.actor(u);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:u,role:'authenticated',session_id:sessions.get(u)}))},false)`);};
  const site=randomUUID(),key='TESTFIXTURE vacancy key never used live',until=new Date(Date.now()+3600000).toISOString();
  await f.owner();await f.db.exec(`insert into public.publication_sites(id,organization_id,host,active,key_sha256,created_by)values(${q(site)},${q(f.ids.org)},'website-dev.belgianstreamerscommunity.be',true,${q(createHash('sha256').update(key).digest('hex'))},${q(f.ids.chair)});update public.organization_members set status='pending'where user_id=${q(f.ids.member)}and organization_id=${q(f.ids.org)};`);
  const workflow=async(name:string,op:string,data:unknown,id=randomUUID())=>(await f.db.query<{v:{id:string}}>(`select public.${name}(${q(site)},${q(op)},${j(data)},${q(id)})v`)).rows[0].v;
  const vacancy=(op:string,data:unknown,id=randomUUID())=>workflow('f4_vacancy_workflow',op,data,id),intake=(op:string,data:unknown,id=randomUUID())=>workflow('f4_intake_workflow',op,data,id);
  const pub=async()=>(await f.db.query<{v:unknown[]}>(`select public.f4_vacancies(${q(site)})v`)).rows[0].v;
  const me=async()=>intakeOwnSchema.parse((await f.db.query<{v:unknown}>(`select public.f4_intake_me(${q(site)})v`)).rows[0].v);
  const detail=async(id:string)=>intakeDetailSchema.parse((await f.db.query<{v:unknown}>(`select public.f4_intake_application(${q(site)},${q(id)})v`)).rows[0].v);
  await actor(f.ids.chair);await workflow('f4_workflow','access.assign',{person_id:f.ids.otherPerson,proof_document_id:f.ids.proof,valid_until:until,may_view:true});
  const form=await intake('form.create',{category:'volunteer_application',slug:'testfixture-vacancy',version:1,title:'TESTFIXTURE NIET PUBLICEREN',notice_version:'TEST-v1',notice_body:'TESTFIXTURE treatment only, no marketing.',legal_basis:'TESTFIXTURE no real basis',retention_policy:'TESTFIXTURE no real policy',policy_document_id:f.ids.policyDoc,opens_at:new Date(Date.now()-1000).toISOString(),closes_at:until});
  await intake('form.open',{id:form.id,policy_confirmed:true,reason:'TESTFIXTURE'});await vacancy('site.configure',{enabled:true,reason:'TESTFIXTURE'});
  await actor(f.ids.member);assert.equal((await me()).forms.length,0);assert.deepEqual(await pub(),[]);await assert.rejects(f.db.query('select * from private.vacancy_revisions'),/permission denied/);
  const payload={slug:'testfixture-vacancy',locale:'nl-BE',title:'TESTFIXTURE NIET PUBLICEREN',role_label:'TESTFIXTURE helper',summary:'TESTFIXTURE',body:{format:'plain_text',value:'TESTFIXTURE <script>literal text</script>'},location_label:'TESTFIXTURE',availability_label:'TESTFIXTURE',closes_at:until};
  const publish=async(revision:number,dossier:string|null,epoch:number)=>{
   await actor(f.ids.chair);const saved=await vacancy('vacancy.draft',{dossier_id:dossier,form_id:form.id,expected_revision:revision,payload:{...payload,title:payload.title+' '+(revision+1)},proof_document_id:f.ids.policyDoc});
   const state=(await f.db.query<{v:{revisions:{id:string;dossier_id:string;payload_sha256:string}[]}}>(`select public.f4_vacancy_admin(${q(site)})v`)).rows[0].v,r=state.revisions.find(r=>r.id===saved.id)!;assert(r);
   await vacancy('vacancy.submit',{id:saved.id,expected_hash:r.payload_sha256});await actor(f.ids.reviewer);await vacancy('vacancy.review',{id:saved.id,expected_hash:r.payload_sha256,decision:'approved',reason:'TESTFIXTURE independent',rights_confirmed:true});await actor(f.ids.chair);await vacancy('vacancy.release',{id:saved.id,expected_hash:r.payload_sha256,expected_epoch:epoch,reason:'TESTFIXTURE',published_at:null,valid_until:null});return r.dossier_id;
  };
  const dossier=await publish(0,null,0);await actor(f.ids.member);const v=vacancyPublicationSchema.parse((await pub())[0]);assert.equal(v.revision,1);assert.equal((await me()).forms[0].vacancies![0].public_id,v.public_id);
  const input={form_id:form.id,notice_version:'TEST-v1',notice_acknowledged:true,payload:{vacancy_public_id:v.public_id,expected_vacancy_revision:1,motivation:'TESTFIXTURE PRIVATE MOTIVATION',availability:'TESTFIXTURE'}};
  await assert.rejects(intake('application.submit',{...input,notice_acknowledged:false}),/invalid_input/);const request=randomUUID(),app=await intake('application.submit',input,request);assert.deepEqual(await intake('application.submit',input,request),app);
  const first=await detail(app.id);assert.equal(first.category,'volunteer_application');if(first.category==='volunteer_application')assert.equal(first.vacancy.revision,1);assert(!JSON.stringify(await pub()).includes('PRIVATE MOTIVATION'));
  await actor(f.ids.reviewer);await assert.rejects(f.db.query(`select public.f4_intake_admin_application(${q(site)},${q(app.id)})`),/not_authorized/);
  await publish(1,dossier,1);await actor(f.ids.member);await assert.rejects(intake('application.submit',input),/revision_conflict/);assert.equal((await detail(app.id)).category,'volunteer_application');
  await actor(f.ids.chair);const handler=await intake('handler.assign',{form_id:form.id,user_id:f.ids.reviewer,proof_document_id:f.ids.proof,valid_until:until});await vacancy('vacancy.close',{dossier_id:dossier,reason:'TESTFIXTURE closed'});
  await actor(f.ids.member);assert.deepEqual(await pub(),[]);await assert.rejects(intake('application.submit',{...input,payload:{...input.payload,expected_vacancy_revision:2}}),/not_open/);assert.deepEqual(await intake('application.submit',input,request),app);
  await actor(f.ids.reviewer);await intake('application.claim',{id:app.id,expected_version:1});await intake('application.update',{id:app.id,expected_version:2,status:'needs_information',own_message:'TESTFIXTURE question',internal_note:'TESTFIXTURE INTERNAL SECRET'});
  await actor(f.ids.member);const mine=await detail(app.id);assert(!JSON.stringify(mine).includes('INTERNAL SECRET'));assert.equal(mine.events[2].message,'TESTFIXTURE question');await intake('application.reply',{id:app.id,expected_version:3,message:'TESTFIXTURE reply'});await intake('application.withdraw',{id:app.id,expected_version:4});assert.equal((await detail(app.id)).status,'withdrawn');
  await actor(f.ids.chair);await intake('handler.revoke',{id:handler.id,reason:'TESTFIXTURE'});await actor(f.ids.reviewer);await assert.rejects(f.db.query(`select public.f4_intake_admin_application(${q(site)},${q(app.id)})`),/not_authorized/);
 }finally{await f.db.close();}
});
