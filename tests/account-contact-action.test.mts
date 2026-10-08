import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { hasPermission } from "../src/lib/permissions.ts";
const userId="10000000-0000-4000-8000-000000000001",personId="20000000-0000-4000-8000-000000000001";

test("handmatig contact koppelen vereist Admin en verifieert de opgeslagen persoonsidentiteit",async()=>{
 const source=readFileSync("src/app/app/beheer/actions.ts","utf8"),require=createRequire(import.meta.url);
 for(const[role,data,error]of [["admin",personId,null],["board",personId,null],["admin",null,null],["admin",userId,null],["admin",personId,{message:"denied"}]] as const){
  const calls:{name:string;args:Record<string,unknown>}[]=[],invalidations:string[]=[];
  const dependencies:Record<string,unknown>={
   "@/lib/permissions":{capabilities:[]},
   "@/lib/auth-context":{requirePermission:async(capability:string)=>{
    assert.equal(capability,"manageUsers");if(!hasPermission({role,finance_role:"none"},"manageUsers"))throw Error("geen-toegang");
    return {membership:{organization_id:"fixture-org"},supabase:{rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return{data,error};}}};}},
   "next/navigation":{redirect:(path:string)=>{throw Error(path);}},"next/cache":{revalidatePath:(path:string)=>invalidations.push(path)},
  };
  const compiled={exports:{} as {linkMemberContact:(fd:FormData)=>Promise<void>}};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiled,exports:compiled.exports,require:(name:string)=>name in dependencies?dependencies[name]:require(name)});
  const fd=new FormData();fd.set("user_id",userId);fd.set("person_id",personId);
  const successful=role==="admin"&&data===personId&&!error;
  await assert.rejects(compiled.exports.linkMemberContact(fd),successful?/succes=contact/:role==="board"?/geen-toegang/:/fout=contact-koppelen/);
  assert.equal(calls.length,role==="board"?0:1);
  if(calls.length){assert.equal(calls[0].name,"link_account_contact");assert.deepEqual({...calls[0].args},{p_organization_id:"fixture-org",p_user_id:userId,p_person_id:personId});}
  assert.equal(invalidations.length,successful?3:0);
  const invalid=new FormData();invalid.set("user_id","invalid");invalid.set("person_id",personId);const previous=calls.length;
  await assert.rejects(compiled.exports.linkMemberContact(invalid),/fout=contact-velden/);assert.equal(calls.length,previous);
 }
});
