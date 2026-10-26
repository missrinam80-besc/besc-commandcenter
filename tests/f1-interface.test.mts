import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync,writeFileSync,readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as workflows from '../src/lib/f1-workflows.ts';
import { canViewInternalPath } from '../src/lib/route-permissions.ts';
const native=createRequire(import.meta.url);
const id='11111111-1111-4111-8111-111111111111';
test('F1 foutfeedback: specifieke governanceblokkering behoudt betekenis bij SQL-bevoegdheidscode',()=>{
 assert.equal(workflows.f1Feedback({code:'42501',message:'f1_conflict_requires_board_decision'}),'Een aangegeven persoonlijk belang vraagt eerst een expliciete bestuursbeslissing.');
 assert.equal(workflows.f1Feedback({code:'P0001',message:'f1_official_rule_required'}),'Voor deze regelbeoordeling is een gecontroleerde officiële regelbron vereist.');
 assert.equal(workflows.f1Feedback({code:'42501',message:'f1_chair_required'}),'Je hebt voor deze handeling geen actuele bevoegdheid.');
});
test('E01: releasebestand bevat alleen zes exacte nieuwe hashes en behoudt de seeduitzondering',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../ops/f1-release-manifest.json',import.meta.url),'utf8'));assert.equal(manifest.execution_authorized,false);assert.equal(manifest.migrations.length,6);assert.equal(manifest.cloud_history_before,117);assert.equal(manifest.cloud_history_after_if_authorized,123);assert.equal(readdirSync(new URL('../supabase/migrations',import.meta.url)).filter(f=>f.endsWith('.sql')&&f.split('_')[0]<='20261021131239').length,124);
 for(const item of manifest.migrations){assert.match(item.file,/^20261021\d+_f1_/);assert.equal(createHash('sha256').update(readFileSync(new URL('../supabase/migrations/'+item.file,import.meta.url),'utf8').replaceAll('\r\n','\n')).digest('hex'),item.sha256_lf);}
 assert.deepEqual(manifest.excluded_history,['20261001110000_seed_operational_guidelines.sql']);
});
test('U08: gedeelde event-/nieuwsfixtures en negatieve velden voor het F2-contract',()=>{
 const contract=JSON.parse(readFileSync(new URL('./fixtures/f1-publication-contract.json',import.meta.url),'utf8'));assert.equal(contract.public_endpoint_enabled,false);
 for(const fixture of contract.fixtures){assert.equal(workflows.f1PublicPayloadValid(fixture.payload,fixture.type),true);assert.equal(workflows.f1PublicPayloadValid({...fixture.payload,account_user_id:id},fixture.type),false);assert.equal(workflows.f1PublicPayloadValid({...fixture.payload,body:{format:'sanitized_html',value:'<script>bad</script>'}},fixture.type),false);assert.equal(workflows.f1PublicPayloadValid({...fixture.payload,media:[{url:'https://example.invalid/private/file',alt:'TESTFIXTURE'}]},fixture.type),false);}
});
function load(path:string,mocks:Record<string,unknown>={}){
 const compiled={exports:{} as Record<string,unknown>};
 const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{module:compiled,exports:compiled.exports,FormData,URLSearchParams,require:(key:string)=>key.endsWith('.css')?{}:key in mocks?mocks[key]:native(key)});return compiled.exports;
}
function actionFixture(event:unknown=null){
 const calls:unknown[][]=[];const redirects:string[]=[];
 const query={select(){return this;},eq(){return this;},is(){return this;},maybeSingle:async()=>({data:event,error:null})};
 const supabase={auth:{getUser:async()=>({data:{user:{id}},error:null})},rpc:async(...args:unknown[])=>{calls.push(args);return{data:{id},error:null};},from:()=>query};
 const action=load('src/app/app/administratie/werkstromen/actions.ts',{'@/lib/f1-workflows':workflows,'@/lib/supabase/server':{createClient:async()=>supabase},'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:(url:string)=>{redirects.push(url);throw Error(url);}}}).runF1Workflow as (form:FormData)=>Promise<void>;
 function form(op:string){const f=new FormData();for(const[k,v]of Object.entries({operation:op,organization_id:id,request_id:id,return_to:'/app/administratie/werkstromen'}))f.set(k,v);return f;}
 return {action,form,calls,redirects};
}
test('F1 serveractie: eigen intrekking werkt met lege reden; actor komt uit sessie',async()=>{
 const f=actionFixture(),form=f.form('consent.withdraw');form.set('data_id',id);form.set('data_reason','');form.set('actor_id','forged');await assert.rejects(f.action(form),/succes=opgeslagen/);
 const args=f.calls[0][1] as {p_data:Record<string,unknown>};assert.deepEqual(JSON.parse(JSON.stringify(args.p_data)),{id,reason:null});assert.equal('actor_id'in args.p_data,false);
});
test('F1 serveractie: onbekende actorvelden en externe return-route worden geweigerd',async()=>{
 const f=actionFixture(),form=f.form('identity.assign');form.set('data_user_id',id);form.set('data_role','partner_editor');form.set('data_actor_id',id);form.set('return_to','https://example.invalid');await assert.rejects(f.action(form),/^Error: \/app\/administratie\/werkstromen\?fout=velden$/);assert.equal(f.calls.length,0);
});
test('F1 serveractie: gewone tekst wordt veilig opgebouwd en eventtijd komt uit de bron',async()=>{
 for(const event of [null,{start_at:'2030-01-01T12:00:00Z',end_at:'2030-01-01T13:00:00Z',location:'TESTFIXTURE'}]){
  const f=actionFixture(event),form=f.form('publication.draft');form.set('source_ref',`event:${id}:1`);form.set('public_title','TESTFIXTURE');form.set('public_slug','testfixture');form.set('public_body','<script>alert(1)</script>');
  await assert.rejects(f.action(form),event?/succes=opgeslagen/:/fout=eventtijd/);assert.equal(f.calls.length,event?1:0);
  if(event){const data=(f.calls[0][1] as {p_data:{payload:{body:{value:string};starts_at:string}}}).p_data;assert.match(data.payload.body.value,/&lt;script&gt;/);assert.equal(data.payload.starts_at,event.start_at);}
 }
});
test('F1 route: gedelegeerde medewerker kan werkbank openen, algemene administratie blijft afgeschermd',()=>{
 const member={role:'member' as const,finance_role:'none' as const};assert.equal(canViewInternalPath('/app/administratie/werkstromen',member),true);assert.equal(canViewInternalPath('/app/administratie',member),false);
});

test('F1 werkbank: echte servercomponent rendert bruikbare formulieren en verbergt zonder rol',async()=>{
 const Form=load('src/components/f1-form.tsx',{'@/app/app/administratie/werkstromen/actions':{runF1Workflow:()=>{}}}).F1Form;
 const Feedback=load('src/components/f1-feedback.tsx').F1Feedback;
 const available={chair:true,governance:true,consent:true,partners:true,publication_editor:true,publication_reviewer:true};
 async function render(caps:Record<string,boolean>){
  const supabase={rpc:async(name:string)=>({data:name==='f1_capabilities'?caps:name==='f1_publication_consents'?[]:{execution_status:'not_demonstrated'},error:null}),from:(table:string)=>{
   const data=table==='compliance_deadlines'?[{id,title:'TESTFIXTURE — NIET PUBLICEREN',f1_revision:1,due_date:null,unknown_deadline_reason:'Bron nog te beoordelen'}]:table==='organization_members'?[{user_id:id,profiles:[{display_name:'TESTFIXTURE Voorzitter'}]}]:[];
   const query:Record<string,unknown>={then:(ok:(r:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(ok)};for(const name of ['select','eq','neq','is','not','limit','order'])query[name]=()=>query;return query;
  }};
  const Page=load('src/app/app/administratie/werkstromen/page.tsx',{'next/link':{default:({children,...props}:Record<string,unknown>)=>React.createElement('a',props,children as React.ReactNode)},'@/components/app-shell':{AppShell:({children}:{children:React.ReactNode})=>React.createElement('main',null,children)},'@/components/f1-form':{F1Form:Form},'@/components/f1-feedback':{F1Feedback:Feedback},'@/lib/f1-workflows':workflows,'@/lib/auth-context':{requireActiveMembership:async()=>({supabase,membership:{organization_id:id}})}}).default as (p:unknown)=>Promise<React.ReactNode>;
  return renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));
 }
 const html=await render(available);assert.match(html,/Werkstroomrol expliciet toekennen/);assert.match(html,/TESTFIXTURE Voorzitter/);assert.match(html,/name="data_rights_confirmed"|Publieke event- of nieuwsrevisie voorbereiden/);assert.match(html,/name="request_id"/);assert.doesNotMatch(html,/name="actor_id"/);
 const denied=await render(Object.fromEntries(Object.keys(available).map(k=>[k,false])));assert.match(denied,/geen geverifieerd mandaat/);assert.doesNotMatch(denied,/name="operation"/);
 if(process.env.F1_UI_FIXTURE==='1')writeFileSync(new URL('../../f1-ui-fixture.html',import.meta.url),html);
});
