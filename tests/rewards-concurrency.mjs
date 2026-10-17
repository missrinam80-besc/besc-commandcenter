// Real overlapping PostgreSQL sessions. Only a dedicated fixture database may be used.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
const container=process.env.BESC_REWARDS_TEST_CONTAINER;
const docker=process.env.BESC_REWARDS_TEST_DOCKER || "docker";
if(container){
 assert.equal(container,"besc-bucks-xp-fixture-20261017");
 const info=JSON.parse(execFileSync(docker,["inspect",container],{encoding:"utf8"}))[0];
 assert.equal(info.Config.Labels["besc.purpose"],"isolated-bucks-xp-test");
 assert.equal(info.HostConfig.NetworkMode,"none");assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length,0);
 assert.equal(info.Mounts.some(m=>m.Type==="volume"||m.Type==="bind"),false);
}else if(process.env.PGHOST!=="127.0.0.1" || process.env.PGDATABASE!=="besc_concurrency_fixture")throw Error("Requires isolated localhost fixture");
let database=container?"postgres":process.env.PGDATABASE;
function processSql(query,interactive=false){
 const args=["-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-d",database];
 const command=container?docker:"psql";
 const all=container?["exec","-i",container,"psql","-h","/tmp","-U","postgres",...args]:args;
 const child=spawn(command,interactive?all:[...all,"-c",query],{env:process.env,stdio:["pipe","pipe","pipe"]});
 let out="",err="";const listeners=[];
 child.stdout.on("data",x=>{out+=x;for(const notify of listeners)notify(out);});child.stderr.on("data",x=>{err+=x;});
 const done=new Promise((resolve,reject)=>{child.on("error",reject);child.on("close",code=>resolve({code,out,err}));});
 return {child,done,write:x=>child.stdin.write(x),ready:()=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error("Holder not ready")),15000);
  const notify=x=>{if(x.includes("BESC_REWARD_READY")){clearTimeout(timer);resolve();}};listeners.push(notify);notify(out);
  done.then(r=>{if(!r.out.includes("BESC_REWARD_READY")){clearTimeout(timer);reject(Error(r.err||"Holder ended"));}},reject);
 })};
}
async function sql(query){const r=await processSql(query).done;assert.equal(r.code,0,r.err);return r.out.trim();}
const fixtureDatabase=container?`besc_rewards_fixture_${Date.now()}`:"besc_rewards_fixture";
await sql(`create database ${fixtureDatabase}`);database=fixtureDatabase;
const fixture=readFileSync(new URL("./helpers/rewards-fixture.sql",import.meta.url),"utf8")
 .replace("create role anon; create role authenticated; create role service_role bypassrls;",()=>`do $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;
 end$$;`);
