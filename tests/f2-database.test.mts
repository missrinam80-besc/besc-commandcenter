import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {f1Database,q,j} from './helpers/f1-database.mts';
let f:Awaited<ReturnType<typeof f1Database>>,site:string;
const key='TESTFIXTURE-server-only-key-0123456789';
const sessions=new Map<string,string>();
async function actor(id:string){await f.owner();await f.actor(id);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:id,role:'authenticated',session_id:sessions.get(id)}))},false)`);}
async function call(op:string,data:unknown,request=randomUUID(),org=f.ids.org){return(await f.db.query<{v:{id:string}}>(`select public.f2_workflow(${q(org)},${q(op)},${j(data)},${q(request)}) v`)).rows[0].v;}
async function read(type='news',slug:string|null=null){return(await f.db.query<{v:Record<string,unknown>[]}>(`select public.f2_publications(${q(site)},${q(type)},${slug===null?'null':q(slug)}) v`)).rows[0].v;}
async function deny(sql:string,pattern=/f2_|permission denied|violates|invalid/){await f.db.exec('savepoint denied');await assert.rejects(f.db.exec(sql),pattern);await f.db.exec('rollback to denied');}
async function denied(op:string,data:unknown){await f.db.exec('savepoint denied');await assert.rejects(call(op,data),/f2_|permission denied|violates|invalid/);await f.db.exec('rollback to denied');}
const payload=(title='TESTFIXTURE — NIET PUBLICEREN')=>({title,summary:'TESTFIXTURE',body:{format:'sanitized_html',value:'<p>TESTFIXTURE</p>'},slug:'testfixture-f2',locale:'nl-BE',media:[]});
async function revision(type='news',extra={},document?:string){
 await actor(f.ids.chair);const p={...payload(),...(type==='event'?{starts_at:'2030-01-01T12:00:00Z',ends_at:'2030-01-01T13:00:00Z',timezone:'Europe/Brussels',location_label:'TESTFIXTURE',registration_url:''}:{}),...extra};
 const result=await f.call('publication.draft',{source_type:type,source_id:type==='news'?f.ids.content:f.ids.event,expected_revision:1,payload:p,...(document?{media_rights_document_id:document}:{})});
 const row=(await f.db.query<{payload_sha256:string}>(`select payload_sha256 from public.publication_revisions where id=${q(result.id)}`)).rows[0];
 await f.call('publication.submit',{id:result.id,expected_hash:row.payload_sha256});await actor(f.ids.reviewer);
 await f.call('publication.review',{id:result.id,expected_hash:row.payload_sha256,decision:'approved_for_publication',reason:'TESTFIXTURE akkoord',rights_confirmed:true});
 return {revision_id:result.id,expected_hash:row.payload_sha256};
}
async function release(extra={}){const r=await revision();return call('release',{site_id:site,...r,expected_epoch:0,reason:'TESTFIXTURE staging',...extra});}
before(async()=>{
 f=await f1Database();await f.owner();
 for(const id of [f.ids.chair,f.ids.member,f.ids.reviewer,f.ids.volunteer,f.ids.admin,f.ids.other]){const session=randomUUID();sessions.set(id,session);await f.db.exec(`update auth.users set email_confirmed_at=clock_timestamp() where id=${q(id)};insert into auth.sessions(id,user_id) values(${q(session)},${q(id)})`);}
 await actor(f.ids.chair);site=(await call('site.create',{host:'website-dev.belgianstreamerscommunity.be',key_sha256:createHash('sha256').update(key).digest('hex')})).id;
 await call('site.state',{site_id:site,active:true});
 for(const [id,eligibility] of [[f.ids.member,'crew'],[f.ids.chair,'crew'],[f.ids.reviewer,'volunteer']] as const) await call('viewer.add',{site_id:site,user_id:id,eligibility,basis:'TESTFIXTURE expliciet aangewezen',valid_until:new Date(Date.now()+86400000).toISOString()});
 await f.owner();
});
after(async()=>await f?.db.close());
beforeEach(async()=>{await f.db.exec('begin');await actor(f.ids.chair);});
afterEach(async()=>{await f.db.exec('rollback');await f.owner();});
test('F2: complete news release, safe projection, withdraw and replay cannot resurrect',async()=>{
 const r=await revision(),data={site_id:site,...r,expected_epoch:0,reason:'TESTFIXTURE'},request=randomUUID();
 const e=await call('release',data,request);await actor(f.ids.member);const list=await read();assert.equal(list.length,1);assert.equal(list[0].title,payload().title);assert.equal(list[0].public_id,e.id);
 assert.deepEqual(Object.keys(list[0]).sort(),['schema_version','type','public_id','revision','slug','locale','title','summary','body','media','published_at'].sort());
 await actor(f.ids.reviewer);await call('withdraw',{entry_id:e.id,expected_epoch:1,reason:'TESTFIXTURE intrekking'});await call('release',data,request);
 await actor(f.ids.member);assert.equal((await read()).length,0);
});
test('F2: new draft does not inherit approval; atomic replacement preserves public ID',async()=>{
 const e=await release();await actor(f.ids.chair);const d=await f.call('publication.draft',{source_type:'news',source_id:f.ids.content,expected_revision:1,payload:payload('TESTFIXTURE revisie twee')});
 const hash=(await f.db.query<{h:string}>(`select payload_sha256 h from public.publication_revisions where id=${q(d.id)}`)).rows[0].h;
 await actor(f.ids.reviewer);await denied('release',{site_id:site,revision_id:d.id,expected_hash:hash,expected_epoch:1,reason:'TESTFIXTURE'});
 await actor(f.ids.member);assert.equal((await read())[0].revision,1);
 await actor(f.ids.chair);await f.call('publication.submit',{id:d.id,expected_hash:hash});await actor(f.ids.reviewer);await f.call('publication.review',{id:d.id,expected_hash:hash,decision:'approved_for_publication',reason:'TESTFIXTURE',rights_confirmed:true});
 assert.equal((await call('release',{site_id:site,revision_id:d.id,expected_hash:hash,expected_epoch:1,reason:'TESTFIXTURE'})).id,e.id);
 await actor(f.ids.member);assert.equal((await read())[0].revision,2);
});
test('F2: readers, unlisted admin, wrong tenant, anon and server roles have no write bypass',async()=>{
 for(const id of [f.ids.member,f.ids.admin,f.ids.volunteer,f.ids.other]){await actor(id);await denied('site.state',{site_id:site,active:true});await denied('release',{});}
 await actor(f.ids.admin);await deny(`select public.f2_publications(${q(site)},'news')`);
 await actor(f.ids.member);await deny(`select public.f2_workflow(${q(f.ids.otherOrg)},'site.state',${j({site_id:site,active:true})},${q(randomUUID())})`);
 for(const role of ['anon','service_role']){await f.owner();await f.db.exec(`set role ${role}`);await deny(`select public.f2_publications(${q(site)},'news')`);}
});
test('F2: roster revocation, banned/deleted/unconfirmed users and revoked sessions block reads',async()=>{
 await release();await actor(f.ids.member);assert.equal((await read()).length,1);
 for(const sql of [`update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=${q(f.ids.member)}`,`update auth.users set email_confirmed_at=null where id=${q(f.ids.member)}`,`update auth.users set deleted_at=clock_timestamp() where id=${q(f.ids.member)}`,`delete from auth.sessions where user_id=${q(f.ids.member)}`,`update public.publication_site_viewers set revoked_at=clock_timestamp() where user_id=${q(f.ids.member)}`]){
  await f.owner();await f.db.exec('savepoint change');await f.db.exec(sql);await actor(f.ids.member);await deny(`select public.f2_publications(${q(site)},'news')`);await f.owner();await f.db.exec('rollback to change');
 }
});
test('F2: windows, expected epoch, site-off and source archiving fail closed',async()=>{
 const e=await release({published_at:new Date(Date.now()+3600000).toISOString()});await actor(f.ids.member);assert.equal((await read()).length,0);
 await actor(f.ids.reviewer);await denied('withdraw',{entry_id:e.id,expected_epoch:99,reason:'TESTFIXTURE'});
 await f.owner();await f.db.exec(`update public.publication_entries set published_at=clock_timestamp()-interval '2 hour',valid_until=clock_timestamp()-interval '1 hour' where public_id=${q(e.id)}`);await actor(f.ids.member);assert.equal((await read()).length,0);
 await f.owner();await f.db.exec(`update public.publication_entries set valid_until=null where public_id=${q(e.id)}`);await actor(f.ids.member);assert.equal((await read()).length,1);
 await f.owner();await f.db.exec(`update public.content_items set deleted_at=clock_timestamp() where id=${q(f.ids.content)}`);await actor(f.ids.member);assert.equal((await read()).length,0);
});
test('F2: event response retains exact event values and no private source fields',async()=>{
 const r=await revision('event');await call('release',{site_id:site,...r,expected_epoch:0,reason:'TESTFIXTURE'});await actor(f.ids.member);
 const row=(await read('event'))[0];assert.equal(row.starts_at,'2030-01-01T12:00:00Z');assert.equal(row.timezone,'Europe/Brussels');assert.equal(row.registration_url,null);assert(!('source_id'in row));
});
test('F2: direct tables and private media Storage cannot be read or mutated by viewer',async()=>{
 await actor(f.ids.member);for(const t of ['publication_sites','publication_entries','publication_site_viewers','publication_release_events','publication_media'])assert.equal((await f.db.query(`select * from public.${t}`)).rows.length,0);
 await deny(`insert into public.publication_sites(organization_id,host,key_sha256,created_by) values(${q(f.ids.org)},'website-dev.belgianstreamerscommunity.be',repeat('a',64),${q(f.ids.member)})`);
 await deny(`select public.f2_media_locator(${q(site)},${q(randomUUID())},'wrong')`);
});
test('F2: unsafe inputs, invalid time window and changed request payload rejected atomically',async()=>{
 await actor(f.ids.chair);await denied('site.state',{site_id:site,active:true,private_field:'bad'});
 const r=await revision();await denied('release',{site_id:site,...r,expected_epoch:0,published_at:'2030-01-01T12:00:00Z',valid_until:'2030-01-01T11:00:00Z',reason:'TESTFIXTURE'});
 const req=randomUUID(),d={site_id:site,...r,expected_epoch:0,reason:'TESTFIXTURE'};await call('release',d,req);await f.db.exec('savepoint denied');await assert.rejects(call('release',{...d,reason:'TESTFIXTURE anders'},req),/f2_request_conflict/);await f.db.exec('rollback to denied');
});
test('F2: registered media has an opaque projection, server-proof locator and a restrictive Storage fence',async()=>{
 const id=randomUUID(),path=f.ids.org+'/'+id+'.webp';await f.owner();
 await f.db.exec(`insert into storage.objects(bucket_id,name,metadata) values('website-staging-media',${q(path)},${j({size:10,mimetype:'image/webp'})});grant select on storage.objects to authenticated;create policy fixture_broad_storage_read on storage.objects for select to authenticated using(true)`);
 await actor(f.ids.chair);await call('media.register',{site_id:site,public_media_id:id,document_id:f.ids.policyDoc,storage_path:path,sha256:'a'.repeat(64),mime:'image/webp',bytes:10,width:10,height:10});
 const r=await revision('news',{media:[{url:'https://website-dev.belgianstreamerscommunity.be/media/'+id,alt:'TESTFIXTURE afbeelding',credit:'TESTFIXTURE'}]},f.ids.policyDoc);
 await call('release',{site_id:site,...r,expected_epoch:0,reason:'TESTFIXTURE'});await actor(f.ids.member);
 const items=await read();assert.equal(items.length,1);assert.deepEqual(items[0].media,[{public_media_id:id,alt:'TESTFIXTURE afbeelding',credit:'TESTFIXTURE'}]);
 assert.equal((await f.db.query(`select * from storage.objects where bucket_id='website-staging-media'`)).rows.length,0);
 await deny(`select public.f2_media_locator(${q(site)},${q(id)},'wrong')`);
 const locator=(await f.db.query<{v:{path:string}}>(`select public.f2_media_locator(${q(site)},${q(id)},${q(key)}) v`)).rows[0].v;assert.equal(locator.path,path);
 await actor(f.ids.chair);await call('media.withdraw',{public_media_id:id,reason:'TESTFIXTURE'});await actor(f.ids.member);assert.equal((await read()).length,0);
 assert.equal((await f.db.query<{v:unknown}>(`select public.f2_media_locator(${q(site)},${q(id)},${q(key)}) v`)).rows[0].v,null);
});
