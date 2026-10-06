import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const require=createRequire(import.meta.url),id="11111111-1111-4111-8111-111111111111",row="22222222-2222-4222-8222-222222222222";
function load(path:string,overrides:Record<string,unknown>={}){
 const compiled={exports:{} as Record<string,(form:FormData)=>Promise<void>>};
 runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module:compiled,exports:compiled.exports,FormData,require:(key:string)=>key in overrides?overrides[key]:require(key)});
 return compiled.exports;
}
const config=load("src/lib/dossier-relations.ts");
for(const [action,table,error] of [['updateRecordLink','record_links','link-opslaan'],['deleteRecordLink','record_links','link-verwijderen'],['deleteRecordRelationship','record_relationships','relatie-verwijderen'],['deleteRecordDocument','google_resource_links','document-verwijderen']]){
 test(`${action}: missing or mismatched row cannot produce success`,async()=>{
  for(const result of ['saved','missing','error','wrong','denied']){
   const calls:unknown[][]=[];
   const supabase={from:(name:string)=>{
    const query:Record<string,unknown>={};for(const method of ['update','delete','eq','or','select'])query[method]=(...args:unknown[])=>{calls.push([name,method,...args]);return query;};
    query.maybeSingle=async()=>({data:result==='saved'?{id:row}:result==='wrong'?{id}:null,error:result==='error'?{message:'fixture'}:null});
    query.then=(resolve:(v:unknown)=>unknown)=>Promise.resolve({error:null}).then(resolve);return query;
   }};
   const actions=load("src/app/app/dossier-actions.ts",{
    "next/cache":{revalidatePath:()=>{}},"next/navigation":{redirect:(url:string)=>{throw Error(url);}},
    "@/lib/auth-context":{requirePermission:async()=>{if(result==='denied')throw Error('permission denied');return{supabase,user:{id},membership:{organization_id:'org'}};}},
    "@/lib/dossier-relations":config,"@/lib/google-workspace":{},"@/lib/source-observation":{},
   });
   const form=new FormData();for(const [key,value]of Object.entries({entity_type:'content',entity_id:id,id:row,label:'TESTFIXTURE',url:'https://example.com/test',link_type:'reference'}))form.set(key,value);
   await assert.rejects(actions[action](form),result==='saved'?/succes=/:result==='denied'?/permission denied/:new RegExp('fout='+error));
   if(result==='denied'){assert.equal(calls.length,0);continue;}
   for(const args of [['eq','organization_id','org'],['eq','id',row],['select','id']])assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify([table,...args])));
   if(action==='deleteRecordRelationship')assert.ok(calls.some(c=>c[1]==='or'&&String(c[2]).includes(`target_id.eq.${id}`)&&String(c[2]).includes(`source_id.eq.${id}`)));
   else for(const args of [['eq','entity_type','content'],['eq','entity_id',id]])assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify([table,...args])));
   if(action==='deleteRecordDocument')assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify([table,'eq','resource_type','document'])));
  }
 });
}
