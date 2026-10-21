import { PGlite } from '@electric-sql/pglite';
import { readFile,readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
interface Database {exec(sql:string):Promise<unknown>;query<T>(sql:string):Promise<{rows:T[]}>;close():Promise<void>}
export const q=(v:unknown)=>`'${String(v).replaceAll("'","''")}'`;
export const j=(v:unknown)=>`${q(JSON.stringify(v))}::jsonb`;
export async function f1Database(){
 let db:Database;
 const native=process.env.F1_NATIVE_TEST==='1';
 if(native){
  if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='besc_f1_fixture'||process.env.PGUSER!=='postgres')throw Error('F1 native tests require dedicated localhost besc_f1_fixture');
  const nodeRequire=createRequire(import.meta.url);const client=new(nodeRequire('pg').Client)();await client.connect();
  db={exec:async sql=>{await client.query(sql);},query:async<T,>(sql:string)=>({rows:(await client.query(sql)).rows as T[]}),close:()=>client.end()};
  const version=await db.query<{server_version:string}>('show server_version');if(!version.rows[0].server_version.startsWith('17.'))throw Error('Native F1 acceptance requires PostgreSQL 17');
  const count=await db.query<{n:number}>("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private') and c.relkind='r'");if(count.rows[0].n!==0)throw Error('Refuse non-empty native fixture');
  await db.exec('create schema extensions;create extension pgcrypto with schema extensions;');
 }else db=new PGlite();
 await db.exec(await readFile(new URL('./foundation-platform-fixture.sql',import.meta.url),'utf8'));
 const files=(await readdir(new URL('../../supabase/migrations',import.meta.url))).filter(n=>/^\d+_.*\.sql$/.test(n)).sort();
 for(const file of files){let sql=await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8');if(!native)sql=sql.replace(/^create extension if not exists pgcrypto;\r?\n/im,'');try{await db.exec(sql);}catch(e){throw Error(file+': '+String(e));}if(file.startsWith('20260712190000_'))await db.exec("insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','fixture@example.invalid');update public.organization_members set status='active',role='admin';");}
 const first=await db.query<{id:string}>("select id from public.organizations where slug='besc'");const org=first.rows[0].id;
 const ids={org,otherOrg:randomUUID(),chair:randomUUID(),admin:randomUUID(),member:randomUUID(),volunteer:randomUUID(),reviewer:randomUUID(),other:randomUUID(),association:randomUUID(),deadline:randomUUID(),meeting:randomUUID(),partner:randomUUID(),content:randomUUID(),event:randomUUID(),proof:randomUUID(),ruleDoc:randomUUID(),executionDoc:randomUUID(),policyDoc:randomUUID(),otherDoc:randomUUID(),person:'',otherPerson:''};
 for(const [key,role]of [['chair','board'],['admin','admin'],['member','member'],['volunteer','volunteer'],['reviewer','member'],['other','member']] as const){await db.exec(`insert into auth.users(id,email) values(${q(ids[key])},${q(key+'@fixture.invalid')});update public.organization_members set role=${q(role)},status='active' where user_id=${q(ids[key])} and organization_id=${q(org)};`);}
 await db.exec(`insert into public.organizations(id,name,slug) values(${q(ids.otherOrg)},'TESTFIXTURE B','fixture-b');insert into public.organization_members(organization_id,user_id,role,status) values(${q(ids.otherOrg)},${q(ids.other)},'admin','active');`);
 const people=await db.query<{id:string;account_user_id:string}>(`select id,account_user_id from public.community_people where organization_id=${q(org)} and account_user_id in(${q(ids.chair)},${q(ids.member)})`);
 ids.person=people.rows.find(p=>p.account_user_id===ids.chair)!.id;ids.otherPerson=people.rows.find(p=>p.account_user_id===ids.member)!.id;
 for(const k of ['proof','ruleDoc','executionDoc','policyDoc'] as const)await db.exec(`insert into public.document_registry(id,organization_id,label,url,created_by) values(${q(ids[k])},${q(org)},${q('TESTFIXTURE '+k)},${q('https://example.invalid/'+k)},${q(ids.chair)})`);
 await db.exec(`insert into public.document_registry(id,organization_id,label,url,created_by) values(${q(ids.otherDoc)},${q(ids.otherOrg)},'TESTFIXTURE B','https://example.invalid/other',${q(ids.other)});
 insert into public.association_members(id,organization_id,full_name,created_by) values(${q(ids.association)},${q(org)},'TESTFIXTURE Voorzitter',${q(ids.chair)});
 insert into public.governance_mandates(organization_id,member_id,role,start_date,created_by) values(${q(org)},${q(ids.association)},'chair',current_date-1,${q(ids.chair)});
 select private.f1_bootstrap(${q(org)},${q(ids.association)},${q(ids.person)},${q(ids.chair)},${q(ids.proof)},${q(ids.admin)});
 insert into public.compliance_deadlines(id,organization_id,title,category,due_date,created_by) values(${q(ids.deadline)},${q(org)},'TESTFIXTURE Verplichting','board',current_date+10,${q(ids.chair)});
 insert into public.meetings(id,organization_id,title,created_by) values(${q(ids.meeting)},${q(org)},'TESTFIXTURE Vergadering',${q(ids.chair)});
 insert into public.partners(id,organization_id,name,created_by) values(${q(ids.partner)},${q(org)},'TESTFIXTURE Esports',${q(ids.chair)});
 insert into public.content_items(id,organization_id,title,created_by) values(${q(ids.content)},${q(org)},'TESTFIXTURE Nieuws',${q(ids.chair)});
 insert into public.events(id,organization_id,title,start_at,end_at,created_by) values(${q(ids.event)},${q(org)},'TESTFIXTURE Event','2030-01-01T12:00:00Z','2030-01-01T13:00:00Z',${q(ids.chair)});`);
 async function actor(id:string,role='authenticated'){await db.exec(`reset role;select set_config('request.jwt.claim.sub',${q(id)},false);select set_config('request.jwt.claim.role',${q(role)},false);set role ${role};`);}
 async function owner(){await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);select set_config('request.jwt.claim.role','',false);");}
 async function call(op:string,data:unknown={},request=randomUUID(),o=org){const result=await db.query<{answer:{id:string}}>(`select public.f1_workflow(${q(o)},${q(op)},${j(data)},${q(request)}) as answer`);return result.rows[0].answer;}
 await actor(ids.chair);
 for(const role of ['consent_registrar','partner_editor','publication_editor'])await call('identity.assign',{user_id:ids.chair,role});
 await call('identity.assign',{user_id:ids.reviewer,role:'publication_reviewer'});await call('identity.assign',{user_id:ids.member,role:'governance_editor'});
 await owner();
 return {db,ids,actor,owner,call,migrationCount:files.length};
}
