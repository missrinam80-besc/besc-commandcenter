import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_f1_fixture'||process.env.PGUSER!=='postgres')throw Error('Dedicated localhost F2 fixture required');
const admin=new pg.Client();await admin.connect();
const a=new pg.Client(),b=new pg.Client();await Promise.all([a.connect(),b.connect()]);
try{
 const site=(await admin.query("select * from public.publication_sites where host='website-dev.belgianstreamerscommunity.be'")).rows[0];assert(site,'Run F2 native DB fixture first');
 const org=site.organization_id,chair=site.created_by,reviewer=(await admin.query("select user_id from public.workflow_assignments where organization_id=$1 and role='publication_reviewer' and revoked_at is null",[org])).rows[0].user_id;
 const sessions=(await admin.query('select user_id,id from auth.sessions')).rows;const content=(await admin.query("select id from public.content_items where organization_id=$1 and title='TESTFIXTURE Nieuws'",[org])).rows[0].id;
 async function actor(client,id){const session=sessions.find(s=>s.user_id===id)?.id;assert(session);await client.query('reset role');await client.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,role:'authenticated',session_id:session})]);await client.query('set role authenticated');}
 const f1=async(client,op,data)=>(await client.query('select public.f1_workflow($1,$2,$3,$4) result',[org,op,data,randomUUID()])).rows[0].result;
 const f2=async(client,op,data)=>(await client.query('select public.f2_workflow($1,$2,$3,$4) result',[org,op,data,randomUUID()])).rows[0].result;
 await actor(a,chair);const r=await f1(a,'publication.draft',{source_type:'news',source_id:content,expected_revision:1,payload:{title:'TESTFIXTURE — NIET PUBLICEREN — concurrency',summary:'TESTFIXTURE',slug:'testfixture-concurrency',locale:'nl-BE',body:{format:'sanitized_html',value:'<p>TESTFIXTURE</p>'},media:[]}});
 const hash=(await admin.query('select payload_sha256 from public.publication_revisions where id=$1',[r.id])).rows[0].payload_sha256;
 await f1(a,'publication.submit',{id:r.id,expected_hash:hash});await actor(a,reviewer);await f1(a,'publication.review',{id:r.id,expected_hash:hash,decision:'approved_for_publication',reason:'TESTFIXTURE',rights_confirmed:true});await actor(b,reviewer);
 const release={site_id:site.id,revision_id:r.id,expected_hash:hash,expected_epoch:0,reason:'TESTFIXTURE concurrency'};
 const race=await Promise.allSettled([f2(a,'release',release),f2(b,'release',release)]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(race.filter(x=>x.status==='rejected').length,1);
 const entry=(await admin.query('select * from public.publication_entries where selected_revision_id=$1',[r.id])).rows[0];assert(entry);
 await a.query('begin');await f2(a,'withdraw',{entry_id:entry.public_id,expected_epoch:1,reason:'TESTFIXTURE concurrent withdrawal'});
 let done=false;const pending=f2(b,'release',{...release,expected_epoch:1}).then(()=>{done=true;return false;},()=>{done=true;return true;});
 await new Promise(resolve=>setTimeout(resolve,120));assert.equal(done,false,'Publish must wait behind the shared F1 transaction lock');await a.query('commit');assert.equal(await pending,true);
 const withdrawn=(await admin.query('select withdrawn_at,epoch from public.publication_entries where public_id=$1',[entry.public_id])).rows[0];assert(withdrawn.withdrawn_at);assert.equal(Number(withdrawn.epoch),2);
 await f2(a,'release',{...release,expected_epoch:2});
 await a.query('begin');await f1(a,'publication.withdraw',{id:r.id,expected_hash:hash});done=false;
 const sourcePending=f2(b,'release',{...release,expected_epoch:3}).then(()=>{done=true;return false;},()=>{done=true;return true;});
 await new Promise(resolve=>setTimeout(resolve,120));assert.equal(done,false);await a.query('commit');assert.equal(await sourcePending,true);
 const result=await b.query("select public.f2_publications($1,'news') result",[site.id]);assert.equal(result.rows[0].result.length,0);
 console.log(JSON.stringify({native_f2_concurrency:true,same_epoch_single_winner:true,withdrawal_blocks_stale_publish:true,f1_revision_withdrawal_blocks_publish:true,target:'isolated localhost only'}));
}finally{await Promise.allSettled([a.query('rollback'),b.query('rollback')]);await Promise.all([a.end(),b.end(),admin.end()]);}
