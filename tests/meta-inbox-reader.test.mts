import test from 'node:test';
import assert from 'node:assert/strict';
import {createMetaInboxReader,MetaInboxReadError,type MetaInboxSelection} from '../src/lib/meta-inbox-reader.ts';
import {receiveMetaInbox,type MetaInboxAccess,type MetaInboxReceivePorts} from '../src/lib/meta-inbox-receive.ts';
import {socialInboxMetaRequirements} from '../src/lib/social-inbox.ts';
export const selection=(platform:'instagram'|'facebook'='instagram',kind:'direct'|'comment'='direct'):MetaInboxSelection=>({organization_id:'11111111-1111-4111-8111-111111111111',account_id:'22222222-2222-4222-8222-222222222222',platform,external_account_id:platform==='instagram'?'123':'456',page_id:'456',kind,resources:kind==='comment'?['900']:[]});
const token='fixture-token',secret='fixture-app-secret',config={apiVersion:'v25.0',appId:'100',appSecret:secret};
const json=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
type Override=(path:string,url:URL,init:RequestInit|undefined)=>Response|Promise<Response>|undefined;
export function fixture(target=selection(),override?:Override,limits:Record<string,number>={}){
 const calls:{path:string;url:URL;init:RequestInit|undefined}[]=[];
 const incoming=(id='m1')=>({id,created_time:'2026-01-01T12:00:00+0000',from:{id:'77',name:'TESTFIXTURE bezoeker'},to:{data:[{id:target.external_account_id}]},message:'TESTFIXTURE - NIET PUBLICEREN',attachments:{data:[]}});
 const request:typeof fetch=async(input,init)=>{
  const url=new URL(String(input)),path=url.pathname.replace('/v25.0/','');calls.push({path,url,init});
  assert.equal(url.origin,'https://graph.facebook.com');assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');assert.ok(init?.signal);
  const h=new Headers(init?.headers);assert.equal(h.get('authorization'),'Bearer '+(path==='debug_token'?'100|'+secret:token));
  const response=await override?.(path,url,init);if(response)return response;
  if(path==='debug_token')return json({data:{is_valid:true,app_id:'100',type:'PAGE',profile_id:'456',scopes:socialInboxMetaRequirements(target.platform,target.kind),expires_at:0}});
  if(path==='456')return json({id:'456',instagram_business_account:{id:'123'}});
  if(path==='456/conversations')return json({data:[{id:'thread1',participants:{data:[{id:target.external_account_id},{id:'77'}]}}]});
  if(path==='thread1/messages')return json({data:[incoming()]});
  if(path==='900')return json({id:'900',from:{id:'456'},owner:{id:'123'}});
  if(path==='900/comments')return json({data:[{id:'comment1',from:{id:'77',name:'Fictieve bezoeker',username:'fixture'},message:'TESTFIXTURE reactie',text:'TESTFIXTURE reactie',created_time:'2026-01-01T12:00:00+0000',timestamp:'2026-01-01T12:00:00Z'}]});
  if(path==='comment1/comments'||path==='comment1/replies')return json({data:[]});
  throw Error('Unexpected mocked path '+path);
 };
 return{target,calls,incoming,reader:createMetaInboxReader({...config,...limits},request,true),request};
}
async function rejects(f:ReturnType<typeof fixture>,code:string){await assert.rejects(f.reader.read(f.target,token),e=>e instanceof MetaInboxReadError&&e.code===code&&!e.message.includes(token)&&!e.message.includes(secret));}
const next=(path:string,after:string)=>({next:'https://graph.facebook.com/v25.0/'+path+'?access_token=fixture-token&after='+after,cursors:{after}});

