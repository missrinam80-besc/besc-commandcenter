import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = { exports: {} as typeof import("../src/lib/dossier-relations.ts") };
runInNewContext(ts.transpileModule(
  readFileSync(new URL("../src/lib/dossier-relations.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, { module: compiled, exports: compiled.exports });
const { loadDossierConnections, dossierEntityConfig, dossierEntityTypes } = compiled.exports;
type Row = Record<string, unknown>;

function fixture(counterpartType: typeof dossierEntityTypes[number], reverse = false) {
  const config = dossierEntityConfig[counterpartType];
  const relations = ["active", "archived", "deleted", "missing", "hidden", "foreign"].map(id => ({
    id: `relation-${id}`, organization_id: "org",
    source_type: reverse ? counterpartType : "content", source_id: reverse ? id : "current",
    target_type: reverse ? "content" : counterpartType, target_id: reverse ? "current" : id,
    relationship_type: "supports",
  }));
  const rows = ["active", "archived", "deleted", "hidden", "foreign"].map(id => ({
    id, [config.titleColumn]: `TESTFIXTURE ${id}`, status: id === "archived" ? "archived" : "active",
    organization_id: id === "foreign" ? "other-org" : "org",
    deleted_at: id === "deleted" ? "2026-10-06" : null,
    visible: id !== "hidden",
  }));
  const links = [{ id: "link", organization_id: "org", entity_type: "content", entity_id: "current", label: "Reference", url: "https://example.com", link_type: "reference" }];
  const documents = [{ id: "document", organization_id: "org", entity_type: "content", entity_id: "current", resource_type: "document", name: "Reference document" }];
  const tables: Record<string, Row[]> = { record_relationships: relations, record_links: links, google_resource_links: documents, [config.table]: rows };
  const supabase = { from(table: string) {
    let selected = [...(tables[table] ?? [])].filter(row => row.visible !== false);
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { selected = selected.filter(row => row[column] === value); return query; },
      is: (column: string, value: unknown) => { selected = selected.filter(row => row[column] === value); return query; },
      in: (column: string, values: unknown[]) => { selected = selected.filter(row => values.includes(row[column])); return query; },
      or: () => query,
      order: () => query,
      then: (resolve: (value: { data: Row[] }) => unknown) => Promise.resolve({ data: selected }).then(resolve),
    };
    return query;
  } };
  return { supabase: supabase as unknown as Parameters<typeof loadDossierConnections>[0], relations, rows, links, documents };
}

for (const type of dossierEntityTypes) {
  for (const reverse of [false, true]) {
    test(`${type}: hides deleted/unavailable dossiers and retains active/archived relations (${reverse ? "incoming" : "outgoing"})`, async () => {
      const f = fixture(type, reverse);
      const original = JSON.stringify({ relations: f.relations, rows: f.rows });
      const result = await loadDossierConnections(f.supabase, "org", "content", "current");
      assert.deepEqual(Array.from(result.relationships, r => r.entityId), ["active", "archived"]);
      for (const relation of result.relationships) {
        assert.equal(relation.label, `TESTFIXTURE ${relation.entityId}`);
        assert.equal(relation.entityType, type);
        assert.equal(relation.href, `${dossierEntityConfig[type].route}/${relation.entityId}`);
        assert.equal(relation.relationship_type, "supports");
      }
      assert.equal(result.links[0].id, "link");
      assert.equal(result.documents[0].id, "document");
      assert.equal(JSON.stringify({ relations: f.relations, rows: f.rows }), original);
      // Restoring the dossier makes the preserved relationship visible again.
      f.rows.find(row => row.id === "deleted")!.deleted_at = null;
      const restored = await loadDossierConnections(f.supabase, "org", "content", "current");
      assert.deepEqual(Array.from(restored.relationships, r => r.entityId), ["active", "archived", "deleted"]);
    });
  }
}
