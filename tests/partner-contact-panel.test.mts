import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

test("sponsor toont gekoppelde personen vanuit de centrale fiche en bewaart intakevelden apart", () => {
  const require = createRequire(import.meta.url);
  const compiled = {exports: {} as {PartnerContactsPanel: React.ComponentType<Record<string, unknown>>}};
  const dependencies: Record<string, unknown> = {
    "next/link": {default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props)},
    "@/app/app/operations/relation-actions": {addPartnerContact: () => {}, linkPartnerContact: () => {}},
  };
  runInNewContext(ts.transpileModule(readFileSync("src/components/partner-contacts-panel.tsx", "utf8"), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText, {module: compiled, exports: compiled.exports, require: (name: string) => name in dependencies ? dependencies[name] : require(name)});
  const base = {partnerId: "company", contacts: [{id: "rep", name: "Oude CRM-naam", community_person_id: "person", role_title: "Sponsorvertegenwoordiger"}],
    people: [{id: "person", display_name: "Actuele contactnaam", email: "fixture@example.com", account_user_id: "account"}],
    accounts: [{id: "pending", label: "Wachtend account · In afwachting"}], canManage: true, optionsError: false};
  const html = renderToStaticMarkup(React.createElement(compiled.exports.PartnerContactsPanel, base));
  assert.match(html, /Actuele contactnaam/); assert.doesNotMatch(html, /Oude CRM-naam/);
  assert.match(html, /Sponsorvertegenwoordiger/); assert.match(html, /href="\/app\/community\/person"/);
  assert.match(html, /Account gekoppeld/); assert.match(html, /In afwachting/);
  assert.match(html, /name="community_person_id"/); assert.match(html, /name="account_user_id"/);
  const readonly = renderToStaticMarkup(React.createElement(compiled.exports.PartnerContactsPanel, {...base, canManage: false}));
  assert.doesNotMatch(readonly, /<form/); assert.match(readonly, /Actuele contactnaam/);
  const failed = renderToStaticMarkup(React.createElement(compiled.exports.PartnerContactsPanel, {...base, optionsError: true}));
  assert.match(failed, /role="alert"/); assert.doesNotMatch(failed, /<form/);
});
