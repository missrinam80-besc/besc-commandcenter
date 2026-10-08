import * as contactTabHelpers from "../src/lib/contact-dossier-tabs.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = ((native) => (name: string) => name === "@/lib/contact-dossier-tabs" ? contactTabHelpers : native(name))(createRequire(import.meta.url));
function load(path: string, overrides: Record<string, unknown> = {}, globals: Record<string, unknown> = {}) {
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = { exports: {} as Record<string, unknown> };
  runInNewContext(code, { module: compiled, exports: compiled.exports,
    require: (id: string) => id === "@/lib/source-observation" ? load("src/lib/source-observation.ts") : id in overrides ? overrides[id] : require(id),
    URL, URLSearchParams, Date, ...globals });
  return compiled.exports;
}
const id = "abcdefghijklmnop";
const file = { id, name: "TESTFIXTURE — NIET PUBLICEREN.pdf", mimeType: "application/pdf", trashed: false,
  webViewLink: `https://drive.google.com/file/d/${id}/view`, driveId: "fixture-drive", parents: ["fixture-parent"], version: "9007199254740993", modifiedTime: "2025-09-03T12:00:00Z", checkedAt: "2026-10-05T12:00:00Z" };

function metadata(response: Record<string, unknown> = file, status = 200) {
  const calls: { url: string; method: string }[] = [];
  const env = Object.fromEntries(["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN",
    "GOOGLE_CLOUD_PROJECT_ID", "GOOGLE_SHARED_DRIVE_ID", "GOOGLE_DRIVE_ROOT_FOLDER_ID", "GOOGLE_CALENDAR_ID",
    "GOOGLE_TEMPLATE_MINUTES_ID", "GOOGLE_TEMPLATE_SPONSOR_REPORT_ID", "GOOGLE_TEMPLATE_EVENT_ID"].map(k => [k, "fixture"]));
  const loaded = load("src/lib/google-workspace.ts", {}, { process: { env }, fetch: async (url: string, init?: { method?: string }) => {
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.startsWith("https://oauth2.googleapis.com/")) return { ok: true, json: async () => ({ access_token: "fixture", expires_in: 3600 }) };
    return { ok: status === 200, status, json: async () => response };
  } });
  return { calls, get: loaded.getGoogleDriveDocumentMetadata as (id: string) => Promise<typeof file> };
}
test("Metadata leest werkelijke PDF-identiteit zonder Drive-write", async () => {
  const f=metadata(); const result=await f.get(id);
  assert.equal(result.mimeType,"application/pdf"); assert.equal(result.id,id);
  assert.equal(result.parents[0],"fixture-parent");
  assert.equal(result.version,"9007199254740993"); assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
  assert.equal(f.calls[1].method,"GET"); assert.match(f.calls[1].url,/supportsAllDrives=true/);
  assert.match(f.calls[1].url,/fields=.*trashed/);
});
for (const [name, overrides] of [
  ["map", { mimeType: "application/vnd.google-apps.folder" }],
  ["shortcut", { mimeType: "application/vnd.google-apps.shortcut" }],
  ["prullenbak", { trashed: true }],
  ["onvolledige metadata", { trashed: undefined }],
  ["andere identiteit", { id: "another-file" }],
] as const) test(`Metadata weigert ${name}`, async () => {
  await assert.rejects(metadata({ ...file, ...overrides }).get(id));
});
for (const status of [403,404]) test(`Onbereikbare bron ${status} levert geen metadata op`, async () => {
  await assert.rejects(metadata({error:{message:"PRIVATE_DETAIL"}},status).get(id));
});

