import * as f1Workflows from "../src/lib/f1-workflows.ts";
import * as contactTabHelpers from "../src/lib/contact-dossier-tabs.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { campaignTemplates } from "../src/lib/campaign-templates.ts";
import { operationalModules } from "../src/app/app/operations/config.ts";
const require=((native) => (name: string) => name === "@/lib/f1-workflows" ? f1Workflows : name === "@/lib/contact-dossier-tabs" ? contactTabHelpers : native(name))(createRequire(import.meta.url)),id="11111111-1111-4111-8111-111111111111";
function fixture(result:unknown=id,error:unknown=null,denied=false){
 const calls:unknown[][]=[],invalidations:string[]=[];
 const compiled={exports:{} as {createOperationalRecord:(f:FormData)=>Promise<void>}};
 const mocks={"next/cache":{revalidatePath:(path:string)=>invalidations.push(path)},"next/navigation":{redirect:(url:string)=>{throw Error(url);}},
 "@/lib/auth-context":{requirePermission:async()=>{if(denied)throw Error('permission denied');return{supabase:{rpc:async(name:string,args:unknown)=>{calls.push([name,args]);return{data:name==="f1_workflow"?{id:result}:result,error};},from:()=>{throw Error('non atomic write');}},user:{id},membership:{organization_id:'org'}};}},
 "@/lib/format":{},"@/lib/campaign-templates":{campaignTemplates},"./config":{operationalModules}};
 runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/app/operations/actions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module:compiled,exports:compiled.exports,FormData,require:(key:string)=>key in mocks?mocks[key as keyof typeof mocks]:require(key)});
 return{action:compiled.exports.createOperationalRecord,calls,invalidations};
}
function form(template=true){const f=new FormData();for(const[k,v]of Object.entries({module:'campagnes',title:'TESTFIXTURE',type:'social',status:'idea',project_id:id,event_id:id,partner_id:id,contribution_role:'esports',budget:'',value:''}))f.set(k,v);if(template)f.set('apply_template','on');return f;}
test('Campaign create sends one bundle with template and retains safe return route',async()=>{
 for(const template of [true,false]){
  const f=fixture(),input=form(template);input.set('return_to',`/app/projecten/${id}`);
  await assert.rejects(f.action(input),new RegExp(`/app/projecten/${id}\\?succes=campagne-aangemaakt`));
  assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'f1_workflow');
  const wire=f.calls[0][1] as {p_data:{values:Record<string,unknown>;deliverables:string[];contribution_role:string};p_operation:string;p_organization_id:string};assert.equal(wire.p_operation,'partner.campaign');assert.equal(wire.p_data.contribution_role,'esports');const args={p_values:wire.p_data.values,p_deliverables:wire.p_data.deliverables,p_organization_id:wire.p_organization_id};
  assert.equal(args.p_values.budget,null);assert.equal(args.p_values.value,null);assert.equal(args.p_organization_id,'org');
  assert.equal(args.p_values.project_id,id);assert.equal(args.p_values.event_id,id);assert.equal(args.p_values.partner_id,id);
  for(const key of ['organization_id','created_by','owner_id'])assert.equal(key in args.p_values,false);
  assert.equal(JSON.stringify(args.p_deliverables),JSON.stringify(template?campaignTemplates.social.deliverables:[]));
  assert.equal(JSON.stringify(args.p_values.channels),JSON.stringify(template?campaignTemplates.social.channels:[]));
  assert.equal(args.p_values.notes,template?campaignTemplates.social.briefing:null);
  assert.ok(f.invalidations.includes(`/app/projecten/${id}`));
 }
});
test('Campaign create preserves explicit input over template defaults',async()=>{
 const f=fixture(),input=form();input.set('notes','Custom briefing');input.set('results_summary','Custom evaluation');input.set('budget','0');input.set('value','25');input.append('channels','YouTube');input.set('return_to','https://example.com');
 await assert.rejects(f.action(input),/\/app\/campagnes\?succes=aangemaakt/);
 const args={p_values:(f.calls[0][1] as {p_data:{values:Record<string,unknown>}}).p_data.values};assert.equal(args.p_values.notes,'Custom briefing');assert.equal(args.p_values.results_summary,'Custom evaluation');assert.equal(args.p_values.budget,0);assert.equal(args.p_values.value,25);assert.equal(JSON.stringify(args.p_values.channels),'["YouTube"]');
});
test('Campaign create rejects unconfirmed RPC results and denied permission',async()=>{
 for(const [result,error,denied]of [[null,null,false],['bad-id',null,false],[id,{message:'fixture'},false],[id,null,true]] as [unknown,unknown,boolean][]){
  const f=fixture(result,error,denied);await assert.rejects(f.action(form()),denied?/permission denied/:/fout=opslaan/);assert.equal(f.invalidations.length,0);assert.equal(f.calls.length,denied?0:1);
 }
});

test('Campaign without partner retains the existing bundle; a partner requires explicit contribution',async()=>{
 const f=fixture(),input=form();input.set('partner_id','');await assert.rejects(f.action(input),/succes=aangemaakt/);assert.equal(f.calls[0][0],'create_campaign_bundle');
 const denied=fixture(),missing=form();missing.delete('contribution_role');await assert.rejects(denied.action(missing),/fout=partnerrol/);assert.equal(denied.calls.length,0);
});
