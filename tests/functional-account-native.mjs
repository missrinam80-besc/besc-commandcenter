// Creates and removes its own isolated, unpublished PostgreSQL container only.
// No host database settings, application credentials or Cloud access are used.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
const docker=process.env.BESC_TEST_DOCKER??'docker';
const dockerArgs=['--context','desktop-linux'];
const image='sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe';
const migration='20261026160127_functional_account_profiles.sql';
const db='besc_functional_fixture',name='besc-functional-native-'+randomUUID().slice(0,8);
const q=s=>"'"+s.replaceAll("'","''")+"'";
const run=(args,input)=>execFileSync(docker,[...dockerArgs,...args],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:24*1024*1024}).trim();
let container,phase='create',sessions=[];
const psqlArgs=['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','--username=postgres','--dbname='+db];
const sql=s=>run(['exec','-i',container,...psqlArgs],s);
const json=s=>JSON.parse(sql(s));
const capture=p=>p.then(value=>({value}),error=>({error}));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function session(label){
 const child=spawn(docker,[...dockerArgs,'exec','-i','-e','PGAPPNAME='+label,container,...psqlArgs],{stdio:['pipe','pipe','pipe']});
 const s={child,pending:null,buffer:'',errors:''};sessions.push(s);
 child.stdout.on('data',b=>{s.buffer+=b.toString();if(s.pending&&s.buffer.includes(s.pending.marker)){const p=s.pending;s.pending=null;p.resolve(s.buffer.split(p.marker)[0].trim());s.buffer='';}});
 child.stderr.on('data',b=>s.errors+=b.toString());
 child.on('error',e=>{s.pending?.reject(e);s.pending=null;});
 child.on('exit',code=>{if(s.pending){s.pending.reject(Error(s.errors||'psql exited '+code));s.pending=null;}});
 s.query=text=>new Promise((resolve,reject)=>{assert.equal(s.pending,null);const marker='DONE_'+randomUUID().replaceAll('-','');s.pending={resolve,reject,marker};child.stdin.write(text+'\n\\echo '+marker+'\n');});
 return s;
}
async function waitLock(label){
 const until=Date.now()+6000;
 while(Date.now()<until){if(sql(`select exists(select 1 from pg_stat_activity where application_name=${q(label)} and wait_event_type='Lock')`)==='t')return;await pause(30);}
 throw Error('Expected lock wait not observed: '+label);
}
const source=n=>readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
const report={format:'besc-functional-native-v1',cloud_access:false,image,migration,races:[],created_container:name};
try{
 assert.equal(run(['image','inspect',image,'--format','{{.Id}}']),image);
 container=run(['run','--detach','--name',name,'--network','none','--memory','384m','--cpus','1','--mount','type=tmpfs,destination=/var/lib/postgresql/data,tmpfs-size=268435456','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB='+db,image,'-c',"listen_addresses=",'-c','max_connections=12']);
 assert.match(container,/^[0-9a-f]{64}$/);
 const until=Date.now()+20000;while(true){try{assert.equal(sql('select 1'),'1');break;}catch(e){if(Date.now()>until)throw e;await pause(200);}}
 const inspect=JSON.parse(run(['inspect',container]))[0];assert.equal(inspect.HostConfig.NetworkMode,'none');assert.equal(Object.keys(inspect.HostConfig.PortBindings??{}).length,0);
 assert.match(sql('show server_version'),/^17\./);report.postgres_version=sql('show server_version');
 phase='baseline_replay';
 sql('create schema extensions;create extension pgcrypto with schema extensions;');
 sql(readFileSync(new URL('./helpers/foundation-platform-fixture.sql',import.meta.url),'utf8'));
 const names=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(n=>/^\d+_.+\.sql$/.test(n)&&n<migration&&!n.startsWith('20261001110000_')).sort();
 for(const n of names){try{sql(source(n));}catch(e){throw Error('Baseline migration failed: '+n+' '+e.stderr?.toString().slice(-800));}if(n.startsWith('20260712190000_'))sql("insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','fixture@example.invalid');update public.organization_members set role='admin',status='active';");}
 report.baseline_migrations_replayed=names.length;report.old_seed_excluded=true;
 console.log('Native baseline ready; applying the exact new migration.');
 const catalog=()=>JSON.parse(sql(readFileSync(new URL('../ops/foundation-effects-catalog.sql',import.meta.url),'utf8')));
 const before=catalog();
 const id=(s)=>'"'+s.replaceAll('"','""')+'"';
 const fingerprint=()=>json("select jsonb_agg(row_to_json(x) order by table_name) from ("+before.tables.map(t=>`select ${q(t.schema+'.'+t.name)}::text as table_name,count(*)::int as n,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as hash from ${id(t.schema)}.${id(t.name)} t`).join(' union all ')+')x');
 const rowsBefore=fingerprint();phase='exact_migration';sql(source(migration));const after=catalog();
 assert.deepEqual(after.tables,before.tables);assert.deepEqual(after.policies,before.policies);
 for(const f of before.functions)assert.deepEqual(after.functions.find(g=>g.schema===f.schema&&g.name===f.name&&g.arguments===f.arguments),f);
 const added=after.functions.filter(f=>!before.functions.some(g=>g.schema===f.schema&&g.name===f.name&&g.arguments===f.arguments));assert.equal(added.length,3);
 for(const f of added)for(const k of ['anon_execute','authenticated_execute','service_role_execute'])assert.equal(f[k],false);
 assert.deepEqual(fingerprint(),rowsBefore);report.existing_fixture_rows_preserved=true;report.existing_grants_policies_and_functions_preserved=true;report.new_private_functions_guarded=3;
 phase='race_fixture';
 const org=sql("select id from public.organizations where slug='besc'");assert.match(org,/^[0-9a-f-]{36}$/);
 const actor='00000000-0000-4000-8000-000000000001';
 const project=randomUUID();sql(`insert into public.projects(id,organization_id,title,created_by) values(${q(project)},${q(org)},'TESTFIXTURE native inzetproject',${q(actor)})`);
 const makePerson=()=>{const person=randomUUID();sql(`insert into public.community_people(id,organization_id,display_name,person_type,created_by) values(${q(person)},${q(org)},'TESTFIXTURE native race','crew',${q(actor)})`);return person;};
 const assignment=p=>`insert into public.community_assignments(organization_id,person_id,project_id,role_name,created_by) values(${q(org)},${q(p)},${q(project)},'TESTFIXTURE inzet',${q(actor)});`;
 const classify=p=>`update public.community_people set person_type='functional_account' where id=${q(p)};`;
 const begin="begin;set local statement_timeout='12s';set local lock_timeout='8s';";
 async function orderedRace(which,first,second,expected){
  const person=makePerson(),a=session(name+'-'+which+'-a'),label=name+'-'+which+'-b',b=session(label);
  await a.query(begin+first(person));await b.query(begin);
  const pending=capture(b.query(second(person)));await waitLock(label);await a.query('commit;');const outcome=await pending;
  assert.ok(outcome.error,'Waiting conflicting operation must fail');assert.match(outcome.error.message,expected);
  const final=json(`select jsonb_build_object('type',p.person_type,'bindings',(select count(*) from public.community_assignments where person_id=p.id)) from public.community_people p where id=${q(person)}`);
  assert.ok(!(final.type==='functional_account'&&Number(final.bindings)>0));
  report.races.push({case:which,lock_wait_observed:true,conflict_rejected:true,final});a.child.stdin.end();b.child.stdin.end();
 }
 phase='classification_first';await orderedRace('classification_first',classify,assignment,/functional_account_not_a_person/);
 phase='binding_first';await orderedRace('binding_first',assignment,classify,/functional_account_has_person_bindings/);
 phase='stale_classification';
 {const p=makePerson(),a=session(name+'-stale-a'),b=session(name+'-stale-b');await b.query('begin isolation level repeatable read;select id from public.community_people where id='+q(p)+';');await a.query(begin+assignment(p)+'commit;');const out=await capture(b.query(classify(p)));assert.match(out.error?.message??'',/functional_account_classification_requires_read_committed/);report.races.push({case:'stale_classification',conflict_rejected:true});a.child.stdin.end();b.child.stdin.end();}
 phase='stale_reference';
 {const p=makePerson(),a=session(name+'-rr-a'),label=name+'-rr-b',b=session(label);await b.query('begin isolation level repeatable read;select id from public.community_people where id='+q(p)+';');await a.query(begin+classify(p));const pending=capture(b.query(assignment(p)));await waitLock(label);await a.query('commit;');const out=await pending;assert.match(out.error?.message??'',/could not serialize access due to concurrent update|functional_account_not_a_person/);report.races.push({case:'stale_reference',lock_wait_observed:true,conflict_rejected:true});a.child.stdin.end();b.child.stdin.end();}
 report.completed=true;report.migration_sha256=createHash('sha256').update(source(migration).replaceAll('\r\n','\n')).digest('hex');
}catch(e){report.completed=false;report.phase=phase;report.error=e.message;process.exitCode=1;}
finally{
 for(const s of sessions){s.child.stdin.end();if(s.child.exitCode===null)s.child.kill();}
 if(container){try{run(['rm','--force',container]);report.temporary_container_removed=true;}catch{report.temporary_container_removed=false;process.exitCode=1;}}
 report.checked_at=new Date().toISOString();writeFileSync(new URL('../../functional-account-native-result-20261026.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
