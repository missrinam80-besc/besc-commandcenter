import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {f1Database,q,j} from './helpers/f1-database.mts';
import {normalizeMetaInboxFixture,importMetaInboxFixture,socialInboxCapability,type SocialInboxTarget} from '../src/lib/social-inbox.ts';
let f:Awaited<ReturnType<typeof f1Database>>,account:string,session:string;
const sessions=new Map<string,string>();
before(async()=>{f=await f1Database();});after(async()=>{await f?.db.close();});
async function actor(user=f.ids.admin,role='authenticated'){
 await f.owner();await f.actor(user,role);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:user,role,session_id:sessions.get(user)}))},false)`);
}
const msg=(id='m1',thread='t1',time='2026-01-01T12:00:00Z')=>({thread_id:thread,message_id:id,kind:'direct',sender:'TESTFIXTURE - NIET PUBLICEREN',body:'Fictieve vraag over de community',occurred_at:time});
beforeEach(async()=>{
 await f.owner();await f.db.exec('begin');account=randomUUID();session=randomUUID();
 for(const user of [f.ids.admin,f.ids.chair,f.ids.member,f.ids.other]){sessions.set(user,user===f.ids.admin?session:randomUUID());await f.db.exec(`update auth.users set email_confirmed_at=now() where id=${q(user)};insert into auth.sessions(id,user_id)values(${q(sessions.get(user))},${q(user)})`);}
 await actor();await f.db.exec(`insert into public.social_accounts(id,organization_id,platform,account_name,external_account_id,status,created_by)values(${q(account)},${q(f.ids.org)},'instagram','TESTFIXTURE - NIET PUBLICEREN','123','connected',${q(f.ids.admin)})`);
});
afterEach(async()=>{await f.db.exec('rollback');await f.owner();});
async function ingest(batch:unknown=[msg()],a=account,o=f.ids.org,external='123'){
 await actor(f.ids.admin,'service_role');const v=(await f.db.query<{v:{inserted:number}}>(`select public.social_inbox_ingest(${q(o)},${q(a)},${q(external)},${j(batch)}) v`)).rows[0].v;await actor();return v;
}
async function owner(action:string,thread:string|null=null,data:unknown={},o=f.ids.org){return(await f.db.query<{v:unknown}>(`select public.social_inbox_owner(${q(o)},${q(action)},${thread?q(thread):'null'},${j(data)}) v`)).rows[0].v;}
type Thread={id:string;revision:number;status:string;assignee_id:string|null;messages:{id:string;body:string}[];events:{id:number;operation:string;actor_id:string|null;detail:unknown}[]};
async function read(){const list=await owner('list') as Thread[];return await owner('read',list[0].id) as Thread;}
async function denied(sql:string,pattern:RegExp=/social_inbox|permission denied/){await f.db.exec('savepoint bad');try{await assert.rejects(f.db.exec(sql),pattern);}finally{await f.db.exec('rollback to savepoint bad;release savepoint bad');}}

test('Socialinbox: echte SQL-keten voor ontvangst, toewijzing, interne notitie, status en herladen',async()=>{
 assert.deepEqual(await ingest(),{inserted:1});let t=await read();assert.equal(t.messages.length,1);assert.equal(t.revision,1);
 await owner('assign',t.id,{revision:1,assignee:f.ids.chair});await owner('note',t.id,{revision:2,note:'TESTFIXTURE alleen intern'});await owner('status',t.id,{revision:3,status:'resolved'});
 t=await read();assert.equal(t.status,'resolved');assert.equal(t.assignee_id,f.ids.chair);assert.equal(t.revision,4);assert.deepEqual(t.events.map(e=>e.operation),['received','assigned','note','status']);assert(t.events.slice(1).every(e=>e.actor_id===f.ids.admin));
 assert.equal(JSON.stringify(t).includes('access_token'),false);
});
test('Socialinbox: nagebootst Meta-antwoord loopt door de fixtureadapter naar echte afgeschermde SQL-opslag',async()=>{
 const target={organization_id:f.ids.org,account_id:account,platform:'instagram' as const,external_account_id:'123'};
 const input={mode:'fixture',label:'TESTFIXTURE - NIET PUBLICEREN',account:target,kind:'direct',thread_id:'fixture-conversation',response:{data:[{id:'fixture-message',created_time:'2026-01-01T12:00:00Z',from:{id:'456',name:'TESTFIXTURE bezoeker'},to:{data:[{id:'123'}]},message:'TESTFIXTURE nagebootst providerantwoord'}]}};
 const store=async(t:SocialInboxTarget,batch:unknown)=>ingest(batch,t.account_id,t.organization_id,t.external_account_id);
 assert.deepEqual(await importMetaInboxFixture(target,input,store),{inserted:1});assert.deepEqual(await importMetaInboxFixture(target,input,store),{inserted:0});
 const t=await read();assert.equal(t.messages[0].body,'TESTFIXTURE nagebootst providerantwoord');assert.equal(t.events.length,1);
});
test('Socialinbox: identieke herontvangst en herhaalde status/toewijzing maken geen extra historie',async()=>{
 await ingest();let t=await read();assert.deepEqual(await ingest(),{inserted:0});await owner('assign',t.id,{revision:1,assignee:null});await owner('status',t.id,{revision:1,status:'open'});t=await read();assert.equal(t.revision,1);assert.equal(t.events.length,1);
});
test('Socialinbox: afwijkende herontvangst of verplaatsen van hetzelfde bericht is een conflict',async()=>{
 await ingest();await actor(f.ids.admin,'service_role');
 for(const row of [{...msg(),body:'Gewijzigd'},{...msg(),thread_id:'andere-thread'}])await denied(`select public.social_inbox_ingest(${q(f.ids.org)},${q(account)},'123',${j([row])})`,/duplicate_conflict/);
 await actor();assert.equal((await read()).messages[0].body,msg().body);
});
test('Socialinbox: nieuw bericht heropent afgehandeld gesprek, oude vertraagde ontvangst niet',async()=>{
 await ingest();const t=await read();await owner('status',t.id,{revision:1,status:'resolved'});
 await ingest([msg('m0','t1','2025-01-01T12:00:00Z')]);assert.equal((await read()).status,'resolved');
 await ingest([msg('m2','t1','2026-01-02T12:00:00Z')]);const r=await read();assert.equal(r.status,'open');assert.equal(r.messages.length,3);assert.equal(r.events.filter(e=>e.operation==='reopened').length,1);
});
test('Socialinbox: verouderde schermversie kan nieuwe ontvangst of andere beheerder niet overschrijven',async()=>{
 await ingest();const t=await read();await ingest([msg('m2')]);await denied(`select public.social_inbox_owner(${q(f.ids.org)},'status',${q(t.id)},${j({revision:1,status:'resolved'})})`,/conflict/);assert.equal((await read()).status,'open');
});
test('Socialinbox: gewone leden, andere organisaties, geen sessie en ingetrokken sessie worden geweigerd',async()=>{
 await ingest();const t=await read();await actor(f.ids.member);await denied(`select public.social_inbox_owner(${q(f.ids.org)},'read',${q(t.id)})`,/access_denied/);
 await actor(f.ids.other);await denied(`select public.social_inbox_owner(${q(f.ids.otherOrg)},'read',${q(t.id)})`,/unavailable/);
 await actor();await denied(`select public.social_inbox_owner(${q(f.ids.otherOrg)},'list')`,/access_denied/);
 await f.owner();await f.db.exec(`delete from auth.sessions where id=${q(session)}`);await actor();await denied(`select public.social_inbox_owner(${q(f.ids.org)},'list')`,/access_denied/);
});
test('Socialinbox: bestaande gedelegeerde manageInbox-rechten werken en intrekking blokkeert opnieuw',async()=>{
 await ingest();await f.owner();const role=randomUUID();await f.db.exec(`insert into public.organization_access_roles(id,organization_id,name,capabilities)values(${q(role)},${q(f.ids.org)},'TESTFIXTURE inbox',array['manageInbox']);update public.organization_members set access_role_id=${q(role)} where organization_id=${q(f.ids.org)} and user_id=${q(f.ids.member)}`);
 await actor(f.ids.member);assert.equal((await owner('list') as unknown[]).length,1);
 await f.owner();await f.db.exec(`update public.organization_access_roles set deleted_at=now() where id=${q(role)}`);await actor(f.ids.member);await denied(`select public.social_inbox_owner(${q(f.ids.org)},'list')`,/access_denied/);
});
test('Socialinbox: alleen bevoegde actieve leden kunnen worden toegewezen',async()=>{
 await ingest();const t=await read();for(const user of [f.ids.member,f.ids.other,randomUUID()])await denied(`select public.social_inbox_owner(${q(f.ids.org)},'assign',${q(t.id)},${j({revision:1,assignee:user})})`,/assignee_denied/);
 await owner('assign',t.id,{revision:1,assignee:f.ids.chair});assert.equal((await read()).assignee_id,f.ids.chair);
});
test('Socialinbox: directe tabeltoegang, historie vervalsen en browserimport worden geweigerd',async()=>{
 await ingest();for(const table of ['si_threads','si_messages','si_events'])await denied(`select * from private.${table}`,/permission denied/);
 await denied(`select public.social_inbox_ingest(${q(f.ids.org)},${q(account)},'123',${j([msg()])})`,/permission denied/);
 await actor(f.ids.admin,'service_role');await denied('delete from private.si_events',/permission denied/);await denied(`select public.social_inbox_owner(${q(f.ids.org)},'list')`,/permission denied/);
});
test('Socialinbox: geen antwoord- of verwijderopdracht en geen ongeldige status/notitie',async()=>{
 await ingest();const t=await read();for(const [action,data] of [['send',{body:'Nooit versturen'}],['delete',{}],['status',{status:'sent'}],['note',{note:' '}],['note',{note:'a'.repeat(2001)}]] as const)await denied(`select public.social_inbox_owner(${q(f.ids.org)},${q(action)},${q(t.id)},${j({revision:1,...data})})`);
});
test('Socialinbox: account- en organisatiebinding, ontkoppeling en gewijzigde accountidentiteit blokkeren import',async()=>{
 await actor(f.ids.admin,'service_role');for(const [o,a,e] of [[f.ids.otherOrg,account,'123'],[f.ids.org,randomUUID(),'123'],[f.ids.org,account,'999']])await denied(`select public.social_inbox_ingest(${q(o)},${q(a)},${q(e)},${j([msg()])})`,/account_denied/);
 await f.owner();await f.db.exec(`update public.social_accounts set status='disconnected' where id=${q(account)}`);await actor(f.ids.admin,'service_role');await denied(`select public.social_inbox_ingest(${q(f.ids.org)},${q(account)},'123',${j([msg()])})`,/account_denied/);
});
test('Socialinbox: hele invoer rolt terug bij ongeldig item, extra credentialveld en te grote batch',async()=>{
 await actor(f.ids.admin,'service_role');for(const batch of [[msg(),{...msg('m2'),body:''}],[{...msg(),access_token:'NIET_OPSLAAN'}],Array.from({length:51},(_,i)=>msg('m'+i))])await denied(`select public.social_inbox_ingest(${q(f.ids.org)},${q(account)},'123',${j(batch)})`);
 await actor();assert.deepEqual(await owner('list'),[]);
});
test('Socialinbox: account- en kanaalsoorten houden gelijke provider-ID’s uit elkaar',async()=>{
 await ingest();await ingest([{...msg('comment1'),kind:'comment'}]);await actor();const list=await owner('list') as Thread[];assert.equal(list.length,2);
 const a=randomUUID();await f.db.exec(`insert into public.social_accounts(id,organization_id,platform,account_name,external_account_id,status,created_by)values(${q(a)},${q(f.ids.org)},'facebook','TESTFIXTURE FB','456','connected',${q(f.ids.admin)})`);
 await ingest([msg()],a,f.ids.org,'456');assert.equal((await owner('list') as unknown[]).length,3);
});
test('Socialinbox: filters, eigen toewijzing en vaste paginagrenzen bewaren alle gesprekken',async()=>{
 await ingest(Array.from({length:30},(_,i)=>msg('m'+i,'t'+i)));const first=await owner('list') as Thread[];assert.equal(first.length,26);
 const second=await owner('list',null,{before:first[24].id}) as Thread[];assert.equal(second.length,5);assert.equal(new Set([...first.slice(0,25),...second].map(x=>x.id)).size,30);
 await owner('assign',first[0].id,{revision:1,assignee:f.ids.admin});assert.equal((await owner('list',null,{mine:'true'}) as Thread[]).length,1);assert.deepEqual(await owner('list',null,{platform:'facebook'}),[]);
});
test('Socialinbox: lange bericht- en gebeurtenishistorie blijft in begrensde pagina’s toegankelijk',async()=>{
 await ingest(Array.from({length:50},(_,i)=>msg('m'+i)));await ingest([msg('m50'),msg('m51')]);const t=await read();assert.equal(t.messages.length,51);assert.equal(t.events.length,51);
 const older=await owner('read',t.id,{messages_before:t.messages[1].id,events_before:String(t.events[1].id)}) as Thread;assert.equal(older.messages.length,2);assert.equal(older.events.length,2);
});

const bound={organization_id:'11111111-1111-4111-8111-111111111111',account_id:'22222222-2222-4222-8222-222222222222',platform:'instagram' as const,external_account_id:'123'};
const response=()=>({mode:'fixture',label:'TESTFIXTURE - NIET PUBLICEREN',account:bound,kind:'direct',thread_id:'t1',response:{data:[{id:'m1',created_time:'2026-01-01T12:00:00Z',from:{id:'456',name:'Fictieve bezoeker'},to:{data:[{id:'123'}]},message:'TESTFIXTURE - NIET PUBLICEREN'}]}});
test('Meta-inbox: fixtureadapter bindt doel, vertaalt directe berichten en reacties en dedupliceert',()=>{
 const r=response();r.response.data.push(r.response.data[0]);assert.equal(normalizeMetaInboxFixture(bound,r).length,1);
 const comment={...r,kind:'comment',response:{data:[{id:'c1',created_time:'2026-01-01T12:00:00Z',from:{id:'456',name:'Fictieve bezoeker'},text:'Fictieve reactie'}]}};assert.equal(normalizeMetaInboxFixture(bound,comment)[0].kind,'comment');
});
test('Meta-inbox: live modus, ruwe fouten, accountmismatch, uitgaande berichten en onvolledige antwoorden worden geweigerd vóór opslag',async()=>{
 for(const input of [{...response(),mode:'live'},{...response(),response:{error:{message:'SECRET'}}},{...response(),account:{...bound,external_account_id:'999'}},{...response(),response:{data:[{...response().response.data[0],to:{data:[{id:'999'}]}}]}},{...response(),response:{data:[{}]}},{...response(),access_token:'NO_SECRET'}]){let stored=0;await assert.rejects(importMetaInboxFixture(bound,input,async()=>{stored++;}));assert.equal(stored,0);}
});
test('Meta-inbox: lege fixture en ontbrekende rechten betekenen geen bewezen live toegang',async()=>{
 let stored=0;assert.deepEqual(await importMetaInboxFixture(bound,{...response(),response:{data:[]}},async()=>{stored++;}),{inserted:0});assert.equal(stored,0);
 const result=socialInboxCapability('instagram','direct',['instagram_basic','instagram_manage_insights']);assert(result.missing.includes('instagram_manage_messages'));assert.equal(result.liveVerified,false);
 assert.equal(socialInboxCapability('facebook','direct',['pages_messaging','pages_manage_metadata','pages_read_engagement']).liveVerified,false);
});
