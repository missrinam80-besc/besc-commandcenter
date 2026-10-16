import assert from 'node:assert/strict';

import test from 'node:test';

import {readFileSync} from 'node:fs';

import {PGlite} from '@electric-sql/pglite';

import {blankType,normalizeTicketAnswers,typeDraftSchema,discordInstallUrl} from '../src/lib/discord-ticket-config.ts';

import {handleDiscordConfigRequest} from '../src/lib/discord-config-api.ts';
import {hashBotKey,BotRateLimiter,type BotClient} from '../src/lib/bot-api.ts';
import {z} from 'zod';

import {hasPermission} from '../src/lib/permissions.ts';

import {canViewInternalPath} from '../src/lib/route-permissions.ts';

const org='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',user='20000000-0000-4000-8000-000000000001',guild='1067893182387474432',parent='1558853872766689382',app='1558542661265129474',actor='111111111111111111';

const snow=()=>((BigInt(Date.now()-1420070400000)<<BigInt(22))+BigInt(Math.floor(Math.random()*100000))).toString();

async function setup(legacy=false,upgrade=true){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;grant usage on schema private,auth to authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table auth.identities(user_id uuid,provider text,provider_id text,identity_data jsonb);create table organizations(id uuid primary key);create table profiles(id uuid primary key,display_name text);create table organization_access_roles(id uuid primary key,organization_id uuid,capabilities text[],deleted_at timestamptz);create table organization_members(organization_id uuid,user_id uuid,role text,status text,access_role_id uuid);grant select on organizations,profiles,organization_members,organization_access_roles to service_role;`);await db.exec(readFileSync(new URL('../supabase/migrations/20261011130951_ticketing_v1.sql',import.meta.url),'utf8'));await db.query('insert into organizations values($1),($2)',[org,other]);await db.query("insert into profiles values($1,'TESTFIXTURE');insert into organization_members values($2,$1,'admin','active',null)",[user,org]).catch(async()=>{await db.query("insert into profiles values($1,'TESTFIXTURE')",[user]);await db.query("insert into organization_members values($1,$2,'admin','active',null)",[org,user]);});await db.query("insert into auth.identities values($1,'discord',$2,$3)",[user,actor,JSON.stringify({provider_id:actor})]);if(legacy){await db.query("insert into support_tickets(id,organization_id,client_id,guild_id,requester_discord_id,subject,parent_channel_id,thread_id,link_status) values($1,$2,'fixture-client',$3,$4,'TESTFIXTURE — Oud ticket',$5,$4,'linked')",[user,org,guild,actor,parent]);await db.query("insert into support_ticket_messages(organization_id,ticket_id,direction,content) values($1,$2,'internal','Bestaande interne notitie')",[org,user]);}await db.exec(readFileSync(new URL('../supabase/migrations/20261012185859_discord_ticketing_v2.sql',import.meta.url),'utf8'));if(upgrade){await db.exec(readFileSync(new URL('../supabase/migrations/20261015115523_discord_configuration_revision.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../supabase/migrations/20261016062843_discord_channel_check_contract.sql',import.meta.url),'utf8'));}

 const staff=async(server:string|null,op:string,data:object)=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);return (await db.query<{r:Record<string,unknown>}>('select discord_bot_staff_action($1,$2,$3,$4) r',[org,server,op,JSON.stringify(data)])).rows[0].r;};

 const bot=async(op:string,data:object,o=org,g=guild,c='fixture-client')=>{await db.exec('reset role;set role service_role');return (await db.query<{r:Record<string,unknown>}>('select discord_bot_operation($1,$2,$3,$4,$5) r',[o,c,g,op,JSON.stringify(data)])).rows[0].r;};return{db,staff,bot};}

test('Botbeheer is los van ticketbehandeling en rollenbeheer',()=>{const member={role:'volunteer',finance_role:'none',capabilities:['manageDiscordBot']};assert.equal(hasPermission(member,'manageDiscordBot'),true);assert.equal(hasPermission(member,'manageTickets'),false);assert.equal(hasPermission(member,'manageUsers'),false);assert.equal(canViewInternalPath('/app/beheer/discordbot',member),true);assert.equal(canViewInternalPath('/app/tickets',member),false);assert.equal(hasPermission({role:'board',finance_role:'none'},'manageDiscordBot'),true);});

test('Formulier en embed begrenzen input en behouden stabiele vraag/keuze-IDs',()=>{const t=blankType(parent);assert.ok(typeDraftSchema.safeParse(t).success);assert.throws(()=>normalizeTicketAnswers(t,{onderwerp:'a',omschrijving:'b',unknown:'x'}));assert.throws(()=>normalizeTicketAnswers(t,{onderwerp:'',omschrijving:'b'}));assert.equal(typeDraftSchema.safeParse({...t,questions:Array(6).fill(t.questions[0])}).success,false);assert.equal(typeDraftSchema.safeParse({...t,embed:{...t.embed,imageUrl:'https://example.com'}}).success,false);const url=new URL(discordInstallUrl(guild,app));assert.equal(BigInt(url.searchParams.get('permissions')!)&BigInt(8),BigInt(0));});

test('Actual SQL: isolated concepts, runtime gates, publication, immutable snapshots and durable intake',async()=>{const{db,staff,bot}=await setup();try{

 const created=await staff(null,'server_create',{name:'TESTFIXTURE',guildId:guild,applicationId:app});assert.ok(created.serverId);const server=String(created.serverId);

 const draft={...blankType(parent),active:true};assert.equal((await staff(server,'type_save',{draft})).saved,true);await db.exec('reset role');const type=(await db.query<{id:string}>('select id from discord_ticket_types')).rows[0].id;

 const pd={name:'TESTFIXTURE',channelId:parent,typeIds:[type],embed:draft.embed};const panel=String((await staff(server,'panel_save',{draft:pd})).id);

 assert.equal((await staff(server,'publish',{id:panel,version:1})).error,'runtime_required');

 assert.equal((await bot('config',{},other)).error,'server_unavailable');

 assert.equal((await bot('report',{application_id:app,installed:true,runtime_version:'2.0.0',features:['typed_intake','ticket_panels','label_modals'],channels:[{id:parent,name:'TESTFIXTURE',type:0}]})).recorded,true);

 assert.equal((await staff(server,'activate',{version:1})).error,'verification_required');

 assert.equal((await staff(server,'verify',{})).saved,true);let claim=await bot('claim',{worker_id:'worker_123'});let delivery=(claim.deliveries as Record<string,unknown>[])[0];assert.equal(delivery.kind,'verify_server_admin');

 assert.equal((await bot('complete',{delivery_id:delivery.id,worker_id:'worker_123',lease_token:delivery.leaseToken,application_id:app,payload_hash:delivery.payloadHash,kind:delivery.kind,discord_user_id:actor,is_admin:true})).recorded,true);

 assert.equal((await staff(server,'activate',{version:1})).saved,true);assert.equal((await staff(server,'check_channel',{channelId:parent})).saved,true);claim=await bot('claim',{worker_id:'worker_123'});delivery=(claim.deliveries as Record<string,unknown>[])[0];assert.equal(delivery.kind,'check_channel');assert.deepEqual(delivery.payload,{applicationId:app,channelId:parent});assert.equal(delivery.channelId,parent);

 await bot('complete',{delivery_id:delivery.id,worker_id:'worker_123',lease_token:delivery.leaseToken,application_id:app,payload_hash:delivery.payloadHash,kind:delivery.kind,channel_id:parent,channel_type:0,permissions_ok:true,missing_permissions:[]});

 const beforePublish=(await bot('config',{})).configurationRevisionId;assert.equal((await staff(server,'publish',{id:panel,version:1})).saved,true);claim=await bot('claim',{worker_id:'worker_123'});delivery=(claim.deliveries as Record<string,unknown>[])[0];assert.equal(delivery.kind,'publish_panel');const revision=String(delivery.revisionId);

 await bot('complete',{delivery_id:delivery.id,worker_id:'worker_123',lease_token:delivery.leaseToken,application_id:app,payload_hash:delivery.payloadHash,kind:delivery.kind,channel_id:parent,message_id:actor,bot_author_id:app,revision_id:revision});

 const config=await bot('config',{});assert.notEqual(config.configurationRevisionId,beforePublish);assert.ok(z.uuid().safeParse(config.configurationRevisionId).success);assert.equal((await bot('config',{})).configurationRevisionId,config.configurationRevisionId);assert.equal(config.schemaVersion,2);const tr=(config.typeRevisions as Record<string,unknown>[])[0];assert.ok(tr.revisionId);

 await db.exec('reset role');await assert.rejects(db.query("update discord_ticket_type_revisions set payload='{}'"));await assert.rejects(db.query("delete from discord_ticket_panel_revisions"));



 // Stale leases reconcile the same publication; a late old lease cannot complete it.

 await staff(server,'panel_save',{id:panel,version:2,draft:pd});assert.equal((await bot('config',{})).configurationRevisionId,config.configurationRevisionId);

 await staff(server,'publish',{id:panel,version:3});

 const oldLease=(await bot('claim',{worker_id:'worker_123'})).deliveries as Record<string,unknown>[];

 await db.exec('reset role');await db.query("update discord_bot_config_deliveries set leased_until=now()-interval '1 second' where id=$1",[oldLease[0].id]);

 const reclaimed=((await bot('claim',{worker_id:'worker_123'})).deliveries as Record<string,unknown>[])[0];assert.equal(reclaimed.reconcile,true);assert.equal(reclaimed.id,oldLease[0].id);

 assert.equal((await bot('complete',{delivery_id:oldLease[0].id,worker_id:'worker_123',lease_token:oldLease[0].leaseToken,application_id:app,payload_hash:oldLease[0].payloadHash,kind:'publish_panel',channel_id:parent,message_id:actor,bot_author_id:app,revision_id:oldLease[0].revisionId})).error,'lease_conflict');

 // Leave this edition pending; old published edition remains valid for open forms.

 await bot('fail',{delivery_id:reclaimed.id,worker_id:'worker_123',lease_token:reclaimed.leaseToken,error_code:'outcome_unknown',uncertain:true});

 const source=snow(),hash='a'.repeat(64),params={discord_user_id:actor,type_revision_id:tr.revisionId,source:'panel',panel_id:panel,panel_revision_id:revision,message_id:actor,channel_id:parent,idempotency_key:source,request_hash:hash};const intent=await bot('intent',params);assert.ok(intent.intentId);assert.deepEqual(await bot('intent',params),intent);

 assert.equal((await bot('intent',{...params,message_id:parent,request_hash:'e'.repeat(64)})).error,'idempotency_conflict');



 const wrongActor={discord_user_id:parent,type_revision_id:tr.revisionId,intake_intent_id:intent.intentId,answers:{onderwerp:'x',omschrijving:'y'},idempotency_key:snow(),request_hash:'d'.repeat(64)};

 assert.equal((await bot('intake',wrongActor)).error,'intent_unavailable');

 assert.equal((await bot('intake',{...wrongActor,discord_user_id:actor,answers:{onderwerp:'',omschrijving:'y'}})).error,'invalid_answers');
 assert.equal((await bot('intake',{...wrongActor,discord_user_id:actor,answers:{onderwerp:'😀'.repeat(100),omschrijving:'y'}})).error,'invalid_answers');
 assert.equal((await bot('intake',{...wrongActor,discord_user_id:actor,answers:{onderwerp:'\u00a0',omschrijving:'y'}})).error,'invalid_answers');

 const expiredIntent=await bot('intent',{...params,idempotency_key:snow()});await db.exec('reset role');await db.query("update discord_ticket_intents set expires_at=now()-interval '1 second' where id=$1",[expiredIntent.intentId]);

 assert.equal((await bot('intake',{...wrongActor,discord_user_id:actor,intake_intent_id:expiredIntent.intentId})).error,'intent_expired');

 const linkedIntent=await bot('intent',{...params,idempotency_key:snow()});await staff(server,'type_save',{id:type,version:1,draft:{...draft,eligibility:'linked'}});

 assert.equal((await bot('intake',{...wrongActor,discord_user_id:actor,intake_intent_id:linkedIntent.intentId})).error,'linked_account_required');

 await staff(server,'type_save',{id:type,version:2,draft});

 assert.equal((await staff(server,'type_save',{id:type,version:1,draft})).error,'version_conflict');

 await db.exec('reset role');await db.query('delete from discord_ticket_intents where id<>$1',[intent.intentId]);

 const intake={discord_user_id:actor,type_revision_id:tr.revisionId,intake_intent_id:intent.intentId,answers:{onderwerp:'TESTFIXTURE',omschrijving:'Private antwoorden'},idempotency_key:snow(),request_hash:'b'.repeat(64)};

 const first=await bot('intake',intake);assert.ok(first.ticketId);assert.deepEqual(await bot('intake',intake),first);assert.equal((await bot('intake',{...intake,idempotency_key:snow()})).error,'intent_consumed');

 await db.exec('reset role');const ticket=(await db.query<{intake_answers:unknown;intake_snapshot:unknown}>('select intake_answers,intake_snapshot from support_tickets')).rows[0];assert.equal(JSON.stringify(ticket.intake_answers).includes('Private antwoorden'),true);assert.equal(JSON.stringify(await bot('config',{})).includes('Private antwoorden'),false);

 await db.exec('reset role');assert.equal((await db.query('select * from support_ticket_deliveries')).rows.length,2);assert.equal((await db.query('select * from discord_bot_config_deliveries')).rows.length,4);

 await staff(server,'type_save',{id:type,version:3,draft:{...draft,name:'Nieuwe naam'}});await db.exec('reset role');assert.deepEqual((await db.query<{intake_snapshot:unknown}>('select intake_snapshot from support_tickets')).rows[0]?.intake_snapshot,ticket.intake_snapshot);




 // An already leased publication can be withdrawn before its Discord effect.
 await staff(server,'recover',{id:panel,version:4});const withdrawn=((await bot('claim',{worker_id:'worker_123'})).deliveries as Record<string,unknown>[])[0];
 const inspect={delivery_id:withdrawn.id,worker_id:'worker_123',lease_token:withdrawn.leaseToken};assert.equal((await bot('inspect',inspect)).withdrawn,false);
 const beforeDisable=await bot('config',{});await staff(server,'disable',{id:panel,version:4});const disabled=await bot('config',{});assert.notEqual(disabled.configurationRevisionId,beforeDisable.configurationRevisionId);assert.equal((await bot('config',{})).configurationRevisionId,disabled.configurationRevisionId);assert.equal((await bot('inspect',inspect)).withdrawn,true);
 const skip={...inspect,application_id:app,payload_hash:withdrawn.payloadHash,kind:'publish_panel',channel_id:parent,bot_author_id:app,revision_id:withdrawn.revisionId,message_id:actor,skipped:true};
 assert.equal((await bot('complete',skip)).recorded,true);assert.equal((await bot('complete',skip)).recorded,true);
 assert.deepEqual((await bot('config',{})).panels,[]);
 await db.exec('reset role');
 const role='20000000-0000-4000-8000-000000000009';await db.query("insert into organization_access_roles values($1,$2,'{manageDiscordBot}',null)",[role,org]);await db.query("update organization_members set role='volunteer',access_role_id=$1 where user_id=$2",[role,user]);

 await db.exec('set role authenticated');assert.equal((await db.query('select * from discord_bot_servers')).rows.length,1);assert.equal((await db.query('select * from support_tickets')).rows.length,0);await assert.rejects(db.query("update discord_ticket_types set active=false"));await assert.rejects(db.query('select * from discord_ticket_intents'));

 await db.exec('reset role');await db.query('update organization_access_roles set deleted_at=now() where id=$1',[role]);await db.exec('set role authenticated');assert.equal((await db.query('select * from discord_bot_servers')).rows.length,0);await assert.rejects(db.query("select discord_bot_staff_action($1,$2,'pause','{\"version\":2}')",[org,server]),/discord_bot_forbidden/);

 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from discord_bot_servers'));await assert.rejects(db.query("select discord_bot_operation($1,'fixture-client',$2,'config','{}')",[org,guild]));await db.exec('reset role');

 await db.query("update support_tickets set status='closed',closed_at=now()-interval '181 days'");await db.exec('set role service_role');await db.query('select purge_support_tickets()');await db.exec('reset role');assert.equal((await db.query('select * from support_tickets')).rows.length,0);assert.equal((await db.query('select * from discord_ticket_intents')).rows.length,0);

 }finally{await db.close();}});

test('Actual SQL migration preserves legacy content, parent binding, staff policy and unchanged delivery kinds',async()=>{const{db,staff,bot}=await setup(true);try{
 const ticket=(await db.query<{subject:string;intake_snapshot:unknown;parent_channel_id:string}>('select * from support_tickets')).rows[0];assert.equal(ticket.subject,'TESTFIXTURE — Oud ticket');assert.equal(ticket.parent_channel_id,parent);assert.equal(ticket.intake_snapshot,null);assert.equal((await db.query<{content:string}>('select content from support_ticket_messages')).rows[0].content,'Bestaande interne notitie');
 const server=(await db.query<{id:string;intake_active:boolean;application_id:string}>('select * from discord_bot_servers')).rows[0];assert.equal(server.intake_active,false);assert.equal(server.application_id,null);const type=(await db.query<{id:string;draft:unknown;legacy:boolean}>('select * from discord_ticket_types')).rows[0];assert.ok(type.legacy);assert.ok(typeDraftSchema.safeParse(type.draft).success);
 assert.equal((await staff(server.id,'type_archive',{id:type.id,version:1})).error,'legacy_required');assert.equal((await staff(server.id,'type_save',{id:type.id,version:1,draft:{...blankType(parent),active:false}})).error,'legacy_required');
 await db.exec('reset role;set role service_role');const args=[org,'fixture-client',guild,'own',JSON.stringify({ticket_id:user,discord_user_id:actor})];const own=(await db.query<{r:{messages:unknown[]}}>('select ticket_bot_operation($1,$2,$3,$4,$5) r',args)).rows[0].r;assert.equal(own.messages.length,0);
 const base={ticket_id:user,discord_user_id:actor,parent_channel_id:parent,thread_id:actor,source_message_id:snow(),content:'Vervolggesprek',request_hash:'a'.repeat(64)};const ingest={...base,idempotency_key:base.source_message_id};const r=(await db.query<{r:{error?:string;messageId:string}}>('select ticket_bot_operation($1,$2,$3,$4,$5) r',[org,'fixture-client',guild,'ingest',JSON.stringify(ingest)])).rows[0].r;assert.ok(r.messageId);
 assert.equal((await db.query<{r:{error:string}}>('select ticket_bot_operation($1,$2,$3,$4,$5) r',[org,'fixture-client',guild,'ingest',JSON.stringify({...ingest,parent_channel_id:actor,idempotency_key:snow()})])).rows[0].r.error,'thread_not_allowed');
 assert.deepEqual((await bot('config',{})).features,[]);await db.exec('reset role');assert.equal((await db.query("select * from discord_bot_config_deliveries")).rows.length,0);
 }finally{await db.close();}});



const revisionMigration=()=>readFileSync(new URL('../supabase/migrations/20261015115523_discord_configuration_revision.sql',import.meta.url),'utf8');

test('Revisiemigratie herstelt bestaande lege servers en behoudt geldige revisies, tickets en overige configuratie',async()=>{
 const {db,bot}=await setup(true,false);try{
  const old=(await db.query<Record<string,unknown>>('select * from discord_bot_servers')).rows[0];assert.equal(old.configuration_revision_id,null);
  const preserved='30000000-0000-4000-8000-000000000019';
  await db.query("insert into discord_bot_servers(organization_id,guild_id,name,configuration_revision_id) values($1,$2,'TESTFIXTURE bestaande revisie',$3)",[other,parent,preserved]);
  const before=(await db.query('select * from support_tickets')).rows;
  const messages=(await db.query('select * from support_ticket_messages')).rows;
  await db.exec(revisionMigration());
  const stored=(await db.query<Record<string,unknown>>('select * from discord_bot_servers where id=$1',[old.id])).rows[0];
  assert.ok(z.uuid().safeParse(stored.configuration_revision_id).success);
  assert.deepEqual({...stored,configuration_revision_id:null},old);
  assert.equal((await db.query<{configuration_revision_id:string}>('select configuration_revision_id from discord_bot_servers where guild_id=$1',[parent])).rows[0].configuration_revision_id,preserved);
  assert.deepEqual((await db.query('select * from support_tickets')).rows,before);assert.deepEqual((await db.query('select * from support_ticket_messages')).rows,messages);
  for(let i=0;i<3;i++){const c=await bot('config',{});assert.equal(c.configurationRevisionId,stored.configuration_revision_id);assert.deepEqual(c.features,[]);assert.deepEqual(c.panels,[]);assert.deepEqual(c.typeRevisions,[]);}
  await db.exec('reset role');assert.equal((await db.query('select * from discord_bot_config_deliveries')).rows.length,0);
  await assert.rejects(db.query('update discord_bot_servers set configuration_revision_id=null where id=$1',[old.id]),/not-null/);
 }finally{await db.close();}
});

test('Nieuwe server zonder intake of publicatie levert direct stabiele UUID via echte GET-handler en SQL',async()=>{
 const {db,staff,bot}=await setup();try{
  const created=await staff(null,'server_create',{name:'TESTFIXTURE nieuwe server',guildId:guild,applicationId:app});assert.equal(created.saved,true);
  const key='bb_fixture-client.'+'a'.repeat(43);
  const client:BotClient={id:'fixture-client',organizationId:org,guildId:guild,keyHash:hashBotKey(key),scopes:['bot-config:read'],expiresAt:'2099-01-01T00:00:00Z',revoked:false};
  const deps={clients:[client],limiter:new BotRateLimiter(999),identity:{findAccount:async()=>null,findMembership:async()=>null},store:{operation:async(o:string,c:string,g:string,op:string,data:Record<string,unknown>)=>bot(op,data,o,g,c)}};
  let revision:unknown;
  for(let i=0;i<3;i++){
   const response=await handleDiscordConfigRequest(new Request('https://fixture.invalid/api/v1/bot/ticket-config?guild_id='+guild,{headers:{authorization:'Bearer '+key}}),deps);
   assert.equal(response.status,200);const config=await response.json();assert.ok(z.uuid().safeParse(config.configurationRevisionId).success);assert.equal(config.schemaVersion,2);assert.equal(config.guildId,guild);assert.ok(Number.isFinite(Date.parse(config.generatedAt)));
   revision??=config.configurationRevisionId;assert.equal(config.configurationRevisionId,revision);
   for(const field of ['features','panels','typeRevisions'])assert.deepEqual(config[field],[]);
  }
  assert.equal((await bot('config',{},other)).error,'server_unavailable');assert.equal((await bot('config',{},org,parent)).error,'server_unavailable');
  const denied=await handleDiscordConfigRequest(new Request('https://fixture.invalid/api/v1/bot/ticket-config?guild_id='+guild,{headers:{authorization:'Bearer '+key}}),{...deps,clients:[{...client,scopes:['identity:read']}]});assert.equal(denied.status,403);
  await db.exec('reset role');const record=(await db.query<{intake_active:boolean}>('select intake_active from discord_bot_servers')).rows[0];assert.equal(record.intake_active,false);assert.equal((await db.query('select * from discord_bot_config_deliveries')).rows.length,0);
 }finally{await db.close();}
});

test('Inactieve configuratie blijft geldig; heartbeat en concepten wisselen revisie niet, beschikbaarheid wel',async()=>{
 const {db,staff,bot}=await setup();try{
  const server=String((await staff(null,'server_create',{name:'TESTFIXTURE',guildId:guild,applicationId:app})).serverId);
  const initial=await bot('config',{});assert.ok(z.uuid().safeParse(initial.configurationRevisionId).success);
  const report={application_id:app,installed:true,runtime_version:'2.0.0',features:['typed_intake','ticket_panels','label_modals'],channels:[]};
  await bot('report',report);const first=await bot('config',{});assert.notEqual(first.configurationRevisionId,initial.configurationRevisionId);assert.deepEqual(first.features,[]);
  await bot('report',{...report,runtime_version:'2.0.1',features:[...report.features].reverse()});assert.equal((await bot('config',{})).configurationRevisionId,first.configurationRevisionId);
  const t=await staff(server,'type_save',{draft:blankType(parent)});assert.equal(t.saved,true);assert.equal((await bot('config',{})).configurationRevisionId,first.configurationRevisionId);
  await staff(server,'type_save',{id:t.id,version:1,draft:{...blankType(parent),active:true}});const changed=await bot('config',{});assert.notEqual(changed.configurationRevisionId,first.configurationRevisionId);assert.deepEqual(changed.panels,[]);assert.deepEqual(changed.typeRevisions,[]);
  await db.exec('reset role');await db.query('update discord_bot_servers set intake_active=true where id=$1',[server]);const active=await bot('config',{});assert.notEqual(active.configurationRevisionId,changed.configurationRevisionId);assert.equal((await bot('config',{})).configurationRevisionId,active.configurationRevisionId);
  await staff(server,'pause',{version:1});const paused=await bot('config',{});assert.ok(z.uuid().safeParse(paused.configurationRevisionId).success);assert.notEqual(paused.configurationRevisionId,active.configurationRevisionId);assert.deepEqual(paused.features,[]);assert.equal((await bot('config',{})).configurationRevisionId,paused.configurationRevisionId);
 }finally{await db.close();}
});

test('Bestaande actieve publicatie behoudt exacte revisie en inhoud bij upgrade',async()=>{
 const {db,staff,bot}=await setup(false,false);try{
  const server=String((await staff(null,'server_create',{name:'TESTFIXTURE',guildId:guild,applicationId:app})).serverId);
  const fixed='30000000-0000-4000-8000-000000000020';
  const fixture=JSON.parse(readFileSync(new URL('../docs/contracts/ticketing-v2.fixtures.json',import.meta.url),'utf8'));
  const type='30000000-0000-4000-8000-000000000021',tr='30000000-0000-4000-8000-000000000022',panel='30000000-0000-4000-8000-000000000023',pr='30000000-0000-4000-8000-000000000024';
  await db.exec('reset role');
  await db.query("update discord_bot_servers set intake_active=true,last_report_at=now(),features='{typed_intake,ticket_panels,label_modals}',configuration_revision_id=$1 where id=$2",[fixed,server]);
  await db.query('insert into discord_ticket_types(id,organization_id,server_id,draft,active) values($1,$2,$3,$4,true)',[type,org,server,fixture.typeDraft]);
  await db.query('insert into discord_ticket_type_revisions(id,organization_id,server_id,type_id,version,payload) values($1,$2,$3,$4,1,$5)',[tr,org,server,type,fixture.typeDraft]);
  await db.query("insert into discord_ticket_panels(id,organization_id,server_id,draft,enabled) values($1,$2,$3,'{}',true)",[panel,org,server]);
  await db.query('insert into discord_ticket_panel_revisions(id,organization_id,server_id,panel_id,version,payload) values($1,$2,$3,$4,1,$5)',[pr,org,server,panel,{embed:fixture.typeDraft.embed,typeRevisionIds:[tr]}]);
  await db.query('update discord_ticket_panels set published_revision_id=$1,message_id=$2,channel_id=$3 where id=$4',[pr,actor,parent,panel]);
  const before=await bot('config',{});assert.equal(before.configurationRevisionId,fixed);assert.equal((before.panels as unknown[]).length,1);assert.equal((before.typeRevisions as unknown[]).length,1);
  await db.exec('reset role');await db.exec(revisionMigration());const after=await bot('config',{});
  assert.deepEqual({...after,generatedAt:null},{...before,generatedAt:null});assert.equal((await bot('config',{})).configurationRevisionId,fixed);
  await db.exec('reset role');await db.query("update discord_bot_servers set last_report_at=now()-interval '6 minutes' where id=$1",[server]);const stale=await bot('config',{});assert.ok(z.uuid().safeParse(stale.configurationRevisionId).success);assert.deepEqual(stale.panels,[]);assert.deepEqual(stale.features,[]);
  await bot('report',{application_id:app,installed:true,runtime_version:'2',features:['typed_intake','ticket_panels','label_modals'],channels:[]});const fresh=await bot('config',{});assert.equal((fresh.panels as unknown[]).length,1);assert.ok(z.uuid().safeParse(fresh.configurationRevisionId).success);
 }finally{await db.close();}
});


test('Kanaalcontrole voldoet aan het bestaande botcontract en behoudt intake, scope en kanaalbinding',async()=>{
 const {db,staff,bot}=await setup();try{
  const server=String((await staff(null,'server_create',{name:'TESTFIXTURE',guildId:guild,applicationId:app})).serverId);
  await bot('report',{application_id:app,installed:true,runtime_version:'2',features:['typed_intake','ticket_panels','label_modals'],channels:[{id:parent,name:'TESTFIXTURE kanaal',type:0}]});
  assert.equal((await staff(server,'check_channel',{channelId:actor})).error,'channel_required');
  assert.equal((await staff(server,'check_channel',{channelId:parent})).saved,true);
  const delivery=((await bot('claim',{worker_id:'worker_123'})).deliveries as Record<string,unknown>[])[0];
  assert.equal(delivery.kind,'check_channel');assert.equal(delivery.channelId,parent);assert.deepEqual(delivery.payload,{applicationId:app,channelId:parent});assert.deepEqual(delivery.allowedMentions,{parse:[]});
  await db.exec('reset role');assert.equal((await db.query<{matches:boolean}>("select payload_hash=encode(sha256(convert_to(payload::text,'UTF8')),'hex') as matches from discord_bot_config_deliveries where id=$1",[delivery.id])).rows[0].matches,true);
  const base={delivery_id:delivery.id,worker_id:'worker_123',lease_token:delivery.leaseToken,application_id:app,payload_hash:delivery.payloadHash,kind:'check_channel',channel_id:parent,channel_type:0,permissions_ok:true,missing_permissions:[]};
  assert.equal((await bot('complete',{...base,channel_id:actor})).error,'invalid_delivery_result');
  assert.equal((await bot('complete',base)).recorded,true);
  await db.exec('reset role');assert.equal((await db.query<{permissions_ok:boolean}>('select permissions_ok from discord_bot_channels where channel_id=$1',[parent])).rows[0].permissions_ok,true);assert.equal((await db.query<{intake_active:boolean}>('select intake_active from discord_bot_servers')).rows[0].intake_active,false);
  assert.equal((await db.query('select * from support_tickets')).rows.length,0);assert.equal((await db.query("select * from discord_bot_config_deliveries where kind in ('publish_panel','disable_panel')")).rows.length,0);
 }finally{await db.close();}
});

test('Contractmigratie verandert geen bestaande onzekere/geleasede opdrachten of serverinstellingen',async()=>{
 const {db,staff,bot}=await setup(false,false);try{
  const server=String((await staff(null,'server_create',{name:'TESTFIXTURE',guildId:guild,applicationId:app})).serverId);
  await bot('report',{application_id:app,installed:true,runtime_version:'2',features:['typed_intake','ticket_panels','label_modals'],channels:[{id:parent,name:'TESTFIXTURE',type:0}]});
  await staff(server,'check_channel',{channelId:parent});await bot('claim',{worker_id:'worker_123'});await db.exec('reset role');
  const before=(await db.query('select * from discord_bot_config_deliveries')).rows;const servers=(await db.query('select * from discord_bot_servers')).rows;
  const acl=(await db.query("select proacl::text as acl,prosecdef,proowner from pg_proc where oid='private.discord_staff_action(uuid,uuid,text,jsonb)'::regprocedure")).rows;
  await db.exec(readFileSync(new URL('../supabase/migrations/20261016062843_discord_channel_check_contract.sql',import.meta.url),'utf8'));
  assert.deepEqual((await db.query('select * from discord_bot_config_deliveries')).rows,before);assert.deepEqual((await db.query('select * from discord_bot_servers')).rows,servers);assert.deepEqual((await db.query("select proacl::text as acl,prosecdef,proowner from pg_proc where oid='private.discord_staff_action(uuid,uuid,text,jsonb)'::regprocedure")).rows,acl);
 }finally{await db.close();}
});
