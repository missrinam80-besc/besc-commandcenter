import * as contactTabHelpers from "../src/lib/contact-dossier-tabs.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const partner = "10000000-0000-4000-8000-000000000001";
const contact = "20000000-0000-4000-8000-000000000001";
const person = "30000000-0000-4000-8000-000000000001";

test("CRM intake bewaart alleen als de atomaire opdracht de juiste identiteit teruggeeft", async () => {
  const source = readFileSync("src/app/app/operations/relation-actions.ts", "utf8");
  const require = ((native) => (name: string) => name === "@/lib/contact-dossier-tabs" ? contactTabHelpers : native(name))(createRequire(import.meta.url));
  for (const role of ["admin", "board", "member", "volunteer"]) {
    for (const response of [{data: contact, error: null}, {data: null, error: null}, {data: person, error: null}, {data: contact, error: {message: "denied"}}]) {
      const calls: {name: string; args: Record<string, unknown>}[] = [];
      const invalidations: string[] = [];
      const dependencies: Record<string, unknown> = {
        "@/lib/auth-context": {requireActiveMembership: async () => ({membership: {role, organization_id: "fixture-org"}, supabase: {
          rpc: async (name: string, args: Record<string, unknown>) => {calls.push({name, args}); return response;},
          from: () => {throw Error("Geen losse tabelmutaties toegestaan");},
        }})},
        "@/lib/format": {},
        "next/navigation": {redirect: (path: string) => {throw Error(path);}},
        "next/cache": {revalidatePath: (path: string) => invalidations.push(path)},
      };
      const compiled = {exports: {} as {linkPartnerContact: (fd: FormData) => Promise<void>; addPartnerContact: (fd: FormData) => Promise<void>}};
      runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText,
        {module: compiled, exports: compiled.exports, require: (name: string) => name in dependencies ? dependencies[name] : require(name)});
      const fd = new FormData(); fd.set("partner_id", partner); fd.set("contact_id", contact); fd.set("community_person_id", person); fd.set("account_user_id", ""); fd.set("dossier_tab", "contacten");
      const manager = ["admin", "board"].includes(role);
      const saved = manager && response.data === contact && !response.error;
      await assert.rejects(compiled.exports.linkPartnerContact(fd), saved ? /succes=contact-gekoppeld&tab=contacten/ : manager ? /fout=contact-koppelen&tab=contacten/ : /geen-toegang/);
      assert.equal(calls.length, manager ? 1 : 0);
      if (calls.length) {
        assert.equal(calls[0].name, "save_partner_contact_intake");
        assert.equal(calls[0].args.p_contact_id, contact);
        assert.deepEqual({...calls[0].args.p_values as object}, {community_person_id: person, account_user_id: null});
      }
      assert.equal(invalidations.length, saved ? 1 : 0);
      fd.set("name", "");
      const newSaved = manager && Boolean(response.data) && !response.error;
      await assert.rejects(compiled.exports.addPartnerContact(fd), newSaved ? /succes=contact/ : manager ? /fout=contact-opslaan/ : /geen-toegang/);
      const previous = calls.length; fd.set("partner_id", "invalid");
      await assert.rejects(compiled.exports.linkPartnerContact(fd), /fout=contact/);
      assert.equal(calls.length, previous);
    }
  }
});
