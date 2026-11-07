import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {creatorApplicationModules} from './helpers/creator-youtube-application-modules.mjs';
import {f1Database,q,j} from './helpers/f1-database.mts';
const load=creatorApplicationModules();
const {CreatorYouTubeSession}=load('creator-youtube-session') as typeof import('../src/lib/creator-youtube-session.ts');
const {CreatorYouTubeGoogle}=load('creator-youtube-google') as typeof import('../src/lib/creator-youtube-google.ts');
const {CreatorYouTubeFileStore}=load('creator-youtube-file-store') as typeof import('../src/lib/creator-youtube-file-store.ts');
const {CreatorYouTubeKeyring}=load('creator-youtube-keyring') as typeof import('../src/lib/creator-youtube-keyring.ts');
const {createCreatorYouTubeApplication}=load('creator-youtube-application') as typeof import('../src/lib/creator-youtube-application.ts');
let f:Awaited<ReturnType<typeof f1Database>>;
const sessions=new Map<string,string>(),roots:string[]=[];
const origin='https://creator.fixture.invalid',supabase='https://creator-db.fixture.invalid',channel='UC'+'A'.repeat(22),video='abcdefghijk';
before(async()=>{f=await f1Database();await f.owner();for(const user of [f.ids.member,f.ids.admin,f.ids.other]){const session=randomUUID();sessions.set(user,session);await f.db.exec(`update auth.users set email_confirmed_at=now() where id=${q(user)};insert into auth.sessions(id,user_id) values(${q(session)},${q(user)})`);}await f.db.exec("create or replace function vault.create_secret(v text,n text,d text) returns uuid language plpgsql as $$declare x uuid:=gen_random_uuid();begin insert into vault.fixture_secrets values(x,v);return x;end$$;create or replace function vault.update_secret(x uuid,v text) returns void language plpgsql as $$begin update vault.fixture_secrets set decrypted_secret=v where id=x;end$$;");});
after(async()=>{await f.db.close();});
beforeEach(async()=>{await f.owner();await f.db.exec('truncate private.cy_links cascade');for(const [user,session]of sessions)await f.db.exec(`update auth.users set email_confirmed_at=now(),deleted_at=null,banned_until=null where id=${q(user)};update public.organization_members set status='active' where user_id=${q(user)};insert into auth.sessions(id,user_id) values(${q(session)},${q(user)}) on conflict do nothing;`);});
afterEach(async()=>{for(const root of roots.splice(0)){assert.equal(path.dirname(path.resolve(root)),path.resolve(tmpdir()));assert(path.basename(root).startsWith('besc-ca03-app-'));await rm(root,{recursive:true,force:true});}});
function jwt(user:string,session=sessions.get(user)!,extra:Record<string,unknown>={}){return Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user,session_id:session,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,...extra})).toString('base64url')+'.MOCK';}
async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'besc-ca03-app-'));roots.push(root);const attempts=await CreatorYouTubeFileStore.create(path.join(root,'attempts')),receipts=await CreatorYouTubeFileStore.create(path.join(root,'receipts')),keys=await CreatorYouTubeFileStore.create(path.join(root,'keys')),wrap=randomBytes(32),ringId=randomUUID();await CreatorYouTubeKeyring.initialize(keys,wrap,ringId);
 const registry=new Map([...sessions].map(([user])=>[jwt(user),user]));const tokens=new Map([...registry].map(([token,user])=>[user,token]));
 let actor:string=f.ids.member,token=tokens.get(actor)!,cookie='',authOk=true,revokeStatus=200,now=Date.now(),duringChannel:()=>Promise<void>=async()=>{},lostFinish=false;const log:{name:string;bearer:string;method:string;operation?:string}[]=[],providerCalls:string[]=[];
 const transport:typeof fetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,supabase);const headers=new Headers(init?.headers),bearer=(headers.get('Authorization')??'').replace(/^Bearer /,'');
  if(url.pathname==='/auth/v1/user'){
   const user=registry.get(bearer);log.push({name:'auth',bearer,method:init?.method??'GET'});
   return authOk&&user?Response.json({id:user,email:'fixture@example.invalid',email_confirmed_at:new Date().toISOString(),is_anonymous:false,aud:'authenticated',created_at:new Date().toISOString(),app_metadata:{},user_metadata:{role:'admin'}}):Response.json({message:'MOCK-PRIVATE-AUTH-ERROR'},{status:401});
  }
  assert.equal(init?.method,'POST');const name=url.pathname.split('/').at(-1)!;assert(['creator_youtube_owner','creator_youtube_server','creator_youtube_account'].includes(name));const args=JSON.parse(String(init?.body));const user=registry.get(bearer),service=bearer==='MOCK-SERVER-SECRET';assert(service||user);
  log.push({name,bearer,method:init!.method!,operation:args.p_operation});assert.equal(service,name==='creator_youtube_server');
  await f.owner();await f.db.exec('begin');
  try{
   await f.actor(user??f.ids.admin,service?'service_role':'authenticated');await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:user??f.ids.admin,role:service?'service_role':'authenticated',session_id:user?sessions.get(user):undefined}))},false)`);
   let sql:string;
   if(name==='creator_youtube_owner')sql=`select public.creator_youtube_owner(${q(args.p_org)},${q(args.p_operation)},${args.p_link?q(args.p_link):'null'},${j(args.p_data)}) v`;
   else if(name==='creator_youtube_account')sql=`select public.creator_youtube_account(${q(args.p_org)},${args.p_after?q(args.p_after):'null'},${Number(args.p_limit)}) v`;
   else sql=`select public.creator_youtube_server(${q(args.p_job)},${q(args.p_operation)},${j(args.p_data)}) v`;
   const value=(await f.db.query<{v:unknown}>(sql)).rows[0].v;await f.db.exec('commit');
   if(lostFinish&&args.p_operation==='finish'){lostFinish=false;throw Error('Lost committed finish acknowledgment');}
   return Response.json(value);
  }catch{await f.db.exec('rollback');await f.owner();return Response.json({message:'MOCK-PRIVATE-SQL-ERROR',code:'42501'},{status:400});}
 };
 const sdk=(key:string,accessToken?:string)=>createClient(supabase,key,{...(accessToken?{accessToken:async()=>accessToken}:{}),global:{fetch:transport},auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
 const browser=()=>createServerClient(supabase,'MOCK-PUBLISHABLE',{global:{fetch:transport},cookieOptions:{name:'creator-fixture-session'},cookies:{getAll:()=>[{name:'creator-fixture-session',value:'base64-'+Buffer.from(JSON.stringify({access_token:token,refresh_token:'MOCK-BESC-REFRESH',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:actor}})).toString('base64url')}],setAll:()=>{}}});
 const provider=async(url:string,init:RequestInit)=>{
  const u=new URL(url);providerCalls.push(u.pathname);
  if(u.pathname==='/token'){
   if(new URLSearchParams(String(init.body)).get('grant_type')==='authorization_code'){await f.owner();const rows=await f.db.query<{dispatch_state:string}>('select dispatch_state from private.cy_jobs where kind=\'authorize\' and not used');assert.equal(rows.rows[0].dispatch_state,'started');}
   return Response.json({token_type:'Bearer',expires_in:3600,access_token:'MOCK-YT-ACCESS',refresh_token:'MOCK-YT-REFRESH',scope:'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly'});
  }
  if(u.pathname==='/youtube/v3/channels'){await duringChannel();return Response.json({items:[{id:channel}]});}
  if(u.pathname==='/v2/reports')return Response.json({columnHeaders:[{name:'video',columnType:'DIMENSION',dataType:'STRING'},{name:'views',columnType:'METRIC',dataType:'INTEGER'},{name:'estimatedMinutesWatched',columnType:'METRIC',dataType:'FLOAT'},{name:'averageViewDuration',columnType:'METRIC',dataType:'FLOAT'}],rows:[[video,0,null,2.5]]});
  if(u.pathname==='/revoke')return new Response(null,{status:revokeStatus});throw Error('Unexpected provider endpoint');
 };
 const app=async()=>{const session=new CreatorYouTubeSession(browser(),bearer=>sdk('MOCK-PUBLISHABLE',bearer),()=>sdk('MOCK-SERVER-SECRET'),f.ids.org,true);return createCreatorYouTubeApplication({session,google:new CreatorYouTubeGoogle({clientId:'fixture.apps.googleusercontent.com',clientSecret:'MOCK-YT-SECRET',redirectUri:origin+'/auth/creator-youtube/callback',isolatedProject:true},provider,()=>now,true),attempts,receipts,cipher:await CreatorYouTubeKeyring.open(keys,wrap,ringId),origin,now:()=>now},true);};
 const save=(response:Response)=>{const next=response.headers.get('Set-Cookie');if(next)cookie=next.includes('Max-Age=0')?'':next.split(';')[0];return response;};
 const consent={accepted:true,purpose:'TESTFIXTURE - NIET PUBLICEREN - package 2',channel_id:channel,video_ids:[video],start_date:'2026-11-01',end_date:'2026-11-06',valid_until:new Date(now+86400000).toISOString(),retain_until:new Date(now+172800000).toISOString()};
 const action=async(input:unknown)=>save(await(await app()).action(new Request(origin+'/api/creator-youtube',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(input)})));
 const status=async(query='')=>(await app()).status(new Request(origin+'/api/creator-youtube'+query,{headers:{Cookie:cookie}}));
 const callback=async(state:string,query='code=MOCK-CODE')=>save(await(await app()).callback(new Request(origin+'/auth/creator-youtube/callback?state='+state+'&'+query,{headers:{Cookie:cookie}})));
 const start=async()=>{const r=await action({action:'start',consent});assert.equal(r.status,200);const data=await r.json();return{link:data.link as string,state:new URL(data.authorizationUrl).searchParams.get('state')!};};
 return{action,status,callback,start,consent,log,providerCalls,cookie:()=>cookie,changeActor:(user:string)=>{actor=user;token=tokens.get(user)!;},badToken:(extra:Record<string,unknown>)=>{token=jwt(actor,sessions.get(actor),extra);},auth:(v:boolean)=>{authOk=v;},revoke:(v:number)=>{revokeStatus=v;},onChannel:(fn:()=>Promise<void>)=>{duringChannel=fn;},loseFinish:()=>{lostFinish=true;},setNow:(v:number)=>{now=v;},now:()=>now,app,root,wrap,ringId,browser,sdk,transport,provider};
}

test('CA03 application: actual SDK, own SQL, status, capture, refresh and withdrawal form one request-scoped chain',async()=>{
 const a=await fixture();assert.deepEqual((await(await a.status()).json()).account.links,[]);const r=await a.start();assert(a.cookie());let status=await(await a.status()).json();assert.equal(status.pending.link,r.link);assert.equal(status.account.links[0].status,'pending');assert(!JSON.stringify(status).includes('MOCK'));
 assert.match((await a.callback(r.state)).headers.get('Location')!,/completed$/);assert.equal(a.cookie(),'');status=await(await a.status('?link='+r.link)).json();assert.equal(status.link.status,'active');assert.equal(status.pending,null);
 assert.equal((await a.action({action:'collect',link:r.link})).status,200);status=await(await a.status('?link='+r.link)).json();assert.equal(status.link.samples[0].value,0);assert(status.link.samples.some((v:{quality:string;value:unknown})=>v.quality==='missing'&&v.value===null));assert(!JSON.stringify(status).includes('MOCK-YT'));
 assert.equal((await a.action({action:'prepare-refresh',link:r.link})).status,200);assert(a.cookie());assert.equal((await(await a.action({action:'refresh'})).json()).status,'completed');assert.equal(a.cookie(),'');assert.equal((await(await a.action({action:'disconnect',link:r.link})).json()).provider,'complete');assert.equal((await(await a.status('?link='+r.link)).json()).link.status,'revoked');
 assert(a.log.filter(v=>v.name==='creator_youtube_owner'||v.name==='creator_youtube_account').every(v=>JSON.parse(Buffer.from(v.bearer.split('.')[1],'base64url').toString()).sub===f.ids.member));assert(a.log.filter(v=>v.name==='creator_youtube_server').every(v=>v.bearer==='MOCK-SERVER-SECRET'&&v.method==='POST'));
});

test('CA03 application: denial and cancellation close SQL exactly once with no provider request',async()=>{for(const deny of [true,false]){const a=await fixture(),r=await a.start();if(deny)assert.match((await a.callback(r.state,'error=access_denied')).headers.get('Location')!,/cancelled$/);else assert.equal((await(await a.action({action:'cancel'})).json()).provider,'none');assert.equal(a.cookie(),'');assert.equal(a.providerCalls.length,0);assert.equal((await(await a.status('?link='+r.link)).json()).link.provider_revocation,'none');await f.owner();assert.equal((await f.db.query<{n:number}>(`select count(*)::int n from private.cy_authorization_closures where link_id=${q(r.link)}`)).rows[0].n,1);}});

test('CA03 application: account/session switches cannot use the encrypted request or another owner link',async()=>{const a=await fixture(),r=await a.start();a.changeActor(f.ids.other);assert.equal((await a.status()).status,400);assert.match((await a.callback(r.state)).headers.get('Location')!,/not_confirmed$/);assert.equal((await a.action({action:'cancel'})).status,400);assert.equal(a.providerCalls.length,0);a.changeActor(f.ids.member);assert.equal((await(await a.action({action:'cancel'})).json()).provider,'none');a.changeActor(f.ids.admin);assert.deepEqual((await(await a.status()).json()).account.links,[]);assert.equal((await a.status('?link='+r.link)).status,400);assert.equal((await a.action({action:'collect',link:r.link})).status,400);});

test('CA03 application: unverified, expired and forged-role bearer stop before owner and service RPC',async()=>{for(const invalid of ['auth','expiry','role','sub']){const a=await fixture();if(invalid==='auth')a.auth(false);else a.badToken(invalid==='expiry'?{exp:1}:invalid==='role'?{role:'service_role'}:{sub:f.ids.admin});assert.equal((await a.status()).status,400);assert.equal((await a.action({action:'start',consent:a.consent})).status,400);assert.equal(a.log.filter(v=>v.name!=='auth').length,0);assert.equal(a.providerCalls.length,0);}});

for(const invalid of ['session','membership','confirmation'])test('CA03 application: SQL '+invalid+' is authoritative even if mock Auth accepts bearer',async()=>{const a=await fixture();await f.owner();await f.db.exec(invalid==='session'?`delete from auth.sessions where id=${q(sessions.get(f.ids.member))}`:invalid==='membership'?`update public.organization_members set status='suspended' where user_id=${q(f.ids.member)}`:`update auth.users set email_confirmed_at=null where id=${q(f.ids.member)}`);assert.equal((await a.status()).status,400);assert.equal((await a.action({action:'start',consent:a.consent})).status,400);assert.equal(a.providerCalls.length,0);});

test('CA03 application: unvalidated captured answers remain honestly pending after restart without replaying exchange',async()=>{const a=await fixture(),r=await a.start();a.revoke(503);a.onChannel(async()=>{throw Error('MOCK-PRIVATE-PROVIDER-ERROR');});assert.match((await a.callback(r.state)).headers.get('Location')!,/not_confirmed$/);assert(a.cookie());assert.equal((await(await a.status()).json()).pending.status,'cleanup_pending');a.revoke(200);const recovered=await a.action({action:'recover'});assert.equal((await recovered.json()).provider,'pending');assert(a.cookie());assert.equal(a.providerCalls.filter(v=>v==='/token').length,1);assert.equal((await(await a.status('?link='+r.link)).json()).link.status,'revoked');});

test('CA03 application: a committed finish with lost HTTP acknowledgment never repeats token exchange',async()=>{const a=await fixture(),r=await a.start();a.loseFinish();assert.match((await a.callback(r.state)).headers.get('Location')!,/not_confirmed$/);assert(a.cookie());const recovered=await a.action({action:'recover'});assert.equal((await recovered.json()).provider,'complete');assert.equal(a.providerCalls.filter(v=>v==='/token').length,1);assert.equal((await(await a.status('?link='+r.link)).json()).link.status,'revoked');});

test('CA03 application: stale, duplicate or foreign status selectors cannot broaden account reads',async()=>{const a=await fixture(),r=await a.start();for(const query of ['?after=no','?link='+r.link+'&link='+r.link,'?link='+r.link+'&after='+r.link,'?p_org='+f.ids.otherOrg])assert.equal((await a.status(query)).status,400);assert.equal((await a.status('?link='+randomUUID())).status,400);assert.equal(a.providerCalls.length,0);});

test('CA03 application: expiry of an unused browser request is explicit and retires its SQL cleanup',async()=>{const a=await fixture(),r=await a.start();a.setNow(a.now()+300001);assert.match((await a.callback(r.state)).headers.get('Location')!,/expired$/);assert.equal(a.cookie(),'');assert.equal(a.providerCalls.length,0);assert.equal((await(await a.status('?link='+r.link)).json()).link.provider_revocation,'none');});

test('CA03 application: own account listing paginates without duplicates or other-owner metadata',async()=>{
 const a=await fixture();for(let i=0;i<25;i++){
  await f.owner();await f.actor(f.ids.member);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:f.ids.member,role:'authenticated',session_id:sessions.get(f.ids.member)}))},false)`);
  await f.db.query(`select public.creator_youtube_owner(${q(f.ids.org)},'consent',null,${j({...a.consent,request_id:randomUUID(),purpose:'TESTFIXTURE - NIET PUBLICEREN - '+i,channel_id:'UC'+String(i).padStart(22,'A')})})`);
 }
 const first=(await(await a.status()).json()).account;assert.equal(first.links.length,20);assert(first.next_after);const second=(await(await a.status('?after='+first.next_after)).json()).account;assert.equal(second.links.length,5);assert.equal(second.next_after,null);assert.equal(new Set([...first.links,...second.links].map(v=>v.id)).size,25);assert(!JSON.stringify(first).includes('request_id'));a.changeActor(f.ids.admin);assert.deepEqual((await(await a.status()).json()).account.links,[]);
});

