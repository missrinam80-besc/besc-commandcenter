import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {f1Database,q,j} from './helpers/f1-database.mts';
import {runInstagramPublication,instagramPublicationScopes,type InstagramPublicationPorts} from '../src/lib/instagram-publication.ts';
import {instagramGraphProvider} from '../src/lib/instagram-publication-provider.ts';
import {verifyInstagramImage,instagramImageUrl} from '../src/lib/instagram-publication-image.ts';

let f:Awaited<ReturnType<typeof f1Database>>,post:string,account:string,session:string,image:Buffer,sha:string,url:string;
const sessions=new Map<string,string>();
const origin='https://media.example.invalid';
before(async()=>{f=await f1Database();image=await sharp({create:{width:320,height:400,channels:3,background:'#222222'}}).jpeg().toBuffer();sha=createHash('sha256').update(image).digest('hex');});
after(async()=>{await f?.db.close();});
async function actor(user=f.ids.admin,role='authenticated'){
 await f.owner();await f.actor(user,role);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:user,role,session_id:sessions.get(user)}))},false)`);
}
beforeEach(async()=>{
 await f.owner();await f.db.exec('begin');post=randomUUID();account=randomUUID();session=randomUUID();url=origin+`/social-publication/${f.ids.org}/${sha}.jpg`;
 sessions.set(f.ids.admin,session);sessions.set(f.ids.chair,randomUUID());
 await f.db.exec(`update auth.users set email_confirmed_at=now() where id in(${q(f.ids.admin)},${q(f.ids.chair)});insert into auth.sessions(id,user_id)values(${q(session)},${q(f.ids.admin)}),(${q(sessions.get(f.ids.chair))},${q(f.ids.chair)});
 update public.organization_members set finance_role='approver' where user_id=${q(f.ids.chair)} and organization_id=${q(f.ids.org)};`);
 await actor();await f.db.exec(`insert into public.social_accounts(id,organization_id,platform,account_name,external_account_id,status,granted_scopes,created_by)
 values(${q(account)},${q(f.ids.org)},'instagram','TESTFIXTURE - NIET PUBLICEREN','123','connected',array['instagram_basic','instagram_content_publish','pages_read_engagement'],${q(f.ids.admin)});
 insert into public.social_posts(id,organization_id,title,platform,copy,scheduled_at,instagram_account_id,instagram_target,instagram_image_url,instagram_image_sha256,created_by)
 values(${q(post)},${q(f.ids.org)},'TESTFIXTURE - NIET PUBLICEREN','Instagram','Fictief bijschrift',clock_timestamp()-interval '1 minute',${q(account)},${j({name:'TESTFIXTURE - NIET PUBLICEREN',external_id:'123'})},${q(url)},${q(sha)},${q(f.ids.admin)});`);
});
afterEach(async()=>{await f.db.exec('rollback');await f.owner();});
async function approve(){
 await actor();const approval=randomUUID();await f.db.exec(`insert into public.approval_requests(id,organization_id,entity_type,entity_id,title,module,source_href,requested_by)values(${q(approval)},${q(f.ids.org)},'social',${q(post)},'ignored','social','/ignored',${q(f.ids.admin)})`);
 await actor(f.ids.chair);
 const check=(await f.db.query<{saved:unknown;current:unknown}>(`select source_snapshot saved,private.social_review_snapshot(${q(f.ids.org)},${q(post)}) current from public.approval_requests where id=${q(approval)}`)).rows[0];assert.deepEqual(check.saved,check.current);
 await f.db.exec(`update public.approval_requests set status='approved',decided_by=${q(f.ids.chair)} where id=${q(approval)}`);await actor();return approval;
}
async function owner(action:string,job:string|null=null,o=f.ids.org){return(await f.db.query<{v:unknown}>(`select public.instagram_publication_owner(${q(o)},${q(post)},${q(action)},${job?q(job):'null'}) v`)).rows[0].v as {id:string;state:string};}
async function queue(){await approve();return(await owner('queue')).id;}
async function server(job:string,action:string,data:Record<string,unknown>={}){
 await actor(f.ids.admin,'service_role');await f.db.exec('savepoint rpc');
 try{const value=(await f.db.query<{v:unknown}>(`select public.instagram_publication_server(${q(job)},${q(action)},${j(data)}) v`)).rows[0].v;await f.db.exec('release savepoint rpc');return value;}
 catch(error){await f.db.exec('rollback to savepoint rpc;release savepoint rpc');throw error;}
}
async function denied(sql:string,pattern=/instagram|row-level security|permission denied/i){await f.db.exec('savepoint denied');try{await assert.rejects(f.db.exec(sql),pattern);}finally{await f.db.exec('rollback to denied;release savepoint denied');}}
type Mode='success'|'publish_timeout'|'create_timeout'|'receipt_mismatch'|'pending'|'quota'|'missing_scopes'|'wrong_app'|'malformed_quota'|'expired';
function flow(mode:Mode='success'){
 const requests:{path:string;method:string}[]=[],posts:string[]=[];let waits=0;
 const request:typeof fetch=async(raw,init)=>{
  const u=new URL(String(raw)),method=init?.method??'GET',path=u.pathname.split('/').at(-1)!;requests.push({path,method});if(method==='POST')posts.push(path);
  assert.equal(u.hostname,'graph.facebook.com');assert.equal(init?.redirect,'error');assert.ok(init?.signal);
  const reply=(body:unknown)=>Response.json(body);
  if(path==='debug_token')return reply({data:{is_valid:true,app_id:mode==='wrong_app'?'wrong':'fixture-app',type:'PAGE',scopes:mode==='missing_scopes'?[]:[...instagramPublicationScopes]}});
  assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fixture-token');
  if(path==='123')return reply({id:'123'});
  if(path==='content_publishing_limit')return reply(mode==='malformed_quota'?{data:[]}:{data:[{quota_usage:mode==='quota'?2:0,config:{quota_total:2,quota_duration:86400}}]});
  if(path==='media'){
   assert.equal(method,'POST');const body=init?.body as URLSearchParams;assert.equal(body.get('image_url'),url);assert.equal(body.get('caption'),'Fictief bijschrift');assert.equal(body.get('access_token'),null);
   if(mode==='create_timeout')throw Error('fixture-token lost response');return reply({id:'456'});
  }
  if(path==='456')return reply({status_code:mode==='pending'?'IN_PROGRESS':mode==='expired'?'EXPIRED':'FINISHED'});
  if(path==='media_publish'){
   assert.equal((init?.body as URLSearchParams).get('creation_id'),'456');if(mode==='publish_timeout')throw Error('fixture-token response lost after publish');return reply({id:'789'});
  }
  if(path==='789')return reply({id:'789',owner:{id:mode==='receipt_mismatch'?'999':'123'},permalink:'https://www.instagram.com/p/FIXTURE/'});
  throw Error('Unexpected outbound request');
 };
  const ports:InstagramPublicationPorts={server,credentials:async()=> 'fixture-token',verifyImage:job=>verifyInstagramImage(job,origin,async()=>new Response(new Uint8Array(image).buffer,{headers:{'Content-Type':'image/jpeg'}})),
  provider:instagramGraphProvider({apiVersion:'v25.0',appId:'fixture-app',appSecret:'fixture-secret'},request,true),wait:async(ms)=>{assert.equal(ms,60000);waits++;}};
 return {ports,requests,posts,waits:()=>waits};
}
test('Instagram: echte lokale concept/goedkeuring/planning/provider/ontvangst/historieketen publiceert eenmaal',async()=>{
 const job=await queue(),f1=flow();assert.deepEqual(await runInstagramPublication(job,f1.ports,true),{state:'published'});assert.deepEqual(f1.posts,['media','media_publish']);
 assert.deepEqual(await runInstagramPublication(job,f1.ports,true),{state:'skipped'});assert.equal(f1.posts.length,2);
 await actor();const history=await owner('list') as unknown as {state:string;permalink:string;events:{operation:string}[]}[];
 assert.equal(history.length,1);assert.equal(history[0].state,'published');assert.equal(history[0].permalink,'https://www.instagram.com/p/FIXTURE/');assert.deepEqual(history[0].events.map(e=>e.operation),['queued','claimed','created','dispatch_publish','complete']);
});
test('Instagram: standaard uitgeschakeld raakt geen database of provider',async()=>{
 const f1=flow();f1.ports.server=async()=>{throw Error('Must not read');};await assert.rejects(runInstagramPublication(randomUUID(),f1.ports),/disabled/);assert.equal(f1.requests.length,0);
 assert.throws(()=>instagramGraphProvider({apiVersion:'v25.0',appId:'x',appSecret:'x'},fetch),/disabled/);
});
test('Instagram: geen beoordeling, ontbrekende afbeelding en kanaalbundels kunnen niet in de queue',async()=>{
 await denied(`select public.instagram_publication_owner(${q(f.ids.org)},${q(post)},'queue')`);
 await f.db.exec(`update public.social_posts set bundle_kind='bundle',instagram_image_url=${q(url)} where id=${q(post)}`);await approve();
 await denied(`select public.instagram_publication_owner(${q(f.ids.org)},${q(post)},'queue')`,/image_post_required/);
 await f.db.exec(`update public.social_posts set instagram_image_url=null where id=${q(post)}`);await approve();
 await denied(`select public.instagram_publication_owner(${q(f.ids.org)},${q(post)},'queue')`);
});
test('Instagram: dubbele vrijgave gebruikt dezelfde job; annuleren vóór claim verhindert providerverzoeken',async()=>{
 const job=await queue();assert.equal((await owner('queue')).id,job);await owner('cancel',job);const f1=flow();assert.deepEqual(await runInstagramPublication(job,f1.ports,true),{state:'skipped'});assert.equal(f1.requests.length,0);
});
test('Instagram: toekomstige planning doet nog geen providerverzoek',async()=>{
 await f.db.exec(`update public.social_posts set scheduled_at=clock_timestamp()+interval '1 day' where id=${q(post)}`);const job=await queue(),f1=flow();assert.equal((await runInstagramPublication(job,f1.ports,true)).state,'skipped');assert.equal(f1.requests.length,0);
});
for(const mode of ['quota','missing_scopes','wrong_app','malformed_quota'] as const)test(`Instagram: ${mode} blokkeert vóór iedere muterende provideroproep`,async()=>{
 const job=await queue(),f1=flow(mode);assert.equal((await runInstagramPublication(job,f1.ports,true)).state,'failed');assert.deepEqual(f1.posts,[]);
});
for(const mode of ['create_timeout','publish_timeout','receipt_mismatch','expired','pending'] as const)test(`Instagram: ${mode} blijft onzeker zonder tweede publicatiepoging`,async()=>{
 const job=await queue(),f1=flow(mode);assert.equal((await runInstagramPublication(job,f1.ports,true)).state,'uncertain');const count=f1.posts.length;
 assert.equal((await runInstagramPublication(job,f1.ports,true)).state,'skipped');assert.equal(f1.posts.length,count);assert.equal(f1.posts.filter(p=>p==='media_publish').length,mode==='publish_timeout'||mode==='receipt_mismatch'?1:0);
 if(mode==='pending')assert.equal(f1.waits(),4);
 await actor();await denied(`update public.social_posts set copy='Changed' where id=${q(post)}`,/inflight/);await denied(`select public.instagram_publication_owner(${q(f.ids.org)},${q(post)},'cancel',${q(job)})`,/cannot_cancel/);
});
test('Instagram: beeldwijziging na goedkeuring maakt oude vrijgave ongeldig',async()=>{
 const job=await queue();await f.db.exec(`update public.social_posts set instagram_image_sha256=${q('a'.repeat(64))} where id=${q(post)}`);const f1=flow();assert.equal((await runInstagramPublication(job,f1.ports,true)).state,'blocked');assert.deepEqual(f1.posts,[]);
});
test('Instagram: doelaccount wijzigen na beoordeling blokkeert de oude doelkeuze',async()=>{
 await approve();await f.db.exec(`update public.social_accounts set external_account_id='999' where id=${q(account)}`);
 await denied(`select public.instagram_publication_owner(${q(f.ids.org)},${q(post)},'queue')`,/target_changed/);
});
test('Instagram: historische lege beeldvelden behouden de oude canonieke snapshotvorm',async()=>{
 await f.db.exec(`update public.social_posts set instagram_account_id=null,instagram_target=null,instagram_image_url=null,instagram_image_sha256=null where id=${q(post)}`);
 const row=(await f.db.query<{same:boolean}>(`select private.social_review_snapshot(${q(f.ids.org)},${q(post)})->'post'=(to_jsonb(s)-array['status','updated_at','instagram_account_id','instagram_target','instagram_image_url','instagram_image_sha256']) same from public.social_posts s where id=${q(post)}`)).rows[0];assert.equal(row.same,true);
});
test('Instagram: ingetrokken beheerdersrol blokkeert een opgeslagen job',async()=>{
 const job=await queue();await f.owner();await f.db.exec(`update public.organization_members set role='member' where organization_id=${q(f.ids.org)} and user_id=${q(f.ids.admin)}`);const f1=flow();assert.equal((await runInstagramPublication(job,f1.ports,true)).state,'blocked');assert.deepEqual(f1.posts,[]);
});
test('Instagram: verloren databasebevestiging na succes wordt alleen-lezen herkend zonder tweede POST',async()=>{
 const job=await queue(),f1=flow(),port=f1.ports.server;
 f1.ports.server=async(id,operation,data)=>{const saved=await port(id,operation,data);if(operation==='complete')throw Error('Lost database acknowledgement');return saved;};
 assert.equal((await runInstagramPublication(job,f1.ports,true)).state,'published');assert.deepEqual(f1.posts,['media','media_publish']);
});
test('Instagram: ingetrokken accountrechten tussen container en publicatie blokkeren het publicatieverzoek',async()=>{
 const job=await queue(),f1=flow(),port=f1.ports.server;
 f1.ports.server=async(id,operation,data)=>{const saved=await port(id,operation,data);if(operation==='created'){await f.owner();await f.db.exec(`update public.social_accounts set granted_scopes='{}' where id=${q(account)}`);}return saved;};
 assert.equal((await runInstagramPublication(job,f1.ports,true)).state,'uncertain');assert.deepEqual(f1.posts,['media']);
});
test('Instagram: ingetrokken sessie en accountrechten blokkeren een opgeslagen job vóór dispatch',async()=>{
 const job=await queue();await f.owner();await f.db.exec(`delete from auth.sessions where id=${q(session)}`);const f1=flow();assert.equal((await runInstagramPublication(job,f1.ports,true)).state,'blocked');assert.deepEqual(f1.requests,[]);
});
test('Instagram: due-selectie is begrensd tot de ingestelde organisatie en alleen verschuldigde jobs',async()=>{
 const job=await queue();await actor(f.ids.admin,'service_role');
 const read=async(o:string)=>(await f.db.query<{v:unknown}>(`select public.instagram_publication_server(null,'due',${j({organization_id:o})}) v`)).rows[0].v;
 assert.deepEqual(await read(f.ids.org),[{id:job}]);assert.deepEqual(await read(f.ids.otherOrg),[]);
});
test('Instagram: gewone leden, buitenlandse organisaties en directe private writes worden geweigerd',async()=>{
 await queue();await actor(f.ids.member);await denied(`select public.instagram_publication_owner(${q(f.ids.org)},${q(post)},'list')`,/access_denied/);
 await actor();await denied(`select public.instagram_publication_owner(${q(f.ids.otherOrg)},${q(post)},'list')`);
 for(const table of ['ig_publications','ig_publication_events'])await denied(`select * from private.${table}`,/permission denied/);
 await denied(`select public.instagram_publication_server(${q(randomUUID())},'read')`,/permission denied/);
});
test('Instagram: vervalste nonce of publicatiestatus kan geen ontvangstbewijs maken',async()=>{
 const job=await queue();await actor(f.ids.admin,'service_role');await denied(`select public.instagram_publication_server(${q(job)},'complete',${j({nonce:randomUUID(),media_id:'789',permalink:'https://www.instagram.com/p/FIXTURE/'})})`,/claim_required/);
});
test('Instagram: ontbrekende bytes, gewijzigde inhoud, PNG, redirectpad en ongeschikte afmetingen worden geweigerd',async()=>{
 const job={organization_id:f.ids.org,image_url:url,image_sha256:sha};
 await assert.rejects(verifyInstagramImage(job,origin,async()=>new Response('different',{headers:{'Content-Type':'image/jpeg'}})),/changed/);
 await assert.rejects(verifyInstagramImage(job,origin,async()=>new Response(new Uint8Array(image).buffer,{headers:{'Content-Type':'image/png'}})),/jpeg/);
 assert.throws(()=>instagramImageUrl('https://evil.invalid/a.jpg',f.ids.org,sha,origin),/managed/);
 assert.throws(()=>instagramImageUrl(url+'?token=secret',f.ids.org,sha,origin),/managed/);
 const small=await sharp({create:{width:100,height:100,channels:3,background:'white'}}).jpeg().toBuffer(),hash=createHash('sha256').update(small).digest('hex');
 await assert.rejects(verifyInstagramImage({...job,image_sha256:hash,image_url:origin+`/social-publication/${f.ids.org}/${hash}.jpg`},origin,async()=>new Response(new Uint8Array(small).buffer,{headers:{'Content-Type':'image/jpeg'}})),/dimensions/);
});
