import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {f1Database,q,j} from './helpers/f1-database.mts';

test('F4 creator: external own account, scoped consent, independent review, release, private media and withdrawal',async()=>{
 const f=await f1Database();try{
  const sessions=new Map<string,string>();for(const user of [f.ids.chair,f.ids.member,f.ids.reviewer,f.ids.admin]){const id=randomUUID();sessions.set(user,id);await f.owner();await f.db.exec(`update auth.users set email_confirmed_at=now() where id=${q(user)};insert into auth.sessions(id,user_id) values(${q(id)},${q(user)});`);}
  const actor=async(user:string)=>{await f.owner();await f.actor(user);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:user,role:'authenticated',session_id:sessions.get(user)}))},false)`);};
  const key='TESTFIXTURE-key-that-never-contacts-a-provider',site=randomUUID(),media=randomUUID();
  await f.owner();await f.db.exec(`insert into public.publication_sites(id,organization_id,host,active,key_sha256,created_by) values(${q(site)},${q(f.ids.org)},'website-dev.belgianstreamerscommunity.be',true,${q(createHash('sha256').update(key).digest('hex'))},${q(f.ids.chair)});update public.organization_members set status='pending' where organization_id=${q(f.ids.org)} and user_id=${q(f.ids.member)};
  insert into public.publication_media(public_media_id,organization_id,site_id,document_id,storage_path,sha256,mime,bytes,width,height,created_by) values(${q(media)},${q(f.ids.org)},${q(site)},${q(f.ids.policyDoc)},${q(f.ids.org+'/'+media+'.png')},${q('a'.repeat(64))},'image/png',100,10,10,${q(f.ids.chair)});`);
  const call=async(op:string,data:unknown,request=randomUUID())=>(await f.db.query<{v:{id:string}}>(`select public.f4_workflow(${q(site)},${q(op)},${j(data)},${q(request)}) v`)).rows[0].v;
  const me=async()=>(await f.db.query<{v:Record<string,unknown>}>(`select public.f4_me(${q(site)}) v`)).rows[0].v;
  const pub=async()=>(await f.db.query<{v:Record<string,unknown>[]}>(`select public.f4_creators(${q(site)}) v`)).rows[0].v;
  await actor(f.ids.chair);await call('site.configure',{own_enabled:true,read_enabled:true,reason:'TESTFIXTURE local configuration'});
  const access=await call('access.assign',{person_id:f.ids.otherPerson,valid_until:new Date(Date.now()+3600000).toISOString(),may_view:true,proof_document_id:f.ids.proof});
  const purpose=await f.call('consent.purpose',{purpose_code:'public_profile',text_version:1,title:'TESTFIXTURE public profile',body:'TESTFIXTURE only; explicit selected public profile fields.',allowed_scope:{fields:['display_name','bio','platform_links','disciplines','languages','avatar']},legal_basis:'TESTFIXTURE',retention_policy:'TESTFIXTURE only',policy_document_id:f.ids.policyDoc});await f.call('consent.activate_purpose',{id:purpose.id,policy_confirmed:true});
  await f.db.query(`select public.f2_workflow(${q(f.ids.org)},'viewer.add',${j({site_id:site,user_id:f.ids.reviewer,eligibility:'crew',basis:'TESTFIXTURE viewer',valid_until:new Date(Date.now()+3600000).toISOString()})},${q(randomUUID())})`);
  await actor(f.ids.member);await assert.rejects(f.db.query('select * from private.platform_access'),/permission denied/);
  const request=randomUUID(),payload={slug:'testfixture-creator',locale:'nl-BE',display_name:'TESTFIXTURE — NIET PUBLICEREN',bio:'Private until this field is explicitly selected',platform_links:[{platform:'twitch',url:'https://www.twitch.tv/testfixture'}],avatar:{public_media_id:media,alt:'TESTFIXTURE avatar',credit:''}};
  const saved=await call('profile.save',{expected_revision:0,payload},request);assert.deepEqual(await call('profile.save',{expected_revision:0,payload},request),saved);
  await assert.rejects(call('profile.save',{expected_revision:0,payload:{...payload,bio:'different'}},request),/request_conflict/);
  const own=await me();assert.equal(own.revision,1);
  await assert.rejects(call('consent.give',{purpose_id:purpose.id,scope:{fields:['display_name']},accepted:false}),/personal_confirmation/);
  const consent=await call('consent.give',{purpose_id:purpose.id,scope:{fields:['display_name','platform_links','avatar']},accepted:true});
  const draft=(own.revisions as {id:string;payload_sha256:string}[])[0];await call('profile.submit',{id:draft.id,expected_hash:draft.payload_sha256,consent_id:consent.id});
  const submitted=((await me()).revisions as {id:string;payload_sha256:string;payload:Record<string,unknown>}[])[0];assert(!('bio' in submitted.payload));
  await assert.rejects(call('profile.review',{id:submitted.id,expected_hash:submitted.payload_sha256,decision:'approved',reason:'No own review',rights_confirmed:true}),/not_authorized/);
  await actor(f.ids.reviewer);await assert.rejects(me(),/not_authorized/);assert.equal((await f.db.query<{v:boolean}>(`select public.f4_review_media(${q(site)},${q(submitted.id)},${q(media)}) v`)).rows[0].v,true);await assert.rejects(f.db.query(`select public.f4_preview_locator(${q(site)},${q(submitted.id)},${q(media)})`),/permission denied/);await call('profile.review',{id:submitted.id,expected_hash:submitted.payload_sha256,decision:'approved',reason:'TESTFIXTURE independent review',rights_confirmed:true});
  await actor(f.ids.chair);await call('profile.release',{id:submitted.id,expected_hash:submitted.payload_sha256,expected_epoch:0,reason:'TESTFIXTURE staging only'});
  await actor(f.ids.reviewer);const records=await pub();assert.equal(records.length,1);assert(!('bio' in records[0]));assert(!('user_id' in records[0]));assert(!('person_id' in records[0]));
  const locator=async(k:string)=>(await f.db.query<{v:unknown}>(`select public.f4_media_locator(${q(site)},${q(media)},${q(k)}) v`)).rows[0].v;
  assert(await locator(key));await assert.rejects(locator('wrong'),/not_authorized/);
  await actor(f.ids.admin);await assert.rejects(pub(),/not_authorized/);
  await actor(f.ids.member);await call('consent.withdraw',{id:consent.id,reason:'TESTFIXTURE withdrawal'});
  await actor(f.ids.reviewer);assert.deepEqual(await pub(),[]);assert.equal(await locator(key),null);
  await actor(f.ids.chair);await call('access.revoke',{id:access.id,reason:'TESTFIXTURE cleanup'});
  await actor(f.ids.member);await assert.rejects(me(),/not_authorized/);await assert.rejects(call('profile.save',{expected_revision:0,payload},request),/not_authorized/);
 }finally{await f.db.close();}
});
