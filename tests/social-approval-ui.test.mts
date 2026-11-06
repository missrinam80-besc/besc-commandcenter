import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import * as approvals from '../src/lib/approvals.ts';
import * as permissions from '../src/lib/permissions.ts';
import { currentApprovalRequests } from '../src/lib/approval-work-queue.ts';

const actor='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const id='00000000-0000-4000-8000-000000000003';
const membership={role:'admin',finance_role:'none',organization_id:'org'} as const;
function load(path:string, dependencies:Record<string,unknown>) {
  const output:Record<string, (...args: never[])=>unknown>={};
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','exports',code)((name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];},output);
  return output;
}
function db(rows:unknown[], error:unknown=null) {
  const query={select:()=>query,eq:()=>query,order:()=>query,then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:rows,error}).then(resolve)};
  return {from:()=>query};
}
const review=(status='pending',requested_by=actor)=>({id,status,requested_by,requested_at:'2026-11-06T10:00:00Z',decided_at:status==='pending'?null:'2026-11-06T11:00:00Z',request_note:'Nakijken',decision_note:'Toelichting',requester:{display_name:'Aanvrager'},reviewer:{display_name:'Beoordelaar'},source_snapshot:{post:{title:'TESTFIXTURE',platform:'Discord',copy:'Bewaarde versie'},variants:[{id:'variant',platform:'Facebook',copy:'Bewaarde kanaaltekst'}]}});
async function panel(rows:unknown[], user=actor, role='admin', status='review', error:unknown=null) {
  const output=load('src/components/social-approval-panel.tsx',{
    'react/jsx-runtime':jsx,
    'next/link':{__esModule:true,default:({children,href}:{children:React.ReactNode;href:string})=>React.createElement('a',{href},children)},
    '@/app/app/goedkeuringen/actions':{submitForApproval:()=>{},decideApproval:()=>{}},
    '@/lib/auth-context':{requireActiveMembership:async()=>({supabase:db(rows,error),user:{id:user},membership:{...membership,role}})},
    '@/lib/approvals':approvals,'@/lib/permissions':permissions,'@/lib/format':{formatDateTime:(value:string)=>value},
  });
  return renderToStaticMarkup(await (output.SocialApprovalPanel as unknown as (props:unknown)=>Promise<React.ReactNode>)({id,status,deleted:false}));
}
test('requester sees the frozen version and waiting message, without decision buttons',async()=>{
  const html=await panel([review()]); assert.match(html,/Bewaarde versie/);assert.match(html,/Bewaarde kanaaltekst/);assert.match(html,/wacht op een andere bevoegde goedkeurder/);
  assert.doesNotMatch(html,/value="approved"|value="rejected"|Ter beoordeling voorleggen/);
});
test('other reviewer can decide and sees every historical round and author',async()=>{
  const html=await panel([review(),{...review('changes_requested'),id:'older'}],other);
  assert.match(html,/value="approved"/);assert.match(html,/value="changes_requested"/);assert.match(html,/value="rejected"/);
  assert.match(html,/Beoordelingshistorie \(2 rondes\)/);assert.match(html,/Beslist door Beoordelaar/);
});
test('volunteer cannot submit or decide and a read failure does not show an empty success',async()=>{
  assert.doesNotMatch(await panel([],actor,'volunteer'),/Ter beoordeling voorleggen|value="approved"/);
  const html=await panel([],actor,'admin','review',{message:'unavailable'});assert.match(html,/kon niet worden geladen/);assert.doesNotMatch(html,/Nog niet ter beoordeling/);
});
test('edited approved version has an explicit resubmission notice',async()=>{
  const html=await panel([review('approved')]);assert.match(html,/eerdere goedkeuring geldt voor een vorige versie/);assert.match(html,/Opnieuw ter beoordeling voorleggen/);
});
test('social sources participate in current work queue with organization and deletion checks',async()=>{
  const filters:unknown[]=[];
  const query={select:()=>query,eq:(...args:unknown[])=>{filters.push(args);return query;},in:()=>query,is:(...args:unknown[])=>{filters.push(args);return query;},then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:[{id}],error:null}).then(resolve)};
  const source={from:(table:string)=>{assert.equal(table,'social_posts');return query;}};
  const rows=[{id:'request',entity_type:'social' as const,entity_id:id,requested_at:'2026-11-06T10:00:00Z'}];
  assert.equal((await currentApprovalRequests(source as never,'org',rows)).length,1);
  assert.deepEqual(filters,[['organization_id','org'],['deleted_at',null]]);
});
async function decision(requester=actor, role='admin', saved:unknown[]=[{id}], error:unknown=null) {
  let writes=0;
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{id,entity_type:'social',entity_id:id,source_href:`/app/social/${id}`,status:'pending',requested_by:requester}}),
    update:()=>{writes++;return query;},then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:saved,error}).then(resolve)};
  const output=load('src/app/app/goedkeuringen/actions.ts',{
    '@/lib/contact-dossier-tabs':{appendContactTab:(href:string)=>href},'next/cache':{revalidatePath:()=>{}},
    'next/navigation':{redirect:(href:string)=>{throw Error(href);}},zod:{z},
    '@/lib/auth-context':{requireActiveMembership:async()=>({supabase:{from:()=>query},user:{id:actor},membership:{...membership,role}})},
    '@/lib/approvals':approvals,'@/lib/permissions':permissions,
  });
  const form=new FormData();form.set('id',id);form.set('decision','approved');form.set('return_to',`/app/social/${id}`);
  let redirect='';try{await (output.decideApproval as unknown as (form:FormData)=>Promise<void>)(form);}catch(e){redirect=String(e);}
  return {writes,redirect};
}
test('real server action denies self-decision and unauthorized reviewer before writes',async()=>{
  const self=await decision();assert.equal(self.writes,0);assert.match(self.redirect,/eigen-social-goedkeuren/);
  const volunteer=await decision(other,'volunteer');assert.equal(volunteer.writes,0);assert.match(volunteer.redirect,/geen-toegang/);
});
test('real server action confirms a saved decision, but never reports success for zero rows or errors',async()=>{
  const good=await decision(other);assert.equal(good.writes,1);assert.match(good.redirect,/succes=beslissing/);
  for(const result of [await decision(other,'admin',[]),await decision(other,'admin',[],{message:'rejected'})]) {
    assert.match(result.redirect,/beslissing-opslaan/);assert.doesNotMatch(result.redirect,/succes=/);
  }
});
