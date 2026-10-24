import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {f1Database,q,j} from './helpers/f1-database.mts';
import {partnerPublicationSchema} from '../src/lib/f4-partner-contract.ts';
test('Partner publication: existing source roles, independent review, separate release, logo, source change and revocation',async()=>{
 const f=await f1Database();try{
  const sessions=new Map<string,string>();for(const u of [f.ids.chair,f.ids.reviewer,f.ids.member]){const id=randomUUID();sessions.set(u,id);await f.owner();await f.db.exec(`update auth.users set email_confirmed_at=now() where id=${q(u)};insert into auth.sessions(id,user_id) values(${q(id)},${q(u)});`);}
  const actor=async(u:string)=>{await f.owner();await f.actor(u);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:u,role:'authenticated',session_id:sessions.get(u)}))},false)`);};
  const site=randomUUID(),media=randomUUID(),key='TESTFIXTURE-partner-server-key-with-no-live-use';
  await f.owner();await f.db.exec(`update public.partners set status='active',website='https://example.invalid',email='private@example.invalid',notes='TESTFIXTURE PRIVATE',estimated_value=12345 where id=${q(f.ids.partner)};
  insert into public.publication_sites(id,organization_id,host,active,key_sha256,created_by) values(${q(site)},${q(f.ids.org)},'website-dev.belgianstreamerscommunity.be',true,${q(createHash('sha256').update(key).digest('hex'))},${q(f.ids.chair)});
  insert into public.publication_media(public_media_id,organization_id,site_id,document_id,storage_path,sha256,mime,bytes,width,height,created_by) values(${q(media)},${q(f.ids.org)},${q(site)},${q(f.ids.policyDoc)},${q(f.ids.org+'/'+media+'.png')},${q('a'.repeat(64))},'image/png',100,10,10,${q(f.ids.chair)});`);
  await actor(f.ids.chair);const role=await f.call('partner.role',{partner_id:f.ids.partner,role:'esports',proof_document_id:f.ids.policyDoc});
  await f.db.query(`select public.f2_workflow(${q(f.ids.org)},'viewer.add',${j({site_id:site,user_id:f.ids.member,eligibility:'crew',basis:'TESTFIXTURE',valid_until:new Date(Date.now()+3600000).toISOString()})},${q(randomUUID())})`);
  const call=async(op:string,data:unknown,id=randomUUID())=>(await f.db.query<{v:{id:string}}>(`select public.f4_partner_workflow(${q(site)},${q(op)},${j(data)},${q(id)}) v`)).rows[0].v;
  const pub=async(role:string|null=null)=>(await f.db.query<{v:unknown[]}>(`select public.f4_partners(${q(site)},null,'nl-BE',20,null,null,${role?q(role):'null'}) v`)).rows[0].v;
  await call('site.configure',{enabled:true,reason:'TESTFIXTURE'});
  const payload={slug:'testfixture-partner',locale:'nl-BE',name:'TESTFIXTURE Esports',description:'TESTFIXTURE NIET PUBLICEREN',roles:['esports'],website_url:'https://example.invalid',logo:{public_media_id:media,alt:'TESTFIXTURE logo',credit:''}};
  const d={partner_id:f.ids.partner,expected_revision:0,payload,role_ids:[role.id],proof_document_id:f.ids.policyDoc};
  await assert.rejects(call('partner.draft',{...d,payload:{...payload,roles:['sponsor']}}),/invalid/);
  const request=randomUUID(),saved=await call('partner.draft',d,request);assert.deepEqual(await call('partner.draft',d,request),saved);
  const state=(await f.db.query<{v:{revisions:{payload_sha256:string}[]}}>(`select public.f4_partner_admin(${q(site)}) v`)).rows[0].v,hash=state.revisions[0].payload_sha256;
  await call('partner.submit',{id:saved.id,expected_hash:hash});
  await f.call('identity.assign',{user_id:f.ids.chair,role:'publication_reviewer'});await assert.rejects(call('partner.review',{id:saved.id,expected_hash:hash,decision:'approved',reason:'TESTFIXTURE',rights_confirmed:true}),/independent/);
  await actor(f.ids.member);assert.deepEqual(await pub(),[]);await assert.rejects(f.db.query('select * from private.partner_publication_revisions'),/permission denied/);
  await actor(f.ids.reviewer);await call('partner.review',{id:saved.id,expected_hash:hash,decision:'approved',reason:'TESTFIXTURE independently reviewed',rights_confirmed:true});
  await actor(f.ids.chair);await call('partner.release',{id:saved.id,expected_hash:hash,expected_epoch:0,reason:'TESTFIXTURE',published_at:null,valid_until:null});
  await actor(f.ids.member);const list=await pub('esports');assert.equal(list.length,1);partnerPublicationSchema.parse(list[0]);assert(!JSON.stringify(list).includes('private@example.invalid'));assert(!JSON.stringify(list).includes('estimated_value'));assert.deepEqual(await pub('sponsor'),[]);
  const locate=async()=>(await f.db.query<{v:unknown}>(`select public.f4_partner_media_locator(${q(site)},${q(media)},${q(key)}) v`)).rows[0].v;assert(await locate());
  await actor(f.ids.chair);await f.call('partner.revoke',{id:role.id});await actor(f.ids.member);assert.deepEqual(await pub(),[]);assert.equal(await locate(),null);
  await actor(f.ids.chair);const newRole=await f.call('partner.role',{partner_id:f.ids.partner,role:'esports',proof_document_id:f.ids.policyDoc});assert(newRole.id);await actor(f.ids.member);assert.deepEqual(await pub(),[]);
  await actor(f.ids.chair);const second=await call('partner.draft',{...d,expected_revision:1,role_ids:[newRole.id]});
  const nextState=(await f.db.query<{v:{revisions:{id:string;payload_sha256:string}[]}}>(`select public.f4_partner_admin(${q(site)}) v`)).rows[0].v,hash2=nextState.revisions.find(r=>r.id===second.id)!.payload_sha256;
  await call('partner.submit',{id:second.id,expected_hash:hash2});await actor(f.ids.reviewer);await call('partner.review',{id:second.id,expected_hash:hash2,decision:'approved',reason:'TESTFIXTURE new version',rights_confirmed:true});
  await actor(f.ids.chair);await call('partner.release',{id:second.id,expected_hash:hash2,expected_epoch:1,reason:'TESTFIXTURE new release',published_at:null,valid_until:null});await actor(f.ids.member);assert.equal((await pub()).length,1);
  await f.owner();await f.db.exec(`update public.document_registry set url='https://example.invalid/changed-proof' where id=${q(f.ids.policyDoc)}`);
  await actor(f.ids.member);assert.deepEqual(await pub(),[]);assert.equal(await locate(),null);
  await f.owner();await f.db.exec(`update public.document_registry set url=${q('https://example.invalid/policyDoc')} where id=${q(f.ids.policyDoc)}`);await actor(f.ids.member);assert.deepEqual(await pub(),[]);

 }finally{await f.db.close();}
});
