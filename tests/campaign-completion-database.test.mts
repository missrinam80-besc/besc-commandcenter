import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { f1Database, q, j } from './helpers/f1-database.mts';
test('Campaign completion database: real opening, Twitch reservation/commit, no forged official data, revocation',async()=>{
 const f=await f1Database();try{
 const sessions=new Map<string,string>();for(const user of [f.ids.chair,f.ids.member,f.ids.reviewer,f.ids.admin]){const id=randomUUID();sessions.set(user,id);await f.owner();await f.db.exec(`update auth.users set email_confirmed_at=now() where id=${q(user)};insert into auth.sessions(id,user_id) values(${q(id)},${q(user)});`);}
 const actor=async(user:string,role='authenticated')=>{await f.owner();await f.actor(user,role);await f.db.exec(`select set_config('request.jwt.claims',${q(JSON.stringify({sub:user,role,session_id:sessions.get(user)}))},false)`);};
 const c=randomUUID(),account=randomUUID();await f.owner();await f.db.exec(`insert into public.campaigns(id,organization_id,title,created_by) values(${q(c)},${q(f.ids.org)},'Lokale voorbeeldcampagne',${q(f.ids.chair)});insert into public.social_accounts(id,organization_id,platform,external_account_id,account_name,status,created_by) values(${q(account)},${q(f.ids.org)},'twitch','123','TESTFIXTURE source','connected',${q(f.ids.chair)});insert into auth.identities(user_id,provider,identity_data) values(${q(f.ids.member)},'twitch','{"sub":"123"}');insert into private.social_account_credentials(social_account_id,organization_id,access_token_secret_id) values(${q(account)},${q(f.ids.org)},${q(randomUUID())});`);
 const call=async(op:string,d:unknown={})=>(await f.db.query<{v:{id:string}}>(`select public.f3_workflow(${q(f.ids.org)},${q(c)},${q(op)},${j(d)},${q(randomUUID())}) v`)).rows[0].v;
 await actor(f.ids.chair);await call('campaign.open',{document_id:f.ids.policyDoc});for(const [user_id,role] of [[f.ids.chair,'editor'],[f.ids.reviewer,'reviewer']])await call('access.assign',{user_id,role,valid_until:new Date(Date.now()+3600000).toISOString()});
 const policy=await call('policy.set',{version:1,body:'Example campaign scope',retention:'Example retention decision',fields:['post_url','views'],document_id:f.ids.policyDoc});const part=await call('participant.select',{person_id:f.ids.otherPerson,policy_id:policy.id,expires_at:new Date(Date.now()+3600000).toISOString()});await actor(f.ids.member);await call('participant.accept',{id:part.id,accepted:true});const post=await call('post.submit',{participant_id:part.id,platform:'twitch',external_id:'video:456'});
 await actor(f.ids.reviewer);await call('post.review',{id:post.id,expected_revision:1,decision:'verified',availability:'available',reason:'Example independent review'});
 await actor(f.ids.chair);const source=await call('source.assign',{participant_id:part.id,account_id:account,document_id:f.ids.policyDoc,daily_limit:30});
 const ticket=(await f.db.query<{v:{id:string}}>(`select public.f3_twitch_begin(${q(f.ids.org)},${q(c)},${q(source.id)},${q(post.id)},${q(randomUUID())}) v`)).rows[0].v;
 const at=new Date().toISOString(),sample={metric:'views',definition:'twitch.video.view_count.v1',semantics:'cumulative',value:42,quality:'known',measured_at:at,period_start:new Date(Date.parse(at)-1).toISOString(),period_end:at,source_reference:'Twitch Helix video; twitch.video.view_count.v1'};
 await assert.rejects(f.db.query(`select public.f3_twitch_finish(${q(ticket.id)},${j(sample)},null)`),/permission denied/);
 await actor(f.ids.admin,'service_role');await f.db.query(`select public.f3_twitch_finish(${q(ticket.id)},${j(sample)},null)`);
 await actor(f.ids.chair);let state=(await f.db.query<{v:{synthetic:boolean;measurements:unknown[]}}>(`select public.f3_campaign_state(${q(f.ids.org)},${q(c)}) v`)).rows[0].v;assert.equal(state.synthetic,false);assert.equal(state.measurements.length,1);
 const own=(await f.db.query<{v:{id:string}[]}>(`select public.f3_my_campaigns(${q(f.ids.org)}) v`)).rows[0].v;assert(own.some(x=>x.id===c));
 await actor(f.ids.admin);assert.deepEqual((await f.db.query<{v:unknown[]}>(`select public.f3_my_campaigns(${q(f.ids.org)}) v`)).rows[0].v,[]);
 await actor(f.ids.chair);
 await call('source.revoke',{id:source.id});state=(await f.db.query<{v:{synthetic:boolean;measurements:unknown[]}}>(`select public.f3_campaign_state(${q(f.ids.org)},${q(c)}) v`)).rows[0].v;assert.equal(state.measurements.length,0);
 }finally{await f.db.close();}
});
