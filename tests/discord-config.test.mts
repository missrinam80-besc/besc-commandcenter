import assert from 'node:assert/strict';

import test from 'node:test';

import {readFileSync} from 'node:fs';

import {PGlite} from '@electric-sql/pglite';

import {blankType,normalizeTicketAnswers,typeDraftSchema,discordInstallUrl} from '../src/lib/discord-ticket-config.ts';

import {hasPermission} from '../src/lib/permissions.ts';

import {canViewInternalPath} from '../src/lib/route-permissions.ts';

const org='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',user='20000000-0000-4000-8000-000000000001',guild='1067893182387474432',parent='1558853872766689382',app='1558542661265129474',actor='111111111111111111';

const snow=()=>((BigInt(Date.now()-1420070400000)<<BigInt(22))+BigInt(Math.floor(Math.random()*100000))).toString();

async function setup(legacy=false){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;grant usage on schema private,auth to authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table auth.identities(user_id uuid,provider text,provider_id text,identity_data jsonb);create table organizations(id uuid primary key);create table profiles(id uuid primary key,display_name text);create table organization_access_roles(id uuid primary key,organization_id uuid,capabilities text[],deleted_at timestamptz);create table organization_members(organization_id uuid,user_id uuid,role text,status text,access_role_id uuid);grant select on organizations,profiles,organization_members,organization_access_roles to service_role;`);await db.exec(readFileSync(new URL('../supabase/migrations/20261011130951_ticketing_v1.sql',import.meta.url),'utf8'));await db.query('insert into organizations values($1),($2)',[org,other]);await db.query("insert into profiles values($1,'TESTFIXTURE');insert into organization_members values($2,$1,'admin','active',null)",[user,org]).catch(async()=>{await db.query("insert into profiles values($1,'TESTFIXTURE')",[user]);await db.query("insert into organization_members values($1,$2,'admin','active',null)",[org,user]);});await db.query("insert into auth.identities values($1,'discord',$2,$3)",[user,actor,JSON.stringify({provider_id:actor})]);if(legacy){await db.query("insert into support_tickets(id,organization_id,client_id,guild_id,requester_discord_id,subject,parent_channel_id,thread_id,link_status) values($1,$2,'fixture-client',$3,$4,'TESTFIXTURE — Oud ticket',$5,$4,'linked')",[user,org,guild,actor,parent]);await db.query("insert into support_ticket_messages(organization_id,ticket_id,direction,content) values($1,$2,'internal','Bestaande interne notitie')",[org,user]);}await db.exec(readFileSync(new URL('../supabase/migrations/20261012185859_discord_ticketing_v2.sql',import.meta.url),'utf8'));

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

 assert.equal((await staff(server,'activate',{version:1})).saved,true);assert.equal((await staff(server,'check_channel',{channelId:parent})).saved,true);claim=await bot('claim',{worker_id:'worker_123'});delivery=(claim.deliveries as Record<string,unknown>[])[0];assert.equal(delivery.kind,'check_channel');

 await bot('complete',{delivery_id:delivery.id,worker_id:'worker_123',lease_token:delivery.leaseToken,application_id:app,payload_hash:delivery.payloadHash,kind:delivery.kind,channel_id:parent,channel_type:0,permissions_ok:true,missing_permissions:[]});

 assert.equal((await staff(server,'publish',{id:panel,version:1})).saved,true);claim=await bot('claim',{worker_id:'worker_123'});delivery=(claim.deliveries as Record<string,unknown>[])[0];assert.equal(delivery.kind,'publish_panel');const revision=String(delivery.revisionId);

 await bot('complete',{delivery_id:delivery.id,worker_id:'worker_123',lease_token:delivery.leaseToken,application_id:app,payload_hash:delivery.payloadHash,kind:delivery.kind,channel_id:parent,message_id:actor,bot_author_id:app,revision_id:revision});

 const config=await bot('config',{});assert.equal(config.schemaVersion,2);const tr=(config.typeRevisions as Record<string,unknown>[])[0];assert.ok(tr.revisionId);

 await db.exec('reset role');await assert.rejects(db.query("update discord_ticket_type_revisions set payload='{}'"));await assert.rejects(db.query("delete from discord_ticket_panel_revisions"));



 // Stale leases reconcile the same publication; a late old lease cannot complete it.

 await staff(server,'panel_save',{id:panel,version:2,draft:pd});

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
 await staff(server,'disable',{id:panel,version:4});assert.equal((await bot('inspect',inspect)).withdrawn,true);
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

