import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {z} from 'zod';
import * as audit from '../src/lib/audit.ts';
const id='00000000-0000-4000-8000-000000000001',campaign='00000000-0000-4000-8000-000000000002';
function load(path:string,deps:Record<string,unknown>){const exports:Record<string,unknown>={};const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports',code)((name:string)=>{assert.ok(name in deps,name);return deps[name];},exports);return exports;}
test('campaign deliverables have readable labels, a content filter and a safe parent link',()=>{
 assert.equal(audit.auditEntityLabels.campaign_deliverables,'Campagneoplevering');assert.ok(audit.auditGroupTables('content')?.some(table=>table==='campaign_deliverables'));
 assert.equal(audit.auditEntityHref('campaign_deliverables',id,'updated',{campaign_id:campaign}),`/app/campagnes/${campaign}?tab=deliverables`);
 for(const metadata of [null,{}, {campaign_id:'https://fixture.invalid'},{campaign_id:'../../secret'}])assert.equal(audit.auditEntityHref('campaign_deliverables',id,'updated',metadata),'/app/campagnes');
 assert.equal(audit.auditEntityHref('campaign_deliverables',id,'deleted',{campaign_id:campaign}),null);
 assert.equal(audit.auditEntityHref('projects',id,'updated'),`/app/projecten/${id}`);
});
test('status and approval transitions use business labels without changing other entity labels',()=>{
 assert.equal(audit.auditStatusLabel('campaign_deliverables','doing'),'Bezig');assert.equal(audit.auditStatusLabel('campaign_deliverables','completed'),'Afgerond');assert.equal(audit.auditStatusLabel('campaigns','idea'),'idea');
 assert.equal(audit.auditStatusLabel('campaign_deliverables','__proto__'),'__proto__');
 assert.equal(audit.auditApprovalTransition('campaign_deliverables',{previous_approval_status:'not_required',new_approval_status:'pending'}),'Geen goedkeuring → Wacht op goedkeuring');
 for(const metadata of [null,{}, {previous_approval_status:'pending',new_approval_status:'pending'},{previous_approval_status:3,new_approval_status:'approved'}])assert.equal(audit.auditApprovalTransition('campaign_deliverables',metadata),null);
 assert.equal(audit.describeChangedFields(['approval_status','community_person_id']),'goedkeuringsstatus, verantwoordelijke persoon');
});
async function page(approvalOnly=false){
 const calls:unknown[][]=[];
 const event={id,entity_type:'campaign_deliverables',entity_id:id,action:'updated',entity_label:'TESTFIXTURE oplevering',changed_fields:[approvalOnly?'approval_status':'status'],previous_status:'doing',new_status:approvalOnly?'doing':'completed',created_at:'2026-11-07T00:00:00Z',actor_id:'actor',profiles:{display_name:'Technische tester'},metadata:{campaign_id:campaign,previous_approval_status:'not_required',new_approval_status:approvalOnly?'pending':'not_required'}};
 const supabase={from:(table:string)=>{const query:Record<string,unknown>={};for(const method of ['select','eq','gte','order','range','in','ilike'])query[method]=(...args:unknown[])=>{calls.push([table,method,...args]);return query;};query.then=(resolve:(result:unknown)=>unknown)=>Promise.resolve({data:table==='audit_log'?[event]:[],count:table==='audit_log'?1:0,error:null}).then(resolve);return query;}};
 const output=load('src/app/app/activiteit/page.tsx',{
  'react/jsx-runtime':jsx,'next/link':{__esModule:true,default:({children,href}:{children:React.ReactNode;href:string})=>React.createElement('a',{href},children)},
  'lucide-react':Object.fromEntries(['Activity','Archive','CirclePlus','Pencil','Search','Trash2'].map(name=>[name,()=>null])),
  '@/components/app-shell':{AppShell:({children}:{children:React.ReactNode})=>React.createElement('main',null,children)},'@/components/saved-views':{SavedViews:()=>null},
  '@/lib/audit':audit,'@/lib/date-range':{isoDaysAgo:()=> '2026-10-07T00:00:00Z'},
  '@/lib/auth-context':{requirePermission:async(capability:string)=>{assert.equal(capability,'manageOrganization');return {supabase,membership:{organization_id:'own-org'}};}},
 });
 const html=renderToStaticMarkup(await (output.default as (p:unknown)=>Promise<React.ReactNode>)({searchParams:Promise.resolve({onderdeel:'content'})}));return {html,calls};
}
test('real activity page renders actor, Dutch transition and campaign link using scoped metadata query',async()=>{
 const {html,calls}=await page();assert.match(html,/Technische tester/);assert.match(html,/Bezig.*→.*Afgerond/);assert.match(html,new RegExp(`/app/campagnes/${campaign}\\?tab=deliverables`));assert.doesNotMatch(html,new RegExp(`/app/campagnes/${id}`));
 assert.ok(calls.some(c=>c[0]==='audit_log'&&c[1]==='select'&&String(c[2]).includes('metadata')));assert.ok(calls.some(c=>c[0]==='audit_log'&&c[1]==='eq'&&c[2]==='organization_id'&&c[3]==='own-org'));assert.ok(calls.some(c=>c[0]==='audit_log'&&c[1]==='in'&&(c[3] as string[]).includes('campaign_deliverables')));
});
test('approval-only change is visible without pretending the work status changed',async()=>{
 const {html}=await page(true);assert.match(html,/Geen goedkeuring.*→.*Wacht op goedkeuring/);assert.doesNotMatch(html,/Status: Bezig.*→.*Bezig/);
});
async function action(rows:unknown[]|null,error:unknown=null,role='admin',status='doing'){
 const calls:unknown[][]=[],invalidations:string[]=[];let writes=0;
 const query={update:(values:unknown)=>{writes++;calls.push(['update',values]);return query;},eq:(...args:unknown[])=>{calls.push(['eq',...args]);return query;},select:(...args:unknown[])=>{calls.push(['select',...args]);return query;},then:(resolve:(r:unknown)=>unknown)=>Promise.resolve({data:rows,error}).then(resolve)};
 const output=load('src/app/app/operations/relation-actions.ts',{
  '@/lib/contact-dossier-tabs':{appendContactTab:(href:string)=>href},'next/cache':{revalidatePath:(path:string)=>invalidations.push(path)},'next/navigation':{redirect:(href:string)=>{throw Error(href);}},zod:{z},'@/lib/format':{localDateTimeToIso:(v:string)=>v},
  '@/lib/auth-context':{requireActiveMembership:async()=>({supabase:{from:(table:string)=>{assert.equal(table,'campaign_deliverables');return query;}},user:{id:'actor'},membership:{role,organization_id:'own-org'}})},
 });
 const form=new FormData();form.set('id',id);form.set('campaign_id',campaign);form.set('status',status);form.set('approval_status','not_required');let result='';try{await (output.updateCampaignDeliverable as (f:FormData)=>Promise<void>)(form);}catch(e){result=String(e);}return {result,calls,writes,invalidations};
}
test('real status action confirms the exact saved row and refreshes campaign and audit',async()=>{
 const r=await action([{id}]);assert.match(r.result,/succes=deliverable-status/);assert.equal(r.writes,1);assert.deepEqual(r.invalidations,[`/app/campagnes/${campaign}`,'/app/activiteit']);
 for(const filter of [['organization_id','own-org'],['id',id],['campaign_id',campaign]])assert.ok(r.calls.some(c=>c[0]==='eq'&&c[1]===filter[0]&&c[2]===filter[1]));
});
test('no rows, mismatched confirmation or audit error cannot report success',async()=>{
 for(const [rows,error] of [[[],null],[null,null],[[{id:campaign}],null],[[],{message:'fixture audit failure'}]] as const){const r=await action(rows as unknown[]|null,error);assert.match(r.result,/fout=deliverable-status-opslaan/);assert.doesNotMatch(r.result,/succes=/);assert.deepEqual(r.invalidations,[]);}
});
test('denied role and invalid status perform no database write',async()=>{
 const denied=await action([{id}],null,'volunteer');assert.equal(denied.writes,0);assert.match(denied.result,/geen-toegang/);
 const invalid=await action([{id}],null,'admin','not-a-status');assert.equal(invalid.writes,0);assert.match(invalid.result,/fout=deliverable-status/);
});