for(const platform of ['instagram','facebook'] as const)for(const kind of ['direct','comment'] as const)test(`Meta-leesadapter: ${platform} ${kind} controleert eigen Page en slaat alleen genormaliseerde inkomende tekst op`,async()=>{
 const f=fixture(selection(platform,kind)),r=await f.reader.read(f.target,token);assert.equal(r.complete,true);assert.equal(r.messages.length,1);assert.equal(r.messages[0].kind,kind);assert.equal(r.messages[0].occurred_at,'2026-01-01T12:00:00.000Z');assert.equal(r.requests,f.calls.length);assert(!JSON.stringify(r).includes(token));assert(!f.calls.some(c=>c.url.hostname!=='graph.facebook.com'));
 if(kind==='direct'){assert.equal(f.calls.find(c=>c.path.endsWith('/conversations'))?.url.searchParams.get('platform'),platform==='instagram'?'instagram':'messenger');}
});
test('Meta-leesadapter: standaard uit en ongeldige configuratie veroorzaken geen verzoek',()=>{
 let n=0;const transport:typeof fetch=async()=>{n++;throw Error();};assert.throws(()=>createMetaInboxReader(config,transport),/disabled/);assert.throws(()=>createMetaInboxReader({...config,apiVersion:'https://evil.invalid'},transport,true),/invalid_configuration/);assert.equal(n,0);
});
test('Meta-leesadapter: pagineert gesprekken en berichten met opnieuw opgebouwde URL en filtert uitgaande tekst',async()=>{
 const f=fixture(selection(),(path,url)=>{
  if(path==='456/conversations'&&!url.searchParams.has('after'))return json({data:[{id:'thread1',participants:{data:[{id:'123'},{id:'77'}]}}],paging:next(path,'conv2')});
  if(path==='456/conversations')return json({data:[{id:'thread2',participants:{data:[{id:'77'},{id:'123'}]}}]});
  if(path==='thread1/messages')return json(url.searchParams.has('after')?{data:[f.incoming('m2')]}:{data:[f.incoming()],paging:next(path,'messages2')});
  if(path==='thread2/messages')return json({data:[{...f.incoming('m3'),from:{id:'123'},to:{data:[{id:'77'}]}}]});
 });
 const r=await f.reader.read(f.target,token);assert.equal(r.messages.length,2);assert.equal(r.skippedOutgoing,1);assert.equal(r.pages,5);
 for(const c of f.calls.filter(c=>c.path!=='debug_token'))assert.equal(c.url.searchParams.get('access_token'),null);
});
test('Meta-leesadapter: reacties en antwoordreacties blijven gekoppeld aan het geverifieerde bronobject',async()=>{
 const f=fixture(selection('instagram','comment'),(path)=>path==='comment1/replies'?json({data:[{id:'reply1',text:'TESTFIXTURE antwoordreactie',timestamp:'2026-01-01T13:00:00Z',from:{id:'78',username:'fixture'}}]}):undefined);
 const r=await f.reader.read(f.target,token);assert.equal(r.messages.length,2);assert(r.messages.every(m=>m.thread_id==='900'));assert.deepEqual(r.messages.map(m=>m.message_id),['comment1','reply1']);
});
test('Meta-leesadapter: identieke berichten op twee pagina’s worden eenmalig aangeboden',async()=>{
 const f=fixture(selection(),(path,url)=>path==='thread1/messages'?json({data:[f.incoming()],...(!url.searchParams.has('after')?{paging:next(path,'second')}:{})}):undefined);
 assert.equal((await f.reader.read(f.target,token)).messages.length,1);
});
test('Meta-leesadapter: hetzelfde bericht-ID met gewijzigde tekst wordt niet overschreven',async()=>{
 const f=fixture(selection(),path=>path==='thread1/messages'?json({data:[f.incoming(),{...f.incoming(),message:'Wijziging'}]}):undefined);await rejects(f,'duplicate_conflict');
});
for(const mode of ['wrong_app','wrong_page','expired','missing_scopes','wrong_type'] as const)test(`Meta-leesadapter: ${mode} blokkeert vóór gesprekken of reacties`,async()=>{
 const f=fixture(selection(),path=>path==='debug_token'?json({data:{is_valid:true,app_id:mode==='wrong_app'?'999':'100',type:mode==='wrong_type'?'USER':'PAGE',profile_id:mode==='wrong_page'?'999':'456',scopes:mode==='missing_scopes'?[]:socialInboxMetaRequirements('instagram','direct'),expires_at:mode==='expired'?1:0}}):undefined);
 await rejects(f,mode==='missing_scopes'?'permissions_required':mode==='wrong_app'||mode==='wrong_page'?'account_mismatch':'token_invalid');assert.equal(f.calls.length,1);
});
test('Meta-leesadapter: verkeerd gekoppeld Instagram-account, ander bronobject en vreemde gesprekspartner worden geweigerd',async()=>{
 await rejects(fixture(selection(),path=>path==='456'?json({id:'456',instagram_business_account:{id:'999'}}):undefined),'account_mismatch');
 await rejects(fixture(selection('facebook','comment'),path=>path==='900'?json({id:'900',from:{id:'999'}}):undefined),'resource_mismatch');
 await rejects(fixture(selection(),path=>path==='456/conversations'?json({data:[{id:'thread1',participants:{data:[{id:'999'},{id:'77'}]}}]}):undefined),'account_mismatch');
});
for(const mode of ['foreign_origin','changed_path','missing_cursor','loop','wrong_cursor'] as const)test(`Meta-leesadapter: onveilige paginering ${mode} wordt niet gevolgd`,async()=>{
 const f=fixture(selection(),path=>{
  if(path!=='thread1/messages')return;
  const paging=next(path,'cursor');if(mode==='foreign_origin')paging.next='https://evil.invalid/?after=cursor';if(mode==='changed_path')paging.next='https://graph.facebook.com/v25.0/999/messages?after=cursor';if(mode==='wrong_cursor')paging.next='https://graph.facebook.com/v25.0/thread1/messages?after=other';
  return json({data:[f.incoming()],paging:mode==='missing_cursor'?{next:paging.next}:paging});
 });await rejects(f,'pagination_invalid');assert(f.calls.every(c=>!c.url.href.includes('evil.invalid')));
});
for(const mode of ['attachment','deleted','empty','wrong_recipient','malformed'] as const)test(`Meta-leesadapter: ${mode} blijft een expliciete onvolledige ontvangst`,async()=>{
 const f=fixture(selection(),path=>path==='thread1/messages'?json({data:[mode==='malformed'?{}:mode==='attachment'?{...f.incoming(),attachments:{data:[{image_data:{url:'https://private.invalid/image'}}]}}:mode==='deleted'?{...f.incoming(),is_deleted:true}:mode==='empty'?{...f.incoming(),message:''}:{...f.incoming(),to:{data:[{id:'999'}]}}]}):undefined);
 await rejects(f,mode==='wrong_recipient'?'account_mismatch':mode==='malformed'?'invalid_response':'unsupported_message');
});
for(const [status,code]of [[401,'token_invalid'],[403,'permissions_required'],[429,'rate_limited'],[500,'provider_unavailable']] as const)test(`Meta-leesadapter: HTTP ${status} is geen geslaagde lege inbox en wordt niet automatisch herhaald`,async()=>{
 let cancelled=0;const f=fixture(selection(),path=>path==='thread1/messages'?new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('provider PRIVATE_TOKEN'));},cancel(){cancelled++;}}),{status,headers:{'retry-after':'999999'}}):undefined);
 await rejects(f,code);assert.equal(f.calls.filter(c=>c.path==='thread1/messages').length,1);assert.equal(cancelled,1);
});
test('Meta-leesadapter: providerfouten in een HTTP 200 en verzadigd quotum worden veilig onderscheiden',async()=>{
 await rejects(fixture(selection(),p=>p==='thread1/messages'?json({error:{code:190,message:token}}):undefined),'token_invalid');
 const f=fixture(selection(),p=>p==='thread1/messages'?json({data:[]},200,{'x-app-usage':'{"call_count":99}'}):undefined);await assert.rejects(f.reader.read(f.target,token),e=>e instanceof MetaInboxReadError&&e.code==='rate_limited'&&e.retryAfterSeconds===60);
});
test('Meta-leesadapter: lege, ongeldige, te grote en hangende antwoorden worden gestopt zonder geheimen',async()=>{
 await rejects(fixture(selection(),p=>p==='thread1/messages'?new Response('not json'):undefined),'invalid_response');
 await rejects(fixture(selection(),p=>p==='thread1/messages'?new Response('a'.repeat(262145)):undefined),'response_too_large');
 await rejects(fixture(selection(),p=>p==='thread1/messages'?new Response(new ReadableStream({start(){}})):undefined,{timeoutMs:20}),'timeout');
 const f=fixture(selection(),p=>p==='thread1/messages'?Promise.reject(Error('SECRET '+token)):undefined);await rejects(f,'provider_unavailable');
});
test('Meta-leesadapter: afbreken en harde aanvraag-/pagina-/berichtgrenzen geven geen vals compleet resultaat',async()=>{
 const abort=new AbortController();abort.abort();const f=fixture();await assert.rejects(f.reader.read(f.target,token,abort.signal),e=>e instanceof MetaInboxReadError&&e.code==='cancelled');assert.equal(f.calls.length,0);
 await rejects(fixture(selection(),undefined,{maxRequests:3}),'limit_reached');await rejects(fixture(selection(),undefined,{maxPages:1}),'limit_reached');
 const two=fixture(selection(),p=>p==='thread1/messages'?json({data:[two.incoming(),two.incoming('m2')]}):undefined,{maxMessages:1});await rejects(two,'limit_reached');
});
test('Meta-leesadapter: een actieve leesactie is afbreekbaar, ook als de transportmock niet meewerkt',async()=>{
 const controller=new AbortController();let cancelled=0;
 const f=fixture(selection(),p=>p==='thread1/messages'?new Response(new ReadableStream({start(){setTimeout(()=>controller.abort(),10);},cancel(){cancelled++;}})):undefined);
 await assert.rejects(f.reader.read(f.target,token,controller.signal),e=>e instanceof MetaInboxReadError&&e.code==='cancelled');assert.equal(cancelled,1);
 const hung=fixture(selection(),p=>p==='thread1/messages'?new Promise<Response>(()=>{}):undefined,{timeoutMs:10});await rejects(hung,'timeout');
});
test('Meta-leesadapter: alleen een volledig gecontroleerd leeg antwoord mag als nul ontvangst gelden',async()=>{
 const empty=fixture(selection(),p=>p==='456/conversations'?json({data:[]}):undefined);assert.equal((await empty.reader.read(empty.target,token)).messages.length,0);
 await rejects(fixture(selection(),p=>p==='456/conversations'?json({paging:{}}):undefined),'invalid_response');
});
test('Meta-leesadapter: ontbrekende tijdzone en onmogelijke kalenderdatum worden niet stilzwijgend genormaliseerd',async()=>{
 for(const created_time of ['2026-01-01T12:00:00','2026-02-30T12:00:00Z']){
  const f=fixture(selection(),p=>p==='thread1/messages'?json({data:[{...f.incoming(),created_time}]}):undefined);await rejects(f,'invalid_response');
 }
});

