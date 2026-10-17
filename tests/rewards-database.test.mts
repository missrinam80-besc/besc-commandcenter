import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const org="10000000-0000-4000-8000-000000000001", foreign="10000000-0000-4000-8000-000000000002";
const uid=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const guild="1067893182387474432", channel="1558853872766689382";
type Result={error?:string;id?:string;requestId?:string;ok?:boolean;xp:number;bucks:number;reserved:number;available:number;level:number;items:{id:string;price:number;version:number}[];requests:{id:string;price:number;status:string;version:number}[];rules:unknown[]};
async function setup(){
 const db=new PGlite(); await db.exec(readFileSync(new URL("./helpers/rewards-fixture.sql",import.meta.url),"utf8"));
 await db.exec(readFileSync(new URL("../supabase/migrations/20261017162100_bucks_xp_v1.sql",import.meta.url),"utf8"));
 await db.query("insert into organizations values($1),($2)",[org,foreign]);
 for(let n=1;n<=7;n++){
  const discord=`11111111111111111${n}`;
  await db.query("insert into profiles values($1,$2,$3)",[uid(n),discord,`TESTFIXTURE ${n}`]);
  await db.query("insert into auth.users values($1,null)",[uid(n)]);
  await db.query("insert into auth.identities values($1,'discord',$2,jsonb_build_object('provider_id',$2::text))",[uid(n),discord]);
  await db.query("insert into organization_members values($1,$2,'active',$3,null)",[n===7?foreign:org,uid(n),n<=2||n===7?"admin":"member"]);
 }
 const login=async(n:number)=>{await db.exec("reset role;set role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);};
 const web=async(op:string,d:Record<string,unknown>={},k=randomUUID(),o=org)=>(await db.query<{r:Result}>("select rewards_web($1,$2,$3) r",[op,JSON.stringify({...d,organization_id:o}),k])).rows[0].r;
 const bot=async(op:string,d:Record<string,unknown>={},k=randomUUID(),user=uid(3))=>{
  await db.exec("reset role;set role service_role");
  return (await db.query<{r:Result}>("select rewards_bot($1,$2,'fixture-client',$3,$4,$5,$6) r",[org,user,guild,op,JSON.stringify(d),k])).rows[0].r;
 };
 const grant=async(n=3,bucks=100,xp=50)=>{await login(1);return web("grant",{user_id:uid(n),xp,bucks,reason:"TESTFIXTURE handmatig"});};
 const catalog=async(stock:number|null=1)=>{await login(1);return web("catalog_save",{title:"TESTFIXTURE — NIET PUBLICEREN",description:"Test",price:60,stock,active:true});};
 const request=async(id:string,n=3)=>{await login(n);return web("request",{reward_id:id,version:1});};
 const account=async(n=3)=>{await login(n);return web("account");};
 const admin=async()=>{await db.exec("reset role");};
 const rule=async(kind="text",patch:Record<string,unknown>={})=>{await login(1);return web("rule_save",{guild_id:guild,kind,channel_ids:[channel],xp:10,bucks:5,cooldown_seconds:60,daily_xp:15,daily_bucks:8,enabled:true,version:0,...patch});};
 return {db,login,web,bot,grant,catalog,request,account,admin,rule};
}
test("Bucks: veilige lege beginstand en geen geactiveerde regels of catalogus",async()=>{const t=await setup();try{
 const a=await t.account();assert.equal(a.xp,0);assert.equal(a.available,0);assert.equal(a.level,0);
 assert.deepEqual((await t.web("catalog")).items,[]);assert.deepEqual((await t.bot("activity_config")).rules,[]);
}finally{await t.db.close();}});
test("Bucks: unieke aanvraag, reserveren, afwijzen en annuleren geven eenmaal vrij",async()=>{const t=await setup();try{
 await t.grant();const item=await t.catalog();await t.login(3);const data={reward_id:item.id,version:1},key=randomUUID();
 const q=await t.web("request",data,key);assert.equal(q.error,undefined);assert.deepEqual(await t.web("request",data,key),q);
 assert.equal((await t.web("request",{...data,version:2},key)).error,"idempotency_conflict");
 let a=await t.account();assert.equal(a.available,40);assert.equal(a.reserved,60);assert.equal(a.bucks,100);
 await t.login(1);assert.equal((await t.web("decide",{id:q.requestId,version:1,decision:"rejected",reason:"TESTFIXTURE afgewezen"})).ok,true);
 a=await t.account();assert.equal(a.available,100);assert.equal(a.reserved,0);
 const next=await t.request(item.id!);assert.equal((await t.web("cancel",{id:next.requestId,version:1})).ok,true);
 assert.equal((await t.web("cancel",{id:next.requestId,version:2})).error,"invalid_state");assert.equal((await t.account()).available,100);
}finally{await t.db.close();}});
test("Bucks: goedkeuren schrijft eenmaal af, afhandelen schrijft niets extra af",async()=>{const t=await setup();try{
 await t.grant();const item=await t.catalog();const q=await t.request(item.id!);await t.login(1);const d={id:q.requestId,version:1,decision:"approved",reason:""},k=randomUUID();
 assert.equal((await t.web("decide",d,k)).ok,true);assert.equal((await t.web("decide",d,k)).ok,true);
 assert.equal((await t.web("decide",{...d,decision:"rejected"})).error,"stale_version");
 assert.equal((await t.web("fulfill",{id:q.requestId,version:2})).ok,true);
 const a=await t.account();assert.equal(a.bucks,40);assert.equal(a.available,40);assert.equal(a.reserved,0);
}finally{await t.db.close();}});
test("Bucks: voorraad en beschikbaar saldo blokkeren tweede aanvragen",async()=>{const t=await setup();try{
 await t.grant();await t.grant(4);const item=await t.catalog();assert.equal((await t.request(item.id!)).ok,true);
 assert.equal((await t.request(item.id!,4)).error,"out_of_stock");
 const other=await t.catalog(null);assert.equal((await t.request(other.id!)).error,"insufficient_bucks");
 await t.login(1);assert.equal((await t.web("catalog_save",{id:item.id,version:1,title:"TESTFIXTURE",description:"",price:10,stock:0,active:false})).error,"stock_reserved");
}finally{await t.db.close();}});
test("Bucks: prijs en titel blijven als snapshot in de aanvraag",async()=>{const t=await setup();try{
 await t.grant();const item=await t.catalog();await t.request(item.id!);await t.login(1);
 assert.equal((await t.web("catalog_save",{id:item.id,version:1,title:"TESTFIXTURE gewijzigd",description:"nieuw",price:5,stock:1,active:false})).ok,true);
 await t.login(3);const q=(await t.web("requests")).requests[0];assert.equal(q.price,60);assert.equal(q.status,"pending");
}finally{await t.db.close();}});
test("Bucks: rolrechten, organisatiegrenzen, directe writes en private bridges",async()=>{const t=await setup();try{
 await t.grant();await t.login(4);assert.equal((await t.db.query("select * from reward_accounts")).rows.length,0);
 await assert.rejects(t.web("manage"),/rewards_forbidden/);await assert.rejects(t.web("grant",{user_id:uid(4),xp:1,bucks:1,reason:"test"}),/rewards_forbidden/);
 await assert.rejects(t.db.query("update reward_accounts set bucks=999"),/permission denied/);
 await assert.rejects(t.db.query("select private.reward_web_bridge($1,'activity_config','{}',null)",[org]),/rewards_forbidden/);
 await assert.rejects(t.db.query("select rewards_bot($1,$2,'fixture',$3,'account','{}',null)",[org,uid(3),guild]),/permission denied/);
 await t.login(7);await assert.rejects(t.web("manage"),/rewards_forbidden/);await t.login(3);
 await assert.rejects(t.web("account",{},randomUUID(),foreign),/rewards_forbidden/);
 await t.admin();const priv=await t.db.query<{prosecdef:boolean}>("select prosecdef from pg_proc where proname in ('rewards_web','rewards_bot')");assert.ok(priv.rows.every(x=>!x.prosecdef));
}finally{await t.db.close();}});
test("Bucks: eigen aanvraag niet goedkeuren en niet andermans aanvraag annuleren",async()=>{const t=await setup();try{
 await t.grant(1);const item=await t.catalog();const q=await t.request(item.id!,1);
 assert.equal((await t.web("decide",{id:q.requestId,version:1,decision:"approved",reason:""})).error,"self_approval_forbidden");
 await t.login(4);assert.equal((await t.web("cancel",{id:q.requestId,version:1})).error,"not_found");
}finally{await t.db.close();}});
test("Bucks: actueel lidmaatschap, Auth-identity en blokkering blijven vereist bij replay",async()=>{const t=await setup();try{
 await t.grant();const item=await t.catalog();await t.login(3);const d={reward_id:item.id,version:1},key=randomUUID();assert.equal((await t.web("request",d,key)).ok,true);
 await t.admin();await t.db.query("delete from auth.identities where user_id=$1",[uid(3)]);await t.login(3);await assert.rejects(t.web("request",d,key),/rewards_forbidden/);
 await t.login(1);assert.equal((await t.web("grant",{user_id:uid(3),xp:1,bucks:1,reason:"TESTFIXTURE"})).error,"linked_membership_required");
 // Staff can release the reservation after a member loses access.
 await t.admin();const q=(await t.db.query<{id:string}>("select id from reward_requests")).rows[0];await t.login(1);
 assert.equal((await t.web("decide",{id:q.id,version:1,decision:"rejected",reason:"TESTFIXTURE ontkoppeld"})).ok,true);
 await t.admin();await t.db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[uid(4)]);await t.login(4);await assert.rejects(t.web("account"),/rewards_forbidden/);
}finally{await t.db.close();}});
test("Bucks: correctie is een tegenboeking, respecteert reserveringen en is eenmalig",async()=>{const t=await setup();try{
 await t.grant();await t.admin();const e=(await t.db.query<{id:string}>("select id from reward_ledger where kind='manual'")).rows[0];
 const item=await t.catalog();const q=await t.request(item.id!);await t.login(1);
 const d={user_id:uid(3),entry_id:e.id,reason:"TESTFIXTURE correctie"};assert.equal((await t.web("correct",d)).error,"insufficient_bucks");
 await t.login(3);await t.web("cancel",{id:q.requestId,version:1});await t.login(1);assert.equal((await t.web("correct",d)).ok,true);
 assert.equal((await t.web("correct",d)).error,"correction_unavailable");assert.equal((await t.account()).bucks,0);
}finally{await t.db.close();}});
test("XP: oplopende configureerbare levelgrenzen en stale versions",async()=>{const t=await setup();try{
 await t.login(1);assert.equal((await t.web("levels_save",{version:0,thresholds:[10,50,100]})).ok,true);
 assert.equal((await t.web("levels_save",{version:0,thresholds:[1]})).error,"stale_version");
 assert.equal((await t.web("levels_save",{version:1,thresholds:[10,5]})).error,"invalid_fields");
 await t.grant();assert.equal((await t.account()).level,2);
}finally{await t.db.close();}});
test("Discordtekst: kanaal, vertraging, wachttijd, daglimiet en replay",async()=>{const t=await setup();try{
 await t.rule();const d={kind:"text",channel_id:channel,occurred_at:new Date().toISOString()},k=randomUUID();
 assert.equal((await t.bot("activity",{...d,channel_id:"222222222222222222"})).error,"activity_disabled");
 assert.equal((await t.bot("activity",{...d,occurred_at:"2020-01-01T00:00:00Z"})).error,"activity_expired");
 const a=await t.bot("activity",d,k);assert.equal(a.ok,true);assert.deepEqual(await t.bot("activity",d,k),a);
 assert.equal((await t.bot("activity",d)).error,"cooldown");
 await t.admin();await t.db.exec("update reward_ledger set created_at=clock_timestamp()-interval '70 seconds'");
 assert.equal((await t.bot("activity",d)).ok,true);assert.equal((await t.account()).xp,15);assert.equal((await t.account()).bucks,8);
 await t.admin();await t.db.exec("update reward_ledger set created_at=clock_timestamp()-interval '70 seconds'");assert.equal((await t.bot("activity",d)).error,"daily_limit");
}finally{await t.db.close();}});
test("Discordvoice: alleen volledige, niet overlappende geschikte minuten",async()=>{const t=await setup();try{
 await t.rule("voice");const end=Date.now();const d={kind:"voice",channel_id:channel,occurred_at:new Date(end).toISOString(),started_at:new Date(end-60000).toISOString(),eligible_participants:2,muted:false,deafened:false,afk:false};
 assert.equal((await t.bot("activity",{...d,muted:true})).error,"voice_ineligible");
 assert.equal((await t.bot("activity",{...d,eligible_participants:1})).error,"voice_ineligible");
 assert.equal((await t.bot("activity",{...d,started_at:new Date(end-30000).toISOString()})).error,"voice_ineligible");
 assert.equal((await t.bot("activity",d)).ok,true);
 assert.equal((await t.bot("activity",d)).error,"voice_ineligible");
}finally{await t.db.close();}});
test("Bucks: gedeeltelijke mislukking laat geen rekening of boeking achter",async()=>{const t=await setup();try{
 await t.login(1);assert.equal((await t.web("grant",{user_id:uid(3),xp:1,bucks:-1,reason:"TESTFIXTURE"})).error,"invalid_fields");
 await t.admin();assert.equal((await t.db.query("select * from reward_accounts")).rows.length,0);assert.equal((await t.db.query("select * from reward_ledger")).rows.length,0);
}finally{await t.db.close();}});
test("Bucks: gedelegeerd beheer blijft aan de actieve rol binnen de organisatie gebonden",async()=>{const t=await setup();try{
 await t.admin();await t.db.query("insert into organization_access_roles values($1,$2,'{manageRewards}',null)",[uid(100),org]);
 await t.db.query("update organization_members set access_role_id=$1 where user_id=$2",[uid(100),uid(5)]);await t.login(5);assert.equal((await t.web("manage")).error,undefined);
 await t.admin();await t.db.query("update organization_access_roles set organization_id=$1 where id=$2",[foreign,uid(100)]);await t.login(5);await assert.rejects(t.web("manage"),/rewards_forbidden/);
 await t.admin();await t.db.query("update organization_access_roles set organization_id=$1,deleted_at=now() where id=$2",[org,uid(100)]);await t.login(5);await assert.rejects(t.web("manage"),/rewards_forbidden/);
 await t.admin();await t.db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[uid(1)]);await t.login(1);await assert.rejects(t.web("manage"),/rewards_forbidden/);
}finally{await t.db.close();}});
test("Discordvoice: minimum deelnemers en mute/deafen/AFK zijn configureerbaar",async()=>{const t=await setup();try{
 assert.equal((await t.rule("voice",{voice_min_participants:1,exclude_muted:false,exclude_deafened:false,exclude_afk:false})).ok,true);
 const end=Date.now();assert.equal((await t.bot("activity",{kind:"voice",channel_id:channel,occurred_at:new Date(end).toISOString(),started_at:new Date(end-60000).toISOString(),eligible_participants:1,muted:true,deafened:true,afk:true})).ok,true);
}finally{await t.db.close();}});
test("Discordregels: een uitgeschakelde configuratie kent niets toe en vreemde servers zijn geweigerd",async()=>{const t=await setup();try{
 assert.equal((await t.rule("text",{enabled:false})).ok,true);assert.deepEqual((await t.bot("activity_config")).rules,[]);
 assert.equal((await t.bot("activity",{kind:"text",channel_id:channel,occurred_at:new Date().toISOString()})).error,"activity_disabled");
 assert.equal((await t.rule("text",{guild_id:"222222222222222222"})).error,"server_unavailable");
}finally{await t.db.close();}});
