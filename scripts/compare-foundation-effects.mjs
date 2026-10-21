import { readFile, writeFile } from "node:fs/promises";
import { compareFoundationEffects } from "./foundation/compare-effects.mjs";

const [referencePath, actualPath, baselinePath, output] = process.argv.slice(2);
if (!referencePath || !actualPath || !baselinePath || !output) throw Error("Gebruik: node scripts/compare-foundation-effects.mjs <native.json> <cloud.json> <git.json> <uitvoer.json>");
const reference = JSON.parse(await readFile(referencePath, "utf8"));
const actual = JSON.parse(await readFile(actualPath, "utf8"));
const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
if (reference.format !== "besc-native-replay-v1" || baseline.format !== "besc-foundation-baseline-v1" || reference.migration_count !== baseline.migrations.length || reference.migrations?.length !== baseline.migrations.length) throw Error("Requires a full native replay of the current migration manifest, not object-name hints");
const hashes = new Map(baseline.migrations.map((row) => [row.version, row.sha256_lf]));
if (reference.migrations.some((row) => !hashes.get(row.version) || hashes.get(row.version) !== row.sha256_lf)) throw Error("Native replay migration hashes differ from the Git baseline");
const report = compareFoundationEffects(reference.effects, actual);
report.native_source_commit = reference.source_commit;
report.migration_hashes_verified = true;
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(`Vergelijking: ${report.differences.length} inhoudelijke metadata-afwijkingen; ${report.formatting_only_functions.length} functies met gecontroleerde tekstuele opmaakverschillen.`);
if (!report.schema_matches) process.exitCode = 1;