await sql(fixture+readFileSync(new URL("../supabase/migrations/20261017162100_bucks_xp_v1.sql",import.meta.url),"utf8"));
const org="10000000-0000-4000-8000-000000000001";
const uid=n=>`20000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
await sql(`insert into organizations values('${org}');`);
for(let n=1;n<=4;n++)await sql(`insert into profiles values('${uid(n)}','11111111111111111${n}','TESTFIXTURE ${n}');
 insert into auth.users values('${uid(n)}',null);insert into auth.identities values('${uid(n)}','discord','11111111111111111${n}','{}');
 insert into organization_members values('${org}','${uid(n)}','active','${n<=2?"admin":"member"}',null);`);
const login=n=>`set role authenticated;select set_config('request.jwt.claim.sub','${uid(n)}',false);`;
const op=(name,d,key)=>`select rewards_web('${name}','${JSON.stringify({...d,organization_id:org})}','${key}');`;
await sql(login(1)+op("grant",{user_id:uid(3),xp:100,bucks:100,reason:"TESTFIXTURE"},"grant-member-three")+op("grant",{user_id:uid(4),xp:100,bucks:100,reason:"TESTFIXTURE"},"grant-member-four"));
assert.match(await sql(login(1)+op("manage",{},"fixture-read")),/"accounts"/);
const reward="30000000-0000-4000-8000-000000000001",unlimited="30000000-0000-4000-8000-000000000002";
await sql(`insert into reward_catalog(id,organization_id,title,description,price,stock,active) values
 ('${reward}','${org}','TESTFIXTURE voorraad','',60,1,true),('${unlimited}','${org}','TESTFIXTURE onbeperkt','',60,null,true)`);
async function overlap(first,second,n,phase,rollback=false){
 const prefix="set statement_timeout='15s';set lock_timeout='10s';";
 const holder=processSql("",true);let contender;
 try{
  holder.write(prefix+first+"\n\\echo BESC_REWARD_READY\n");await holder.ready();
  const name=`reward-${phase}`;contender=processSql(`set application_name='${name}';${prefix}${login(n)}begin;${second}commit;`);
  let waiting=false;const deadline=Date.now()+8000;
  while(Date.now()<deadline){if(await sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event_type='Lock'`)==="1"){waiting=true;break;}await pause(50);}
  assert.ok(waiting,"Expected genuinely overlapping, blocked PostgreSQL sessions");
  holder.write((rollback?"rollback;":"commit;")+"\n\\q\n");assert.equal((await holder.done).code,0);
  const r=await contender.done;assert.equal(r.code,0,r.err);return r.out;
 }finally{if(!holder.child.killed)holder.child.stdin.end();if(contender&&!contender.child.killed)contender.child.stdin.end();}
}
const request=(id,key)=>op("request",{reward_id:id,version:1},key);
const stock=await overlap(login(3)+"begin;"+request(reward,"stock-first"),request(reward,"stock-second"),4,"stock");assert.match(stock,/out_of_stock/);
assert.equal(await sql("select count(*) from reward_requests"),"1");
console.log("Echte overlap: laatste voorraad slechts eenmaal gereserveerd: OK");
const balance=await overlap(login(4)+"begin;"+request(unlimited,"balance-first"),request(unlimited,"balance-second"),4,"balance");assert.match(balance,/insufficient_bucks/);
console.log("Echte overlap: beschikbaar saldo niet dubbel besteed: OK");
const replay=await overlap(login(1)+"begin;"+op("grant",{user_id:uid(3),xp:1,bucks:1,reason:"TESTFIXTURE replay"},"same-key-replay"),op("grant",{user_id:uid(3),xp:1,bucks:1,reason:"TESTFIXTURE replay"},"same-key-replay"),1,"idempotency");assert.match(replay,/"ok": true/);
assert.equal(await sql("select count(*) from reward_ledger where reason='TESTFIXTURE replay'"),"1");
console.log("Echte overlap: dezelfde inzending levert eenmaal punten: OK");
const requestId=await sql(`select id from reward_requests where user_id='${uid(3)}'`);
const decide={id:requestId,version:1,decision:"approved",reason:""};
const decision=await overlap(login(1)+"begin;"+op("decide",decide,"decision-first"),op("decide",{...decide,decision:"rejected",reason:"TESTFIXTURE"},"decision-second"),2,"decision");assert.match(decision,/stale_version/);
console.log("Echte overlap: twee behandelaars beslissen niet dubbel: OK");
const rolled=await overlap(login(1)+"begin;"+op("grant",{user_id:uid(4),xp:2,bucks:2,reason:"TESTFIXTURE rollback"},"rollback-key"),op("grant",{user_id:uid(4),xp:2,bucks:2,reason:"TESTFIXTURE rollback"},"rollback-key"),1,"rollback",true);assert.match(rolled,/"ok": true/);
assert.equal(await sql("select count(*) from reward_ledger where reason='TESTFIXTURE rollback'"),"1");
console.log("Echte overlap: volledige rollback laat veilige herhaling toe: OK");
assert.equal(await sql(`select count(*) from reward_accounts a where a.xp<>(select coalesce(sum(xp_delta),0) from reward_ledger l where l.organization_id=a.organization_id and l.user_id=a.user_id)
 or a.bucks<>(select coalesce(sum(bucks_delta),0) from reward_ledger l where l.organization_id=a.organization_id and l.user_id=a.user_id)
 or a.reserved<>(select coalesce(sum(reserved_delta),0) from reward_ledger l where l.organization_id=a.organization_id and l.user_id=a.user_id)`),"0");
console.log("Alle saldi blijven gelijk aan de som van de historiek: OK");
