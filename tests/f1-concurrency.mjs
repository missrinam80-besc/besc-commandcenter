// Real PostgreSQL connections; refuses every target except the dedicated fixture.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_f1_fixture'||process.env.PGUSER!=='postgres')throw Error('Requires isolated localhost besc_f1_fixture');
const root=new pg.Client(),a=new pg.Client(),b=new pg.Client();
const call=(c,o,op,data,id=randomUUID())=>c.query('select public.f1_workflow($1,$2,$3,$4) result',[o,op,data,id]).then(r=>r.rows[0].result);
async function login(c,id){await c.query('begin');await c.query("set local lock_timeout='5s'");await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[id]);}
async function transaction(c,id,fn){await login(c,id);try{const r=await fn();await c.query('commit');return r;}catch(error){await c.query('rollback');throw error;}}
async function waiting(){const until=Date.now()+2000;while(Date.now()<until){const r=await root.query("select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock') blocked",[b.processID]);if(r.rows[0].blocked)return;await new Promise(r=>setTimeout(r,10));}throw Error('Second connection did not reach the expected lock barrier');}
const capture=p=>p.then(value=>({value}),error=>({error}));
try{
 await Promise.all([root.connect(),a.connect(),b.connect()]);
 assert.match((await root.query('show server_version')).rows[0].server_version,/^17\./);
 const org=(await root.query("select id from public.organizations where slug='besc'")).rows[0].id;
 const users=Object.fromEntries((await root.query("select split_part(email,'@',1) name,id from auth.users where email like '%@fixture.invalid'")).rows.map(r=>[r.name,r.id]));
 const deadline=(await root.query("select id,f1_revision from public.compliance_deadlines where title='TESTFIXTURE Verplichting'")).rows[0];
 const content=(await root.query("select id from public.content_items where title='TESTFIXTURE Nieuws'")).rows[0].id;
 const verification=(await root.query('select id from public.association_identity_verifications where account_user_id=$1 and revoked_at is null',[users.chair])).rows[0].id;

 await login(a,users.chair);await call(a,org,'identity.revoke',{id:verification,reason:'TESTFIXTURE concurrent mandaatbinding intrekken'});
 await login(b,users.chair);let pending=capture(call(b,org,'governance.review',{source_type:'deadline',source_id:deadline.id,expected_revision:Number(deadline.f1_revision),dimension:'applicability',outcome:'applicable',reason:'TESTFIXTURE concurrent besluit',conflict_declared:false}));
 await waiting();await a.query('commit');let result=await pending;assert.match(result.error?.message??'',/f1_.*(required|authorized)/);await b.query('rollback');
 await root.query('update public.association_identity_verifications set revoked_at=null,reason=null where id=$1',[verification]);
 console.log('R02: committed identity revocation blocks a waiting formal decision.');

 const payload={title:'TESTFIXTURE — NIET PUBLICEREN',summary:'Uitsluitend fixture',slug:'testfixture',locale:'nl-BE',body:{format:'sanitized_html',value:'<p>TESTFIXTURE</p>'},media:[]};
 async function draft(consentId){const rev=Number((await root.query('select f1_revision from public.content_items where id=$1',[content])).rows[0].f1_revision);const r=await transaction(a,users.chair,()=>call(a,org,'publication.draft',{source_type:'news',source_id:content,expected_revision:rev,payload,...(consentId?{consent_id:consentId}:{})}));const hash=(await root.query('select payload_sha256 from public.publication_revisions where id=$1',[r.id])).rows[0].payload_sha256;await transaction(a,users.chair,()=>call(a,org,'publication.submit',{id:r.id,expected_hash:hash}));return {id:r.id,expected_hash:hash};}
 const first=await draft();
 await login(a,users.chair);await a.query("update public.content_items set title='TESTFIXTURE gewijzigde bron' where id=$1",[content]);
 await login(b,users.reviewer);pending=capture(call(b,org,'publication.review',{...first,decision:'approved_for_publication',reason:'TESTFIXTURE review',rights_confirmed:true}));
 await waiting();await a.query('commit');result=await pending;assert.match(result.error?.message??'',/f1_revision_conflict/);await b.query('rollback');
 console.log('R03: committed source change blocks a waiting revision approval.');

 const policy=(await root.query("select id from public.document_registry where label='TESTFIXTURE policyDoc'")).rows[0].id;
 const p=await transaction(a,users.chair,()=>call(a,org,'consent.purpose',{purpose_code:'public_profile',text_version:1,title:'TESTFIXTURE specifiek doel',body:'TESTFIXTURE — NIET PUBLICEREN — specifieke tekst',allowed_scope:{fields:['display_name']},legal_basis:'TESTFIXTURE',retention_policy:'TESTFIXTURE',policy_document_id:policy}));
 await transaction(a,users.chair,()=>call(a,org,'consent.activate_purpose',{id:p.id,policy_confirmed:true}));
 const consent=await transaction(a,users.chair,()=>call(a,org,'consent.give',{purpose_id:p.id,scope:{fields:['display_name']},accepted:true}));
 const second=await draft(consent.id);
 await login(a,users.chair);await call(a,org,'consent.withdraw',{id:consent.id});
 await login(b,users.reviewer);pending=capture(call(b,org,'publication.review',{...second,decision:'approved_for_publication',reason:'TESTFIXTURE review',rights_confirmed:true}));
 await waiting();await a.query('commit');result=await pending;assert.match(result.error?.message??'',/f1_consent_unavailable/);await b.query('rollback');
 console.log('C07/R03: committed consent withdrawal blocks a waiting publication approval.');

 const key=randomUUID(),data={user_id:users.admin,role:'partner_editor'};
 await login(a,users.chair);const once=await call(a,org,'identity.assign',data,key);
 await login(b,users.chair);pending=capture(call(b,org,'identity.assign',data,key));
 await waiting();await a.query('commit');result=await pending;assert.ifError(result.error);assert.deepEqual(result.value,once);await b.query('commit');
 assert.equal((await root.query('select count(*)::int n from public.workflow_assignments where organization_id=$1 and user_id=$2 and role=$3 and revoked_at is null',[org,users.admin,'partner_editor'])).rows[0].n,1);
 console.log('R04: simultaneous identical requests commit exactly one effect.');
}finally{
 await Promise.allSettled([a.query('rollback'),b.query('rollback')]);await Promise.allSettled([root.end(),a.end(),b.end()]);
}
