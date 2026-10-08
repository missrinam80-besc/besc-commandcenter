import * as contactTabHelpers from "../src/lib/contact-dossier-tabs.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const require=((native) => (name: string) => name === "@/lib/contact-dossier-tabs" ? contactTabHelpers : native(name))(createRequire(import.meta.url));
const id="11111111-1111-4111-8111-111111111111",targetId="22222222-2222-4222-8222-222222222222";
function load(path:string,overrides:Record<string,unknown>={}){
 const compiled={exports:{} as Record<string,unknown>};
 runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module:compiled,exports:compiled.exports,FormData,require:(key:string)=>key in overrides?overrides[key]:require(key)});
 return compiled.exports;
}
const config=load("src/lib/dossier-relations.ts") as typeof import("../src/lib/dossier-relations.ts");
for(const type of config.dossierEntityTypes)test(`${type}: relation rejects deleted, foreign or unreadable endpoints before inserting`,async()=>{
 for(const unavailable of ["none","source","target","error"]){
  const writes:unknown[]=[],calls:unknown[][]=[];
  const supabase={from:(table:string)=>{
   let selectedId="",active=false,organization="";
   const query={select:()=>query,eq:(key:string,value:string)=>{calls.push([table,"eq",key,value]);if(key==="id")selectedId=value;if(key==="organization_id")organization=value;return query;},
    is:(key:string,value:null)=>{calls.push([table,"is",key,value]);if(key==="deleted_at")active=true;return query;},
    maybeSingle:async()=>({data:organization==="org"&&active&&!(unavailable==="source"&&selectedId===id)&&!(unavailable==="target"&&selectedId===targetId)?{id:selectedId}:null,error:unavailable==="error"?{message:"fixture failure"}:null}),
    insert:async(value:unknown)=>{writes.push(value);return{error:null};}};
   return query;
  }};
  const actions=load("src/app/app/dossier-actions.ts",{
   "next/cache":{revalidatePath:()=>{}},"next/navigation":{redirect:(url:string)=>{throw Error(url);}},
   "@/lib/auth-context":{requirePermission:async()=>({supabase,user:{id},membership:{organization_id:"org"}})},
   "@/lib/dossier-relations":config,"@/lib/google-workspace":{},"@/lib/source-observation":{},
  });
  const form=new FormData();for(const [key,value]of Object.entries({entity_type:"content",entity_id:id,target:`${type}:${targetId}`,relationship_type:"related"}))form.set(key,value);
  await assert.rejects((actions.addRecordRelationship as(f:FormData)=>Promise<void>)(form),unavailable==="none"?/succes=relatie-opgeslagen/:/fout=relatie-(bron|doel)/);
  assert.equal(writes.length,unavailable==="none"?1:0);
  assert.ok(calls.some(call=>JSON.stringify(call)==='["content_items","is","deleted_at",null]'));
  if(unavailable==="none"||unavailable==="target")assert.ok(calls.some(call=>JSON.stringify(call)===JSON.stringify([config.dossierEntityConfig[type].table,"is","deleted_at",null])));
 }
});
