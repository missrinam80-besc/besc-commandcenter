import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {q,j,type f1Database} from './f1-database.mts';
import {parseBalanceSnapshot,balanceSnapshotMaterial} from '../../src/lib/balance-reconciliation.ts';
export async function checkF5Extensions(f:Awaited<ReturnType<typeof f1Database>>){
 const {org,chair,member,admin,otherPerson,policyDoc}=f.ids;
 const c=randomUUID(),policy=randomUUID(),participant=randomUUID(),account=randomUUID(),source=randomUUID(),discord='222222222222222222';
 const sessions=new Map<string,string>();await f.owner();
 for(const u of [chair,member,admin]){const session=randomUUID();sessions.set(u,session);await f.db.exec(`update auth.users set email_confirmed_at=now() where id=${q(u)};insert into auth.sessions(id,user_id) values(${q(session)},${q(u)});`);}
 const actor=async(u:string,role='authenticated')=>{await f.actor(u,role);await f.db.exec(`select set_config('request.jwt.claims',${j({sub:u,role,session_id:sessions.get(u)})}::text,false)`);};
 await f.owner();await f.db.exec(`update auth.identities set identity_data=jsonb_build_object('sub',${q(discord)}) where user_id=${q(member)} and provider='discord';
 insert into auth.identities(user_id,provider,provider_id,identity_data) values(${q(member)},'twitch','123','{"sub":"123"}');
 insert into public.campaigns(id,organization_id,title,created_by) values(${q(c)},${q(org)},'TESTFIXTURE F5 real-shaped campaign',${q(chair)});
 insert into private.campaign_pilots(campaign_id,organization_id,synthetic,opening_document_id,created_by) values(${q(c)},${q(org)},false,${q(policyDoc)},${q(chair)});
 insert into private.campaign_access(organization_id,campaign_id,user_id,role,valid_until,created_by) values(${q(org)},${q(c)},${q(chair)},'editor',now()+interval '1 hour',${q(chair)});
 insert into private.campaign_policies(id,organization_id,campaign_id,version,body,retention,fields,document_id,created_by) values(${q(policy)},${q(org)},${q(c)},1,'TESTFIXTURE bounded source policy','TESTFIXTURE retain for fixture',array['post_url'],${q(policyDoc)},${q(chair)});
 insert into private.campaign_participants(id,organization_id,campaign_id,person_id,account_user_id,policy_id,accepted_at,expires_at,created_by) values(${q(participant)},${q(org)},${q(c)},${q(otherPerson)},${q(member)},${q(policy)},now(),now()+interval '1 hour',${q(chair)});
 insert into public.social_accounts(id,organization_id,platform,external_account_id,account_name,status,quota_daily_limit,created_by) values(${q(account)},${q(org)},'twitch','123','TESTFIXTURE Twitch','connected',1000,${q(chair)});
 insert into private.social_account_credentials(social_account_id,organization_id,access_token_secret_id) values(${q(account)},${q(org)},${q(randomUUID())});
 insert into private.campaign_sources(id,organization_id,campaign_id,participant_id,account_id,broadcaster_id,document_id,daily_limit,created_by) values(${q(source)},${q(org)},${q(c)},${q(participant)},${q(account)},'123',${q(policyDoc)},100,${q(chair)});`);
 const snow=(offset=0)=>(((BigInt(Date.now())-BigInt(1420070400000))*BigInt(4194304))+BigInt(offset)).toString();
 const submitSql=(key:string,external='clip:TESTFIXTURE_A')=>`select public.f5_bot_submit(${q(org)},'111111111111111111',${q(discord)},${q(member)},${q(c)},null,${q(key)},'twitch',${q(external)},false,true) v`;
 const key=snow();await actor(admin,'service_role');const post=(await f.db.query<{v:{id:string;replay:boolean;status:string}}>(submitSql(key))).rows[0].v;assert.equal(post.status,'candidate');
 assert.equal((await f.db.query<{v:{replay:boolean}}>(submitSql(key))).rows[0].v.replay,true);
 await assert.rejects(f.db.query(submitSql(key,'clip:TESTFIXTURE_B')),/f5_conflict/);
 await f.owner();await f.db.exec(`update private.campaign_policies set fields=array['views'] where id=${q(policy)}`);await actor(admin,'service_role');await assert.rejects(f.db.query(submitSql(key)),/f5_not_available/);
 await f.owner();await f.db.exec(`update private.campaign_policies set fields=array['post_url'] where id=${q(policy)}`);
 await f.owner();await f.db.exec(`update private.campaign_participants set withdrawn_at=now() where id=${q(participant)}`);
 await actor(admin,'service_role');await assert.rejects(f.db.query(submitSql(key)),/f5_not_available/);
 await f.owner();await f.db.exec(`update private.campaign_participants set withdrawn_at=null where id=${q(participant)}`);
 if(process.env.F1_NATIVE_TEST==='1'){
  const require=createRequire(import.meta.url),{Client}=require('pg'),one=new Client(),two=new Client();await one.connect();await two.connect();
  try{
   await one.query('set role service_role');await two.query('set role service_role');await f.db.exec('begin;select private.f1_lock();');
   const same=snow(11),pending=[one.query(submitSql(same,'clip:TESTFIXTURE_Race')),two.query(submitSql(same,'clip:TESTFIXTURE_Race'))];let waited=false;
   for(let i=0;i<100;i++){const r=await f.db.query<{n:number}>("select count(*)::int n from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%f5_bot_submit%'");if(r.rows[0].n===2){waited=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
   await f.db.exec('commit');assert(waited,'Both identical writes must overlap behind the lock');const results=await Promise.all(pending);assert.equal(results[0].rows[0].v.id,results[1].rows[0].v.id);assert.deepEqual(results.map(r=>r.rows[0].v.replay).sort(),[false,true]);
  }finally{await f.db.exec('rollback');await one.end();await two.end();}
 }
 const reference={schemaVersion:1,kind:'clip',reference_id:'clip:TESTFIXTURE_Source',canonical_url:'https://clips.twitch.tv/TESTFIXTURE_Source',occurred_at:new Date().toISOString()};
 const receive=`select public.f5_receive_reference(${q(org)},${q(source)},'123',${j(reference)}) v`;
 await actor(admin,'service_role');const ack=(await f.db.query<{v:{accepted:boolean;providerVerified:boolean;awarded:boolean}}>(receive)).rows[0].v;assert.equal(ack.accepted,true);assert.equal(ack.providerVerified,false);assert.equal(ack.awarded,false);
 assert.equal((await f.db.query<{v:{replay:boolean}}>(receive)).rows[0].v.replay,true);
 await f.owner();assert.equal((await f.db.query<{n:number}>(`select count(*)::int n from public.reward_ledger where organization_id=${q(org)}`)).rows[0].n,0);
 await f.db.exec(`update private.campaign_sources set revoked_at=now() where id=${q(source)}`);await actor(admin,'service_role');await assert.rejects(f.db.query(receive),/f5_source_unavailable/);
 await f.owner();await f.db.exec(`update private.campaign_sources set revoked_at=null where id=${q(source)}`);
 await actor(chair);const request=randomUUID(),end=new Date().toISOString(),start=new Date(Date.now()-3600000).toISOString();
 const begin=`select public.f5_discovery_begin(${q(org)},${q(c)},${q(source)},${q(request)},${q(start)},${q(end)}) v`;
 const run=(await f.db.query<{v:{id:string;status:string}}>(begin)).rows[0].v;assert.equal(run.status,'new');assert.equal((await f.db.query<{v:{status:string}}>(begin)).rows[0].v.status,'pending');
 await actor(admin,'service_role');const items=[{kind:'clip',external_id:'clip:TESTFIXTURE_Discovery',url:'https://clips.twitch.tv/TESTFIXTURE_Discovery',title:'TESTFIXTURE suggested clip'}];
 assert.equal((await f.db.query<{v:{status:string}}>(`select public.f5_discovery_finish(${q(run.id)},${j(items)},null) v`)).rows[0].v.status,'ready');
 await actor(chair);const selected=(await f.db.query<{v:{id:string}}>(`select public.f5_discovery_submit(${q(org)},${q(run.id)},0,${q(randomUUID())}) v`)).rows[0].v;
 await f.owner();assert.equal((await f.db.query<{status:string}>(`select status from private.campaign_contributions where id=${q(selected.id)}`)).rows[0].status,'candidate');
 await actor(member);await assert.rejects(f.db.query(`select public.f5_discovery_state(${q(org)},${q(c)})`),/f5_not_available/);await assert.rejects(f.db.query(`select public.f5_reward_snapshot(${q(org)})`),/f5_not_available/);
 await actor(chair);await f.db.query(`select public.rewards_web('grant',${j({organization_id:org,user_id:member,xp:7,bucks:30,reason:'TESTFIXTURE compare only'})},${q(randomUUID())})`);
 const snapshot=parseBalanceSnapshot((await f.db.query<{v:unknown}>(`select public.f5_reward_snapshot(${q(org)}) v`)).rows[0].v);assert.equal(snapshot.accounts[0].bucks,'30');assert.equal(createHash('sha256').update(balanceSnapshotMaterial(snapshot)).digest('hex'),snapshot.accountsDigest);
 await actor(admin,'service_role');await assert.rejects(f.db.query(`select public.f5_reward_snapshot(${q(org)})`),/permission denied/);
}
