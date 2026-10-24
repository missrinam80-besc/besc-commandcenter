import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { f1Database, q } from './helpers/f1-database.mts';

test('F5 machine read: own accepted participation, exact projection, grants and current revocation',async()=>{
 const f=await f1Database();
 try {
  const discord='222222222222222222', c=randomUUID(), policy=randomUUID(), participant=randomUUID();
  await f.owner();
  await f.db.exec(`update auth.users set email_confirmed_at=now() where id=${q(f.ids.member)};
    update public.profiles set discord_user_id=${q(discord)} where id=${q(f.ids.member)};
    insert into auth.identities(user_id,provider,provider_id,identity_data) values(${q(f.ids.member)},'discord',${q(discord)},jsonb_build_object('sub',${q(discord)}));
    insert into public.campaigns(id,organization_id,title,created_by) values(${q(c)},${q(f.ids.org)},'TESTFIXTURE F5 eigen campagne',${q(f.ids.chair)});
    insert into private.campaign_pilots(campaign_id,organization_id,synthetic,created_by) values(${q(c)},${q(f.ids.org)},true,${q(f.ids.chair)});
    insert into private.campaign_policies(id,organization_id,campaign_id,version,body,retention,fields,document_id,created_by)
      values(${q(policy)},${q(f.ids.org)},${q(c)},1,'TESTFIXTURE alleen eigen leesproef','TESTFIXTURE tijdelijk bewaren',array['post_url'],${q(f.ids.policyDoc)},${q(f.ids.chair)});
    insert into private.campaign_participants(id,organization_id,campaign_id,person_id,account_user_id,policy_id,accepted_at,expires_at,created_by)
      values(${q(participant)},${q(f.ids.org)},${q(c)},${q(f.ids.otherPerson)},${q(f.ids.member)},${q(policy)},now(),now()+interval '1 hour',${q(f.ids.chair)});`);
  const sql=(u=f.ids.member,o=f.ids.org,pilot=true,real=false)=>`select public.f5_bot_own_campaigns(${q(o)},${q(discord)},${q(u)},0,${pilot},${real}) v`;
  const read=async()=> (await f.db.query<{v:{campaigns:{id:string;title:string;synthetic:boolean}[]}}>(sql())).rows[0].v.campaigns;
  for(const role of ['anon','authenticated']){await f.actor(f.ids.member,role);await assert.rejects(f.db.query(sql()),/permission denied/);}
  await f.actor(f.ids.admin,'service_role');
  const rows=await read();assert.equal(rows.length,1);assert.deepEqual(Object.keys(rows[0]).sort(),['id','synthetic','title']);assert.equal(rows[0].id,c);
  await assert.rejects(f.db.query(`select public.f3_my_campaigns(${q(f.ids.org)})`),/permission denied/);
  await assert.rejects(f.db.query('select * from private.campaign_participants'),/permission denied/);
  await assert.rejects(f.db.query(sql(f.ids.chair)),/f5_account_unavailable/);
  await assert.rejects(f.db.query(sql(f.ids.member,f.ids.otherOrg)),/f5_account_unavailable/);
  assert.deepEqual((await f.db.query<{v:{campaigns:unknown[]}}>(sql(f.ids.member,f.ids.org,false,false))).rows[0].v.campaigns,[]);
  await f.owner();await f.db.exec(`update private.campaign_pilots set synthetic=false,opening_document_id=${q(f.ids.policyDoc)} where campaign_id=${q(c)}`);
  await f.actor(f.ids.admin,'service_role');assert.deepEqual(await read(),[]);
  assert.equal((await f.db.query<{v:{campaigns:unknown[]}}>(sql(f.ids.member,f.ids.org,false,true))).rows[0].v.campaigns.length,1);
  await f.owner();await f.db.exec(`update private.campaign_pilots set synthetic=true where campaign_id=${q(c)}`);
  for(const state of ['withdrawn','expired','unaccepted','purpose','closed']){
   await f.owner();await f.db.exec(`update private.campaign_participants set withdrawn_at=null,accepted_at=now(),expires_at=now()+interval '1 hour' where id=${q(participant)};update private.campaign_policies set withdrawn_at=null where id=${q(policy)};update private.campaign_pilots set closed_at=null where campaign_id=${q(c)};`);
   if(state==='withdrawn')await f.db.exec(`update private.campaign_participants set withdrawn_at=now() where id=${q(participant)}`);
   if(state==='expired')await f.db.exec(`update private.campaign_participants set expires_at=now()-interval '1 hour' where id=${q(participant)}`);
   if(state==='unaccepted')await f.db.exec(`update private.campaign_participants set accepted_at=null where id=${q(participant)}`);
   if(state==='purpose')await f.db.exec(`update private.campaign_policies set withdrawn_at=now() where id=${q(policy)}`);
   if(state==='closed')await f.db.exec(`update private.campaign_pilots set closed_at=now() where campaign_id=${q(c)}`);
   await f.actor(f.ids.admin,'service_role');assert.deepEqual(await read(),[],state);
  }
  await f.owner();await f.db.exec(`update private.campaign_pilots set closed_at=null where campaign_id=${q(c)};`);
  if(process.env.F1_NATIVE_TEST==='1') {
   // Block the actor read, commit a withdrawal while it waits, then release it.
   const require=createRequire(import.meta.url), {Client}=require('pg'), blocker=new Client();await blocker.connect();
   try {
    await blocker.query('begin');await blocker.query(`select 1 from auth.users where id=${q(f.ids.member)} for update`);
    await f.actor(f.ids.admin,'service_role');
    const reading=read();let waiting=false;
    for(let attempt=0;attempt<100;attempt++){
     const status=await blocker.query("select exists(select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%f5_bot_own_campaigns%') yes");
     if(status.rows[0].yes){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert(waiting,'Read must actually wait on actor lock');
    await blocker.query(`update private.campaign_participants set withdrawn_at=now() where id=${q(participant)}`);
    await blocker.query('commit');assert.deepEqual(await reading,[]);
   }finally{await blocker.query('rollback');await blocker.end();}
  }
  await f.owner();await f.db.exec(`update auth.identities set identity_data='{"sub":"different"}' where user_id=${q(f.ids.member)} and provider='discord'`);
  await f.actor(f.ids.admin,'service_role');await assert.rejects(read(),/f5_account_unavailable/);
 }finally{await f.db.close();}
});