function action(options: { metadataError?: boolean; missingDossier?: boolean; denied?: boolean; lookupError?: boolean; insertError?: boolean } = {}) {
  const writes: Record<string, unknown>[]=[]; const filters: unknown[][]=[];
  let metadataCalls=0;
  const supabase={ from: (table: string) => {
    const query: Record<string, unknown>={};
    for (const method of ["select","eq","is"]) query[method]=(...args: unknown[])=>{filters.push([table,method,...args]);return query;};
    query.maybeSingle=async()=>({data:options.missingDossier ? null : {id:"11111111-1111-4111-8111-111111111111"},error:options.lookupError ? {message:"PRIVATE_LOOKUP"} : null});
    query.insert=async (row: Record<string, unknown>)=>{writes.push(row);return {error:options.insertError ? {message:"PRIVATE_INSERT"} : null};};
    return query;
  } };
  const actualConfig=load("src/lib/dossier-relations.ts");
  const actualGoogle=load("src/lib/google-workspace.ts");
  const loaded=load("src/app/app/dossier-actions.ts", {
    "next/cache":{revalidatePath:()=>undefined},
    "next/navigation":{redirect:(url:string)=>{throw new Error(url);}},
    "@/lib/auth-context":{requirePermission:async()=>{
      if(options.denied)throw Error("DENIED");
      return {supabase,user:{id:"fixture-user"},membership:{organization_id:"fixture-org"}};
    }},
    "@/lib/dossier-relations":actualConfig,
    "@/lib/google-workspace":{googleDriveFileId:actualGoogle.googleDriveFileId,getGoogleDriveDocumentMetadata:async()=>{
      metadataCalls++; if(options.metadataError)throw Error("PRIVATE_GOOGLE_DETAIL");return file;
    }},
  });
  const form=(url=`https://drive.google.com/file/d/${id}/view`)=>new Map([
    ["entity_type","event"],["entity_id","11111111-1111-4111-8111-111111111111"],["name","Mijn gekozen label"],["url",url],
  ]);
  return {writes,filters, count:()=>metadataCalls,run:(url?:string)=>(loaded.addRecordDocument as (f: unknown)=>Promise<void>)(form(url))};
}
test("Koppeling bewaart werkelijk MIME-type en locatie, met gekozen label en organisatie", async()=>{
  const a=action();await assert.rejects(a.run(),/succes=document-gekoppeld/);
  assert.equal(a.writes.length,1);assert.equal(a.writes[0].mime_type,"application/pdf");
  assert.equal(a.writes[0].name,"Mijn gekozen label");assert.equal(a.writes[0].google_id,id);
  assert.equal(a.writes[0].organization_id,"fixture-org");assert.equal(a.writes[0].parent_id,"fixture-parent");
  assert.equal(a.writes[0].source_version,"9007199254740993");assert.equal(a.writes[0].source_checked_at,"2026-10-05T12:00:00.000Z");
  assert.ok(a.filters.some(f=>f[1]==="eq"&&f[2]==="organization_id"&&f[3]==="fixture-org"));
  assert.ok(a.filters.some(f=>f[1]==="is"&&f[2]==="deleted_at"&&f[3]===null));
});
for(const [name,options] of [
  ["ontbrekend/verkeerd dossier",{missingDossier:true}],
  ["dossierleesfout",{lookupError:true}],
  ["onbevoegde gebruiker",{denied:true}],
  ["Google-leesfout",{metadataError:true}],
] as const)test(`Geen broninsert bij ${name}`,async()=>{
  const a=action(options);await assert.rejects(a.run());assert.equal(a.writes.length,0);
  if(!("metadataError" in options))assert.equal(a.count(),0);
});
for(const url of [`https://example.invalid/file/d/${id}/view`,`http://drive.google.com/file/d/${id}/view`,`https://user:secret@drive.google.com/file/d/${id}/view`])test("Niet toegestane URL heeft geen lees- of schrijfactie",async()=>{
  const a=action();await assert.rejects(a.run(url),/document-link/);assert.equal(a.count(),0);assert.equal(a.writes.length,0);
});
test("API-fout blijft gesanitiseerd in de gebruikersroute",async()=>{
  const a=action({metadataError:true});await assert.rejects(a.run(),/fout=document-controleren$/);
});
test("Opslagfout wordt geen succesmelding",async()=>{
  const a=action({insertError:true});await assert.rejects(a.run(),/fout=document-koppelen$/);
});
