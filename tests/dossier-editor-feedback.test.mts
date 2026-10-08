import assert from "node:assert/strict";
import test from "node:test";
import {editorLoader} from "./helpers/editor-loader.mts";

const rootId="11111111-1111-4111-8111-111111111111",rowId="22222222-2222-4222-8222-222222222222";
type Bundle={kind:string;root:{id:string;new:boolean;values:Record<string,unknown>;base:Record<string,unknown>};parts:{id:string;new:boolean;collection:string;values:Record<string,unknown>;base:null}[]};
type Issue={message:string;field?:string;tab?:string;rowId?:string;label?:string};
function fixture(values:Record<string,unknown>={}):Bundle{return {kind:"event",root:{id:rootId,new:false,values:{},base:{id:rootId,title:"TESTFIXTURE event"}},parts:[{id:rowId,new:true,collection:"event_schedule_items",base:null,values:{title:"TESTFIXTURE tijdslot",kind:"stream",status:"draft",starts_at:"2026-10-08T10:00:00Z",ends_at:"2026-10-08T11:00:00Z",...values}}]};}
const load=editorLoader();
const {validateEditorIssues}=load("src/lib/dossier-editor-draft.ts") as {validateEditorIssues:(b:Bundle)=>Issue[]};
const feedback=load("src/lib/dossier-editor-feedback.ts") as {dossierStorageFeedback:(e:Record<string,unknown>,b:Bundle)=>{message:string;issues?:Issue[]};editorIssueText:(i:Issue)=>string};

test("Tijdslotfouten wijzen naar het juiste veld, tabblad en onderdeel",()=>{
 for(const [values,field]of [[{ends_at:"2026-10-08T10:00:00Z"},"ends_at"],[{starts_at:null},"starts_at"],[{title:"x"},"title"],[{location:"x".repeat(301)},"location"],[{notes:"x".repeat(4001)},"notes"],[{starts_at:"invalid"},"starts_at"]] as const){
  const issue=validateEditorIssues(fixture(values)).find(i=>i.field===field);
  assert.ok(issue,field);assert.equal(issue.tab,"planning");assert.equal(issue.rowId,rowId);assert.match(issue.label??"",/TESTFIXTURE tijdslot|Programma en inzet/);
 }
 assert.equal(validateEditorIssues(fixture()).length,0);
 assert.equal(validateEditorIssues(fixture({starts_at:null,ends_at:null})).length,0);
 assert.equal(validateEditorIssues(fixture({starts_at:"2026-10-08T23:00:00Z",ends_at:"2026-10-09T01:00:00Z"})).length,0);
});
test("Een ontbrekende veldwaarde krijgt een begrijpelijke veldnaam",()=>{
 const issues=validateEditorIssues(fixture({status:null}));
 const issue=issues.find(i=>i.field==="status");assert.ok(issue);
 assert.match(feedback.editorIssueText(issue),/Status/);assert.match(feedback.editorIssueText(issue),/TESTFIXTURE tijdslot/);
});
test("Databankregels tonen de oorzaak zonder te raden welk tijdslot faalde",()=>{
 const result=feedback.dossierStorageFeedback({code:"23514",message:'new row violates check constraint "event_schedule_items_check"',details:"SECRET failing row"},fixture());
 assert.match(result.message,/niet welk tijdslot/);assert.equal(result.issues?.[0].field,"ends_at");assert.equal(result.issues?.[0].rowId,rowId);
 assert.ok(!JSON.stringify(result).includes("SECRET"));
});
test("Rechten, ontbrekende koppelingen, dubbels en versieconflicten krijgen verschillende oorzaken",()=>{
 for(const [code,message,expected]of [["42501","dossier_reference_unavailable",/gekoppeld dossier/],["42501","dossier_no_access",/bevoegdheid/],["23505","SECRET",/bestaat al/],["40001","SECRET",/ondertussen gewijzigd/],["42883","SECRET",/opslagfunctie/],["23514","dossier_separate_approval",/goedkeuringsactie/],["XX000","SECRET",/Foutcode: XX000/]] as const){
  const result=feedback.dossierStorageFeedback({code,message,details:"SECRET"},fixture());assert.match(result.message,expected);assert.ok(!JSON.stringify(result).includes("SECRET"));
 }
});
test("Server weigert ongeldige tijdslots met details voordat een opslagaanroep plaatsvindt",async()=>{
 let calls=0;
 const modules=editorLoader({"next/cache":{revalidatePath:()=>{}},"@/lib/auth-context":{requireActiveMembership:async()=>{calls++;throw Error("must not write");}}});
 const {saveDossierEditor}=modules("src/app/app/dossier-editor-actions.ts") as {saveDossierEditor:(b:Bundle)=>Promise<{ok:boolean;issues?:Issue[]}>};
 const result=await saveDossierEditor(fixture({ends_at:"2026-10-08T09:00:00Z"}));
 assert.equal(result.ok,false);assert.equal(result.issues?.[0].field,"ends_at");assert.equal(calls,0);
});
test("Herkenbare kolom- en koppelingsfouten wijzen naar veilige veldmetadata",()=>{
 for(const [error,field]of [[{code:"23502",message:'null value in column "status" of relation "event_schedule_items" violates not-null constraint'},"status"],[{code:"23503",message:'insert violates foreign key constraint "event_schedule_items_organization_id_person_id_fkey"'},"person_id"]] as const){
  const result=feedback.dossierStorageFeedback({...error,details:"SECRET raw values"},fixture());
  assert.equal(result.issues?.[0].field,field);assert.equal(result.issues?.[0].tab,"planning");assert.ok(!JSON.stringify(result).includes("SECRET"));
 }
 const unknown=feedback.dossierStorageFeedback({code:"23502",message:'null value in column "secret" of relation "private_table"',details:"SECRET"},fixture());
 assert.equal(unknown.issues,undefined);assert.ok(!JSON.stringify(unknown).includes("private_table"));
});
test("Server vertaalt de werkelijke RPC-fout en behoudt een mislukte opslag als fout",async()=>{
 const modules=editorLoader({"next/cache":{revalidatePath:()=>{}},"@/lib/auth-context":{requireActiveMembership:async()=>({membership:{role:"admin",organization_id:rootId},supabase:{rpc:async()=>({data:null,error:{code:"23514",message:'new row violates check constraint "event_schedule_items_title_check"',details:"SECRET"}})}})}});
 const {saveDossierEditor}=modules("src/app/app/dossier-editor-actions.ts") as {saveDossierEditor:(b:Bundle)=>Promise<{ok:boolean;message:string;issues?:Issue[]}>};
 const result=await saveDossierEditor(fixture());assert.equal(result.ok,false);assert.equal(result.issues?.[0].field,"title");assert.ok(!JSON.stringify(result).includes("SECRET"));
});
