import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import type * as Twitch from '../src/lib/twitch-integration.ts';
import type * as TwitchWorker from '../src/lib/twitch-sync.ts';
import type * as YouTubeWorker from '../src/lib/youtube-sync.ts';
import type * as MetaWorker from '../src/lib/meta-sync.ts';
const native=createRequire(import.meta.url);
function load<T>(name:string,mocks:Record<string,unknown>,fetcher:typeof fetch=async()=>{throw Error('Ambient network forbidden');}):T{
 const compiled={exports:{}};
 runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {module:compiled,exports:compiled.exports,Date,Error,URLSearchParams,fetch:fetcher,process:{env:{TWITCH_CLIENT_ID:'fixture-client',TWITCH_CLIENT_SECRET:'fixture-secret',NEXT_PUBLIC_SITE_URL:'https://example.test',SUPABASE_SECRET_KEY:'fixture-service'}},require:(key:string)=>key==='server-only'?{}:key in mocks?mocks[key]:native(key)});
 return compiled.exports as T;
}
const json=(body:unknown,status=200)=>Response.json(body,{status});
function integration(options:{scheduleStatus?:number;scheduleBody?:unknown;validateStatus?:number;networkFailure?:boolean}={}){
 const calls:string[]=[],stores:unknown[]=[];
 let validations=0;
 const api=load<typeof Twitch>('twitch-integration',{'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name:string,args:unknown)=>{
  if(name==='read_social_account_credentials')return {data:{access_token:'fixture-access',refresh_token:'fixture-refresh',expires_at:null},error:null};
  stores.push(args);return {data:null,error:null};
 }})}},async(url)=>{
  const path=String(url);calls.push(path);
  if(path.endsWith('/validate')){
   validations++;
   if(options.networkFailure)throw Error('TESTFIXTURE transport unavailable');
   const status=validations===1?options.validateStatus??200:200;
   return json(status===200?{user_id:'fixture-user',client_id:'fixture-client',scopes:[],expires_in:3600}:{message:'TESTFIXTURE failure'},status);
  }
  if(path.endsWith('/token'))return json({access_token:'fixture-new-access',refresh_token:'fixture-new-refresh',expires_in:3600});
  if(path.includes('/schedule?'))return json(options.scheduleBody??{data:{segments:[]}},options.scheduleStatus??200);
  if(path.includes('/users?'))return json({data:[{id:'fixture-user',login:'fixture',display_name:'TESTFIXTURE'}]});
  if(path.includes('/channels?')||path.includes('/streams?'))return json({data:[]});
  throw Error('Unexpected provider URL');
 });
 return {api,calls,stores};
}
test('Twitch: gedocumenteerde 404 zonder planning blijft een geldige lege planning',async()=>{
 const f=integration({scheduleStatus:404});const result=await f.api.fetchTwitchOperationalData('fixture-access','fixture-user');
 assert.equal(result.scheduleSegments.length,0);assert.equal(result.stream,null);
});
for(const status of [401,403,429,500,503])test(`Twitch: planningsfout ${status} wordt geen geldige nul`,async()=>{
 const f=integration({scheduleStatus:status});await assert.rejects(f.api.fetchTwitchOperationalData('fixture-access','fixture-user'));
});
test('Twitch: onvolledig geslaagd antwoord wordt niet als lege planning geaccepteerd',async()=>{
 const f=integration({scheduleBody:{data:{}}});await assert.rejects(f.api.fetchTwitchOperationalData('fixture-access','fixture-user'),/onvolledige/);
});
test('Twitch: tijdelijke validatiefout vernieuwt of overschrijft geen token',async()=>{
 for(const options of [{validateStatus:429},{validateStatus:503},{networkFailure:true}]){
  const f=integration(options);await assert.rejects(f.api.usableTwitchCredentials('fixture-account'));
  assert.equal(f.calls.length,1);assert.equal(f.stores.length,0);
 }
});
test('Twitch: bevestigde 401 vernieuwt eenmaal, bewaart rotatie en valideert het nieuwe token',async()=>{
 const f=integration({validateStatus:401});const result=await f.api.usableTwitchCredentials('fixture-account');
 assert.equal(result.user_id,'fixture-user');assert.equal(result.access_token,'fixture-new-access');assert.equal(f.stores.length,1);
 assert.match(JSON.stringify(f.stores),/fixture-new-refresh/);assert.equal(f.calls.filter(u=>u.endsWith('/token')).length,1);assert.equal(f.calls.filter(u=>u.endsWith('/validate')).length,2);
});
type Write={table:string;operation:string;value:Record<string,unknown>|Record<string,unknown>[]};
function worker(platform:'youtube'|'twitch'|'facebook'|'instagram',options:{quota?:boolean;oldQuota?:boolean;duplicate?:boolean;race?:boolean;providerError?:boolean;partial?:boolean;statistics?:Record<string,unknown>;analytics?:unknown;operationalData?:typeof Twitch.fetchTwitchOperationalData}={}){
 const writes:Write[]=[],calls:string[]=[];
 const account={id:'fixture-account',organization_id:'fixture-org',external_account_id:'fixture-channel',account_name:'TESTFIXTURE',platform,status:'connected',sync_interval_minutes:1440,
  quota_daily_limit:options.quota?0:10,quota_used_estimate:options.oldQuota?10:0,quota_counter_date:options.oldQuota?'2000-01-01':new Date().toISOString().slice(0,10)};
 const admin={from(table:string){let operation='read',value:Write['value']={};const query={
  select(){return query;},eq(){return query;},is(){return query;},in(){return query;},
  insert(v:Write['value']){operation='insert';value=v;writes.push({table,operation,value});return query;},
  update(v:Write['value']){operation='update';value=v;writes.push({table,operation,value});return query;},
  async maybeSingle(){return {data:operation==='update'?(options.race?null:{id:account.id}):table==='social_accounts'?account:options.duplicate?{id:'existing-run',status:'succeeded',records_written:3}:null,error:null};},
  async single(){return {data:{id:'fixture-run'},error:null};},
  then(done:(result:unknown)=>void){done({data:null,error:null});}
 };return query;}};
 const credentials=async()=>{calls.push('credentials');return {access_token:'fixture',user_id:'fixture-user',scopes:[],expires_at:null};};
 const fetchChannel=async()=>{calls.push('provider');if(options.providerError)throw Error('TESTFIXTURE provider failure');return {id:'fixture-channel',snippet:{title:'TESTFIXTURE'},statistics:options.statistics??{viewCount:'0',subscriberCount:'2',videoCount:'3'}};};
 const metaData=async()=>{calls.push('provider');if(options.providerError)throw Error('TESTFIXTURE provider failure');return {profile:{name:'TESTFIXTURE',username:'TESTFIXTURE',fan_count:0,followers_count:2,follows_count:0,media_count:3},measurements:[{metric:'views',value:0,periodStart:null,periodEnd:null}],insights:[{name:'reach',total_value:{value:0}}],insightError:options.partial?'TESTFIXTURE insight unavailable':null};};
 const mocks={'@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@/lib/meta-integration':{usableMetaCredentials:credentials,fetchFacebookMetrics:metaData,fetchInstagramMetrics:metaData},
  '@/lib/meta-token-diagnostics':{metaPermissionSummary:()=>{throw Error('Unexpected permission diagnostic');}},
  '@/lib/meta-insights':load('meta-insights',{}),
  '@/lib/youtube-integration':{usableYouTubeCredentials:credentials,fetchYouTubeChannel:fetchChannel,fetchYouTubeAnalytics:async()=>options.analytics??{columnHeaders:[],rows:[]}},
  '@/lib/twitch-integration':{usableTwitchCredentials:credentials,fetchTwitchOperationalData:options.operationalData??(async()=>{calls.push('provider');if(options.providerError)throw Error('TESTFIXTURE provider failure');return {user:{id:'fixture-user',login:'fixture',display_name:'TESTFIXTURE'},stream:null,scheduleSegments:[]};})}};
 const api=platform==='youtube'?load<typeof YouTubeWorker>('youtube-sync',mocks):platform==='twitch'?load<typeof TwitchWorker>('twitch-sync',mocks):load<typeof MetaWorker>('meta-sync',mocks);
 return {writes,calls,run:()=>('syncYouTubeAccountById' in api?api.syncYouTubeAccountById:'syncTwitchAccountById' in api?api.syncTwitchAccountById:api.syncMetaAccountById)(account.id,'scheduled')};
}
test('Twitch: echte adapterfouten bereiken de worker, behouden oude actualiteit en markeren alleen 401 verlopen',async()=>{
 for(const status of [401,403,429,503]){
  const provider=integration({scheduleStatus:status});const f=worker('twitch',{operationalData:provider.api.fetchTwitchOperationalData});
  await assert.rejects(f.run());assert.equal(f.writes.some(w=>w.table==='social_metric_snapshots'),false);
  assert.equal(f.writes.some(w=>!Array.isArray(w.value)&&'last_sync_at'in w.value),false);
  assert.ok(f.writes.some(w=>w.table==='social_accounts'&&!Array.isArray(w.value)&&w.value.last_error&&w.value.status===(status===401?'expired':'connected')));
 }
});
test('Twitch: adapter en worker accepteren 404 zonder planning met geldige nulmetingen',async()=>{
 const provider=integration({scheduleStatus:404});const f=worker('twitch',{operationalData:provider.api.fetchTwitchOperationalData});
 assert.equal((await f.run()).status,'succeeded');const rows=f.writes.find(w=>w.table==='social_metric_snapshots')!.value as Record<string,unknown>[];
 assert.equal(rows.find(r=>r.normalized_metric==='scheduled_streams')?.metric_value,0);
});
for(const platform of ['youtube','twitch','facebook','instagram'] as const){
 test(`${platform}: quotalimiet en reserveringsrace raken provider niet`,async()=>{
  for(const options of [{quota:true},{race:true}]){const f=worker(platform,options);await assert.rejects(f.run());assert.equal(f.calls.length,0);assert.equal(f.writes.some(w=>w.table==='social_metric_snapshots'),false);assert.ok(f.writes.some(w=>!Array.isArray(w.value)&&w.value.status==='failed'));}
 });
 test(`${platform}: nieuwe dag reset interne reservering en echte nul blijft nul`,async()=>{
  const f=worker(platform,{oldQuota:true});assert.equal((await f.run()).status,'succeeded');
  const quota=f.writes.find(w=>w.table==='social_accounts'&&!Array.isArray(w.value)&&'quota_used_estimate'in w.value)!;
  assert.equal((quota.value as Record<string,unknown>).quota_used_estimate,platform==='youtube'?2:platform==='instagram'?3:5);
  const rows=f.writes.find(w=>w.table==='social_metric_snapshots')!.value as Record<string,unknown>[];assert.ok(rows.some(r=>r.metric_value===0));
 });
 test(`${platform}: dubbele run doet geen providerverzoek of schrijfopdracht`,async()=>{
  const f=worker(platform,{duplicate:true});assert.equal((await f.run()).status,'skipped');assert.equal(f.writes.length,0);assert.equal(f.calls.length,0);
 });
 test(`${platform}: storing ververst actualiteit niet; volgende geslaagde run wist de fout`,async()=>{
  const bad=worker(platform,{providerError:true});await assert.rejects(bad.run());assert.equal(bad.writes.some(w=>!Array.isArray(w.value)&&'last_sync_at'in w.value),false);assert.ok(bad.writes.some(w=>!Array.isArray(w.value)&&w.value.status==='failed'));
  const good=worker(platform);await good.run();assert.ok(good.writes.some(w=>!Array.isArray(w.value)&&w.value.last_error===null&&typeof w.value.last_sync_at==='string'));
 });
}
for(const platform of ['facebook','instagram'] as const)test(`${platform}: gedeeltelijke inzichten blijven een gedeeltelijke run met foutopvolging`,async()=>{
 const f=worker(platform,{partial:true});assert.equal((await f.run()).status,'partial');
 assert.ok(f.writes.some(w=>w.table==='social_metric_snapshots'));
 assert.ok(f.writes.some(w=>!Array.isArray(w.value)&&w.value.status==='partial'&&w.value.error_message));
 assert.ok(f.writes.some(w=>w.table==='social_accounts'&&!Array.isArray(w.value)&&w.value.last_error));
});
test('YouTube: ontbrekende kanaalteller is gedeeltelijk en wordt geen kunstmatige nul',async()=>{
 const f=worker('youtube',{statistics:{viewCount:'0',videoCount:'3'}});assert.equal((await f.run()).status,'partial');
 const rows=f.writes.find(w=>w.table==='social_metric_snapshots')!.value as Record<string,unknown>[];assert.equal(rows.length,2);assert.equal(rows.some(r=>r.normalized_metric==='subscribers'),false);assert.ok(f.writes.some(w=>!Array.isArray(w.value)&&w.value.status==='partial'&&w.value.error_message));
});
test('YouTube: ongeldige tellers en ongeldige Analytics-cijfers schrijven geen snapshots',async()=>{
 for(const options of [{statistics:{viewCount:''}},{statistics:{viewCount:'NaN'}},{statistics:{viewCount:'-1'}},{analytics:{columnHeaders:[{name:'views'}],rows:[['NaN']]}}]){
  const f=worker('youtube',options);await assert.rejects(f.run());assert.equal(f.writes.some(w=>w.table==='social_metric_snapshots'),false);
 }
});