test('CA03 application: account RPC is denied to anon/service role and rejects unbounded limits',async()=>{
 for(const role of ['anon','service_role']){await f.owner();await f.actor(f.ids.member,role);await assert.rejects(f.db.query(`select public.creator_youtube_account(${q(f.ids.org)})`),/permission denied/);}
 await f.owner();await f.actor(f.ids.member);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:f.ids.member,role:'authenticated',session_id:sessions.get(f.ids.member)}))},false)`);
 for(const limit of ['null','0','21'])await assert.rejects(f.db.query(`select public.creator_youtube_account(${q(f.ids.org)},null,${limit})`),/cy_invalid_input/);
});

test('CA03 application: a session change within the request is rejected before privileged work',async()=>{
 const a=await fixture(),r=await a.start();a.onChannel(async()=>{a.changeActor(f.ids.other);});assert.match((await a.callback(r.state)).headers.get('Location')!,/not_confirmed$/);assert.equal(a.providerCalls.filter(v=>v==='/token').length,1);a.changeActor(f.ids.member);assert.equal((await(await a.status('?link='+r.link)).json()).link.status,'pending');assert(a.cookie());
});

test('CA03 runtime: disabled routes and missing private configuration have no session/provider side effects',async()=>{
 const saved={...process.env};try{
  let calls=0;const run=creatorApplicationModules({'./supabase/server':{createClient:()=>{calls++;throw Error('No session allowed');}},'./supabase/admin':{createAdminClient:()=>{calls++;throw Error('No admin allowed');}},'./supabase/url':{getSupabaseServerUrl:()=>supabase},__fetch:()=>{calls++;throw Error('No provider allowed');}})('creator-youtube-runtime') as typeof import('../src/lib/creator-youtube-runtime.ts');
  delete process.env.BESC_CREATOR_YOUTUBE_ENABLED;delete process.env.BESC_CREATOR_YOUTUBE_CONFIG_FILE;
  for(const op of ['action','callback','status'] as const)assert.equal((await run.creatorYouTubeRoute(new Request(origin+'/api/creator-youtube'),op)).status,503);
  process.env.BESC_CREATOR_YOUTUBE_ENABLED='true';assert.equal((await run.creatorYouTubeRoute(new Request(origin+'/api/creator-youtube'),'status')).status,503);assert.equal(calls,0);
 }finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});

test('CA03 runtime: explicit private synthetic files connect the same real SDK and SQL chain without auto-initialization',async()=>{
 const a=await fixture(),saved={...process.env},secretRoot=await mkdtemp(path.join(tmpdir(),'besc-ca03-app-'));roots.push(secretRoot);
 const configFile=path.join(secretRoot,'creator.json'),keyFile=path.join(secretRoot,'wrap.key');await chmod(secretRoot,0o700);await chmod(a.root,0o700);await writeFile(keyFile,a.wrap.toString('base64url'),{mode:0o600});
 const config={organizationId:f.ids.org,origin,storageRoot:a.root,wrappingKeyFile:keyFile,keyringId:a.ringId,google:{clientId:'fixture.apps.googleusercontent.com',clientSecret:'MOCK-YT-SECRET',isolatedProject:true}};await writeFile(configFile,JSON.stringify(config),{mode:0o600});
 try{
  Object.assign(process.env,{BESC_CREATOR_YOUTUBE_ENABLED:'true',BESC_CREATOR_YOUTUBE_CONFIG_FILE:configFile,NEXT_PUBLIC_SITE_URL:origin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'MOCK-PUBLISHABLE'});
  const run=creatorApplicationModules({'./supabase/server':{createClient:a.browser},'./supabase/admin':{createAdminClient:()=>a.sdk('MOCK-SERVER-SECRET')},'./supabase/url':{getSupabaseServerUrl:()=>supabase},'@supabase/supabase-js':{createClient:(_url:string,key:string,options:{accessToken:()=>Promise<string>})=>createClient(supabase,key,{...options,global:{fetch:a.transport}})},__fetch:a.provider})('creator-youtube-runtime') as typeof import('../src/lib/creator-youtube-runtime.ts');
  const response=await run.creatorYouTubeRoute(new Request(origin+'/api/creator-youtube'),'status');assert.equal(response.status,200);assert.deepEqual((await response.json()).account.links,[]);assert.equal(a.providerCalls.length,0);
  await writeFile(configFile,JSON.stringify({...config,keyringId:randomUUID()}),{mode:0o600});assert.equal((await run.creatorYouTubeRoute(new Request(origin+'/api/creator-youtube'),'status')).status,503);
 }finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
