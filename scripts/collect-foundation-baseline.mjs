import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) => execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/").replace(/\/$/, "")}`, "-C", root, ...args], { encoding: "utf8" }).trim();
const output = process.argv[2];
if (!output) throw new Error("Gebruik: node scripts/collect-foundation-baseline.mjs <uitvoer.json>");
const migrations = [];
for (const name of (await readdir(path.join(root, "supabase/migrations"))).sort()) {
  const match = /^(\d+)_(.+)\.sql$/.exec(name);
  if (!match) continue;
  const bytes = await readFile(path.join(root, "supabase/migrations", name));
  const sql = bytes.toString("utf8");
  // Search hints only. This is not a SQL parser or a proof of applied effects.
  const hints = [...sql.matchAll(/\b(?:create\s+(?:or\s+replace\s+)?(?:table|function|view)|alter\s+table)\s+(?:if\s+not\s+exists\s+)?((?:public|private)\.[a-z_][a-z_0-9]*)/gi)].map((item) => item[1]);
  migrations.push({ version: match[1], name: match[2], file: name, sha256: createHash("sha256").update(bytes).digest("hex"), sha256_lf: createHash("sha256").update(sql.replaceAll("\r\n", "\n")).digest("hex"), object_search_hints: [...new Set(hints)].sort() });
}
const baseline = {
  format: "besc-foundation-baseline-v1", checked_at_utc: new Date().toISOString(),
  source_commit: git("rev-parse", "HEAD"), source_tree: git("rev-parse", "HEAD^{tree}"),
  tracked_changes: git("diff", "--name-only", "HEAD").split("\n").filter(Boolean),
  migrations,
  caution: "Git inventory only. Object hints do not prove complete migration equivalence; compare constraints, policies, grants, functions and data effects before repairing history.",
};
await writeFile(output, JSON.stringify(baseline, null, 2) + "\n", { flag: "wx" });
console.log(`Bronversie ${baseline.source_commit}; ${migrations.length} migraties; inventaris geschreven.`);
