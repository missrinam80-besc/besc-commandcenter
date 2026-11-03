import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const org='10000000-0000-4000-8000-000000000001',admin='20000000-0000-4000-8000-000000000001',member='20000000-0000-4000-8000-000000000002';
const read=(file:string)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
async function setup(){
 const db=new PGlite();await db.exec(read('tests/helpers/rewards-fixture.sql'));
 await db.exec(`alter table auth.users add column deleted_at timestamptz;
 create function private.f1_lock() returns void language sql as $$select pg_advisory_xact_lock(1)$$;
 create function private.f2_account(o uuid) returns boolean language sql as $$select auth.uid() is not null$$;`);
 for(const f of ['20261017162100_bucks_xp_v1.sql','20261103164042_re01_reward_refunds_and_management.sql'])await db.exec(read('supabase/migrations/'+f));
 const intake=read('supabase/migrations/20261018213441_rewards_intake_receipts.sql');await db.exec(intake.slice(intake.indexOf('create function private.reward_intake_account'),intake.indexOf('create function private.reward_intake_operation')));
 for(const f of ['20261103202956_re02_verified_earning.sql','20261103202957_re03_controlled_balance_transfer.sql'])await db.exec(read('supabase/migrations/'+f));
 await db.query('insert into organizations values($1)',[org]);await db.query("insert into private.re03_release values($1,true,'TESTFIXTURE',clock_timestamp())",[org]);
 for(const [id,discord,twitch,role]of [[admin,'111111111111111111','101','admin'],[member,'222222222222222222','102','member']]){
  await db.query('insert into profiles values($1,$2,$3)',[id,discord,'TESTFIXTURE']);await db.query('insert into auth.users(id)values($1)',[id]);
  await db.query("insert into auth.identities values($1,'discord',$2,jsonb_build_object('sub',$2::text)),($1,'twitch',$3,jsonb_build_object('sub',$3::text))",[id,discord,twitch]);await db.query("insert into organization_members values($1,$2,'active',$3,null)",[org,id,role]);
 }
 const login=async(id=admin)=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
 const rpc=async(name:string,op:string,d:object={})=>(await db.query<{r:Record<string,unknown>}>(`select public.${name}($1,$2,$3) r`,[org,op,JSON.stringify(d)])).rows[0].r;
 const source=()=>({id:randomUUID(),broadcaster_id:'555',original_sha256:'b'.repeat(64),export_sha256:'a'.repeat(64),cutoff:new Date(Date.now()-60000).toISOString(),declared_total:'100',rows:[{twitch_user_id:'102',user_id:member,target:'100'}]});
 const prepare=async(p=source())=>{await login();return {p,r:await rpc('re03_transfer','prepare',p)};};
 const execute=(id:string,hash:string)=>rpc('re03_transfer','execute',{id,plan_sha256:hash,reason:'TESTFIXTURE',confirmed:true,source_stopped:true,cutoff_confirmed:true});
 const earning=async()=>{await login();await rpc('re02_admin','twitch_save',{broadcaster_id:'555',kind:'follow',xp:5,bucks:10,daily_xp:20,daily_bucks:40,cooldown_seconds:60,minimum_bits:1,version:0,reason:'TESTFIXTURE'});await rpc('re02_admin','twitch_activation',{broadcaster_id:'555',kind:'follow',version:1,enabled:true,reason:'TESTFIXTURE'});};
 const event=()=>({message_id:randomUUID(),subscription_id:'sub-follow',kind:'follow',occurred_at:new Date().toISOString(),twitch_user_id:'102'});
 const ingest=async(d=event())=>{await db.exec('reset role;set role service_role');return(await db.query<{r:Record<string,unknown>}>('select re02_twitch($1,$2,$3) r',[org,'555',JSON.stringify(d)])).rows[0].r;};
 return{db,login,rpc,source,prepare,execute,earning,event,ingest};
}
test('RE02: exact replay and re-follow award once; conflicting replay rejected',async()=>{
 const t=await setup();try{await t.earning();await t.login();const state=await t.rpc('re02_admin','state');assert.equal((state.twitch as {enabled:boolean}[])[0].enabled,true);const e=t.event();assert.equal((await t.ingest(e)).decision,'awarded');assert.equal((await t.ingest(e)).duplicate,true);assert.equal((await t.ingest()).decision,'follow_already_awarded');await assert.rejects(t.ingest({...e,twitch_user_id:'101'}),/idempotency_conflict/);
 await t.db.exec('reset role');assert.deepEqual((await t.db.query('select xp,bucks from reward_accounts where user_id=$1',[member])).rows,[{xp:5,bucks:10}]);}finally{await t.db.close();}
});
test('RE02: revocation and disabled rules cannot award; browser cannot enter provider bridge',async()=>{
 const t=await setup();try{assert.equal((await t.ingest()).decision,'disabled');await t.earning();await t.ingest({...t.event(),kind:'revocation'});assert.equal((await t.ingest()).decision,'subscription_revoked');await t.login();await assert.rejects(t.db.query('select re02_twitch($1,$2,$3)',[org,'555',JSON.stringify(t.event())]),/permission denied/);await t.login(member);await assert.rejects(t.rpc('re02_admin','state'),/rewards_forbidden/);}finally{await t.db.close();}
});
test('RE03: only target difference; XP/reservations retained; replay and source fence',async()=>{
 const t=await setup();try{await t.db.query('insert into reward_accounts values($1,$2,50,80,20)',[org,member]);const{p,r}=await t.prepare();assert.equal((r.plan as {difference:string}[])[0].difference,'20');const receipt=await t.execute(p.id,String(r.plan_sha256));assert.equal(receipt.bookings,1);assert.deepEqual(await t.execute(p.id,String(r.plan_sha256)),receipt);await t.db.exec('reset role');assert.deepEqual((await t.db.query('select xp,bucks,reserved from reward_accounts')).rows,[{xp:50,bucks:100,reserved:20}]);await assert.rejects(t.prepare(),/source_already_transferred/);}finally{await t.db.close();}
});
test('RE03: stale snapshot or unlinked identity blocks all bookings',async()=>{
 const t=await setup();try{const{p,r}=await t.prepare();await t.db.exec('reset role');await t.db.query('insert into reward_accounts values($1,$2,0,1,0)',[org,member]);await t.login();await assert.rejects(t.execute(p.id,String(r.plan_sha256)),/snapshot_changed/);const fresh=await t.prepare();await t.db.exec('reset role');await t.db.query("delete from auth.identities where user_id=$1 and provider='twitch'",[member]);await t.login();await assert.rejects(t.execute(fresh.p.id,String(fresh.r.plan_sha256)),/mapping_changed/);await t.db.exec('reset role');assert.equal((await t.db.query<{n:number}>('select count(*)::int n from reward_ledger')).rows[0].n,0);}finally{await t.db.close();}
});
test('RE03: duplicates, totals, wrong mapping and reserved balance are guarded',async()=>{
 const t=await setup();try{const p=t.source();await assert.rejects(t.prepare({...p,rows:[...p.rows,...p.rows]}),/duplicate_mapping/);await assert.rejects(t.prepare({...t.source(),declared_total:'101'}),/total_mismatch/);const bad=t.source();bad.rows[0].user_id=admin;await assert.rejects(t.prepare(bad),/mapping_unverified/);await t.db.exec('reset role');await t.db.query('insert into reward_accounts values($1,$2,0,200,150)',[org,member]);await assert.rejects(t.prepare(),/target_below_reservation/);await t.login(member);await assert.rejects(t.rpc('re03_transfer','state'),/rewards_forbidden/);await t.login();await assert.rejects(t.db.query('select * from private.re03_batches'),/permission denied/);}finally{await t.db.close();}
});
test('RE02 Discord approval: old queued events rejected; edit invalidates approval',async()=>{
 const t=await setup();try{
 await t.login();const d={organization_id:org,guild_id:'1067893182387474432',kind:'text',channel_ids:['333333333333333333'],xp:1,bucks:1,cooldown_seconds:60,daily_xp:10,daily_bucks:10,enabled:true,version:0};
 const web=async(data:object)=>t.db.query("select rewards_web('rule_save',$1,$2)",[JSON.stringify(data),randomUUID()]);
 await web(d);await t.rpc('re02_admin','discord_activation',{...d,version:1,enabled:true,reason:'TESTFIXTURE'});
 await assert.rejects(t.rpc('re02_admin','discord_activation',{...d,version:1,enabled:false,reason:'TESTFIXTURE'}),/stale_version/);
 await t.db.exec('reset role;set role service_role');
 assert.equal((await t.db.query<{r:{rules:unknown[]}}>("select rewards_bot($1,null,'fixture',$2,'activity_config','{}',null)r",[org,d.guild_id])).rows[0].r.rules.length,1);
 const activity=async(stamp:string)=>(await t.db.query<{r:{error?:string;ok?:boolean}}>("select rewards_bot($1,$2,'fixture',$3,'activity',$4,$5)r",[org,member,d.guild_id,JSON.stringify({kind:'text',channel_id:d.channel_ids[0],occurred_at:stamp}),randomUUID()])).rows[0].r;
 assert.equal((await activity(new Date(Date.now()-30000).toISOString())).error,'activity_disabled');
 assert.equal((await activity(new Date().toISOString())).ok,true);
 await t.login();await web({...d,version:2});await t.db.exec('reset role');
 assert.equal((await t.db.query<{enabled:boolean}>('select enabled from reward_rules')).rows[0].enabled,false);
 assert.equal((await t.db.query<{n:number}>('select count(*)::int n from private.re02_approvals')).rows[0].n,0);
 }finally{await t.db.close();}
});
test('RE02 cheer: minimum Bits, cooldown and UTC daily limits enforced',async()=>{
 const t=await setup();try{await t.login();await t.rpc('re02_admin','twitch_save',{broadcaster_id:'555',kind:'cheer',xp:5,bucks:10,daily_xp:5,daily_bucks:10,cooldown_seconds:60,minimum_bits:100,version:0,reason:'TESTFIXTURE'});await t.rpc('re02_admin','twitch_activation',{broadcaster_id:'555',kind:'cheer',version:1,enabled:true,reason:'TESTFIXTURE'});
 const cheer=(bits:number)=>({...t.event(),kind:'cheer',bits,anonymous:false});
 assert.equal((await t.ingest(cheer(99))).decision,'cheer_ineligible');assert.equal((await t.ingest(cheer(100))).decision,'awarded');assert.equal((await t.ingest(cheer(100))).decision,'cooldown');
 await t.db.exec('reset role');await t.db.query("update reward_ledger set metadata=jsonb_set(metadata,'{occurred_at}',to_jsonb((clock_timestamp()-interval '2 minutes')::text))");assert.equal((await t.ingest(cheer(100))).decision,'daily_limit');
 }finally{await t.db.close();}
});
test('RE03: independent operational release, explicit confirmation and numeric bounds',async()=>{
 const t=await setup();try{const{p,r}=await t.prepare();await t.db.exec('reset role');await t.db.query('delete from private.re03_release');await t.login();await assert.rejects(t.execute(p.id,String(r.plan_sha256)),/transfer_not_released/);
 await assert.rejects(t.db.query("select re03_set_enabled($1,true,'TESTFIXTURE')",[org]),/permission denied/);
 await t.db.exec('reset role');await t.db.query("insert into private.re03_release values($1,true,'TESTFIXTURE',clock_timestamp())",[org]);await t.login();
 await assert.rejects(t.rpc('re03_transfer','execute',{id:p.id,plan_sha256:r.plan_sha256,reason:'TESTFIXTURE',confirmed:false,source_stopped:true,cutoff_confirmed:true}),/explicit_confirmation_required/);
 const huge=t.source();huge.rows[0].target='2147483648';huge.declared_total=huge.rows[0].target;await assert.rejects(t.prepare(huge),/difference_out_of_range/);
 await assert.rejects(t.prepare({...t.source(),rows:[{twitch_user_id:'102',user_id:member,target:null as unknown as string}]}),/invalid_fields/);
 }finally{await t.db.close();}
});
