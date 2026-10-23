import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {f1Database,q,j} from './helpers/f1-database.mts';
import {intakeOwnSchema,intakeDetailSchema} from '../src/lib/f4-intake-contract.ts';
test('Private intake: versioned notice, own receipt, scoped handler, messages, withdrawal and revoked access',async()=>{
 const f=await f1Database();try{
  const sessions=new Map<string,string>();for(const u of [f.ids.chair,f.ids.member,f.ids.reviewer,f.ids.admin]){const id=randomUUID();sessions.set(u,id);await f.owner();await f.db.exec(`update auth.users set email_confirmed_at=now() where id=${q(u)};insert into auth.sessions(id,user_id) values(${q(id)},${q(u)});`);}
  const actor=async(u:string)=>{await f.owner();await f.actor(u);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:u,role:'authenticated',session_id:sessions.get(u)}))},false)`);};
  const site=randomUUID(),key='TESTFIXTURE private intake key never used live';await f.owner();await f.db.exec(`insert into public.publication_sites(id,organization_id,host,active,key_sha256,created_by) values(${q(site)},${q(f.ids.org)},'website-dev.belgianstreamerscommunity.be',true,${q(createHash('sha256').update(key).digest('hex'))},${q(f.ids.chair)});update public.organization_members set status='pending' where user_id=${q(f.ids.member)} and organization_id=${q(f.ids.org)};`);
  await actor(f.ids.chair);const grant=(await f.db.query<{v:{id:string}}>(`select public.f4_workflow(${q(site)},'access.assign',${j({person_id:f.ids.otherPerson,proof_document_id:f.ids.proof,valid_until:new Date(Date.now()+3600000).toISOString(),may_view:false})},${q(randomUUID())}) v`)).rows[0].v;
  const call=async(op:string,data:unknown,r=randomUUID())=>(await f.db.query<{v:{id:string}}>(`select public.f4_intake_workflow(${q(site)},${q(op)},${j(data)},${q(r)}) v`)).rows[0].v;
  const me=async()=>intakeOwnSchema.parse((await f.db.query<{v:unknown}>(`select public.f4_intake_me(${q(site)}) v`)).rows[0].v);
  const detail=async(id:string)=>intakeDetailSchema.parse((await f.db.query<{v:unknown}>(`select public.f4_intake_application(${q(site)},${q(id)}) v`)).rows[0].v);
  const form=await call('form.create',{slug:'testfixture-partnership',version:1,title:'TESTFIXTURE NIET PUBLICEREN',notice_version:'TESTFIXTURE-v1',notice_body:'TESTFIXTURE aanvraagbehandeling, geen marketing of profielpublicatie.',legal_basis:'TESTFIXTURE, nog vast te stellen',retention_policy:'TESTFIXTURE, geen echte bewaarbehandeling',policy_document_id:f.ids.policyDoc,opens_at:new Date(Date.now()-1000).toISOString(),closes_at:new Date(Date.now()+3600000).toISOString()});
  await call('form.open',{id:form.id,policy_confirmed:true,reason:'TESTFIXTURE'});
  const handler=await call('handler.assign',{form_id:form.id,user_id:f.ids.reviewer,proof_document_id:f.ids.proof,valid_until:new Date(Date.now()+3600000).toISOString()});
  await actor(f.ids.member);assert.equal((await me()).forms.length,1);await assert.rejects(f.db.query('select * from private.platform_applications'),/permission denied/);
  const payload={organization_name:'TESTFIXTURE',requested_roles:['esports'],message:'TESTFIXTURE private motivation'};
  await assert.rejects(call('application.submit',{form_id:form.id,notice_version:'TESTFIXTURE-v1',notice_acknowledged:false,payload}),/invalid_input/);
  const input={form_id:form.id,notice_version:'TESTFIXTURE-v1',notice_acknowledged:true,payload},request=randomUUID();const app=await call('application.submit',input,request);assert.deepEqual(await call('application.submit',input,request),app);await assert.rejects(call('application.submit',{...input,payload:{...payload,message:'other'}},request),/conflict/);
  assert.equal((await me()).applications[0].status,'received');assert.equal((await detail(app.id)).form.notice_version,'TESTFIXTURE-v1');await assert.rejects(detail(randomUUID()),/not_authorized/);
  await actor(f.ids.chair);const state=(await f.db.query<{v:{applications:unknown[]}}>(`select public.f4_intake_admin(${q(site)}) v`)).rows[0].v;assert.equal(state.applications.length,0);await assert.rejects(f.db.query(`select public.f4_intake_admin_application(${q(site)},${q(app.id)})`),/not_authorized/);
  await actor(f.ids.admin);await assert.rejects(f.db.query(`select public.f4_intake_admin(${q(site)})`),/not_authorized/);
  await actor(f.ids.reviewer);await call('application.claim',{id:app.id,expected_version:1});await call('application.update',{id:app.id,expected_version:2,status:'needs_information',own_message:'TESTFIXTURE zichtbare vraag',internal_note:'TESTFIXTURE INTERNAL SECRET'});
  await actor(f.ids.member);const mine=await detail(app.id);assert.equal(mine.events[2].message,'TESTFIXTURE zichtbare vraag');assert(!JSON.stringify(mine).includes('INTERNAL SECRET'));assert(!JSON.stringify(mine).includes('assigned_user_id'));
  await call('application.reply',{id:app.id,expected_version:3,message:'TESTFIXTURE aanvulling'});await call('application.withdraw',{id:app.id,expected_version:4});assert.equal((await detail(app.id)).status,'withdrawn');
  await actor(f.ids.reviewer);await assert.rejects(call('application.update',{id:app.id,expected_version:5,status:'closed',own_message:'',internal_note:''}),/terminal_conflict/);
  await actor(f.ids.chair);await call('handler.revoke',{id:handler.id,reason:'TESTFIXTURE'});await f.db.query(`select public.f4_workflow(${q(site)},'access.revoke',${j({id:grant.id,reason:'TESTFIXTURE'})},${q(randomUUID())})`);
  await actor(f.ids.reviewer);await assert.rejects(f.db.query(`select public.f4_intake_admin_application(${q(site)},${q(app.id)})`),/not_authorized/);
  await actor(f.ids.member);await assert.rejects(me(),/not_authorized/);await assert.rejects(call('application.submit',input,request),/not_authorized/);
  await actor(f.ids.chair);await f.db.query(`select public.f4_workflow(${q(site)},'access.assign',${j({person_id:f.ids.otherPerson,proof_document_id:f.ids.proof,valid_until:new Date(Date.now()+3600000).toISOString(),may_view:false})},${q(randomUUID())})`);
  await actor(f.ids.member);assert.equal((await me()).applications.length,0);await assert.rejects(call('application.submit',input,request),/not_authorized/);
 }finally{await f.db.close();}
});