function receiptFixture(){
 const f=fixture(),calls:string[]=[],stored:unknown[]=[];
 const access:MetaInboxAccess={target:f.target,authorized:true,connected:true,revision:'fixture-v1',scopes:socialInboxMetaRequirements('instagram','direct')};
 const ports:MetaInboxReceivePorts={authorize:async()=>{calls.push('authorize');return access;},credentials:async id=>{assert.equal(id,f.target.account_id);calls.push('credentials');return token;},reader:f.reader,store:async(t,m)=>{calls.push('store');stored.push({target:t,messages:m});return{inserted:m.length};}};
 return{...f,calls,stored,access,ports};
}
test('Meta-ontvangst: standaard uit raakt geen account, token, provider of opslag',async()=>{
 const f=receiptFixture();const r=await receiveMetaInbox(f.ports);assert.equal(r.state,'disabled');assert.deepEqual(f.calls,[]);assert.deepEqual(f.stored,[]);
});
test('Meta-ontvangst: rechtencontrole vóór credential, opnieuw vóór opslag en bevestigd resultaat',async()=>{
 const f=receiptFixture(),r=await receiveMetaInbox(f.ports,true);assert.equal(r.state,'received');assert.equal(r.inserted,1);assert.equal(r.complete,true);assert.deepEqual(f.calls,['authorize','credentials','authorize','store']);
 f.access.scopes=[];f.calls.length=0;assert.equal((await receiveMetaInbox(f.ports,true)).reason,'permissions_required');assert.deepEqual(f.calls,['authorize']);
});
test('Meta-ontvangst: ingetrokken rechten, gewijzigde identiteit of afbreken vóór opslag blokkeren de volledige batch',async()=>{
 for(const mode of ['revoked','revision','account','cancelled']){
  const f=receiptFixture(),controller=new AbortController();let n=0;f.ports.authorize=async()=>{n++;if(n===1)return f.access;if(mode==='revoked')throw Error('PRIVATE_TOKEN');if(mode==='cancelled')controller.abort();return mode==='revision'?{...f.access,revision:'changed'}:mode==='account'?{...f.access,target:{...f.target,external_account_id:'999'}}:f.access;};
  const r=await receiveMetaInbox(f.ports,true,controller.signal);assert.equal(r.state,'blocked');assert.equal(r.complete,false);assert.equal(f.stored.length,0);assert(!JSON.stringify(r).includes(token));
 }
});
test('Meta-ontvangst: onbekende opslaguitkomst en fout antwoord worden niet als ontvangen bevestigd',async()=>{
 for(const mode of ['error','shape','incomplete']){const f=receiptFixture();if(mode==='incomplete')f.ports.reader={read:async()=>({messages:[],requests:0,pages:0,skippedOutgoing:0,complete:false} as never)};else f.ports.store=async()=>{if(mode==='error')throw Error(token);return{inserted:999};};const r=await receiveMetaInbox(f.ports,true);assert.equal(r.state,'attention');assert.equal(r.complete,false);assert.equal(r.inserted,null);assert(!JSON.stringify(r).includes(token));}
});
test('Meta-ontvangst: verbindingsfouten en quota hebben een afzonderlijke opvolguitkomst zonder automatische tweede poging',async()=>{
 const f=receiptFixture();let calls=0;f.ports.reader={read:async()=>{calls++;throw new MetaInboxReadError('rate_limited',60);}};const r=await receiveMetaInbox(f.ports,true);assert.equal(r.state,'retry_later');assert.equal(r.reason,'rate_limited');assert.equal(r.retryAfterSeconds,60);assert.equal(r.inserted,null);assert.equal(calls,1);assert.equal(f.stored.length,0);
});
