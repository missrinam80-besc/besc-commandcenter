import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const input = JSON.parse(await fs.readFile("../output/monday-migration-classification.json", "utf8"));
const inventory = JSON.parse(await fs.readFile("../output/monday-full-inventory.json", "utf8"));
const outputDir = "../output";

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const lower = (value) => clean(value).toLowerCase();
const normalizeTitle = (value) => lower(value).replace(/[^a-z0-9\u00c0-\u024f]+/g, " ").trim();
const parseColumns = (record) => { try { return JSON.parse(record.columnValues || "{}"); } catch { return {}; } };
const firstValue = (columns, patterns) => {
  for (const [key, value] of Object.entries(columns)) {
    if (patterns.some((pattern) => pattern.test(lower(key))) && clean(value)) return clean(value);
  }
  return "";
};
const allMeaningfulFields = (columns) => Object.entries(columns)
  .filter(([, value]) => clean(value) && clean(value) !== "[]" && clean(value) !== "{}")
  .map(([key, value]) => `**${clean(key)}:** ${clean(value)}`).join("\n");
const dateFrom = (value) => {
  const match = clean(value).match(/\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-Z]+)?/);
  return match?.[0] ?? "";
};
const statusText = (record, columns) => lower(`${record.group} ${firstValue(columns, [/status/, /beslissing/])}`);
const priorityFrom = (columns) => {
  const value = lower(firstValue(columns, [/prioriteit/, /priority/]));
  if (/urgent|kritiek|critical/.test(value)) return "urgent";
  if (/hoog|high|strategisch/.test(value)) return "high";
  if (/laag|low/.test(value)) return "low";
  return "normal";
};
const inboxStatus = (text) => /afgewezen|geweigerd|rejected/.test(text) ? "rejected" : /afgerond|ok|processed|bevestigd/.test(text) ? "processed" : /bezig|review|behandeling/.test(text) ? "reviewing" : "new";
const taskStatus = (text) => /afgerond|done|completed|klaar/.test(text) ? "done" : /geannuleerd|cancelled/.test(text) ? "cancelled" : /wachten|waiting/.test(text) ? "waiting" : /review|controle/.test(text) ? "review" : /bezig|doing|progress|uitvoering/.test(text) ? "doing" : "todo";
const projectStatus = (text) => /gearchiveerd|archived/.test(text) ? "archived" : /afgerond|done|completed/.test(text) ? "done" : /geblokkeerd|blocked/.test(text) ? "blocked" : /live|actief|active/.test(text) ? "active" : /go|gepland|planned|bevestigd/.test(text) ? "planned" : "idea";

const demoParentBoards = new Set(["[EVENT] Event master", "[OPS] Operations master", "[OPS] Tasks master", "[STREAM] Livestream master"]);
const resolved = input.records.map((record) => {
  const next = { ...record };
  const columns = parseColumns(record);
  if (record.advice === "Controle nodig") {
    next.advice = record.group.toLowerCase().includes("afgerond") ? "Importeren als historiek" : "Importeren in MVP";
    next.confidence = "Hoog";
    next.reviewNote = "Formulierinhoud gecontroleerd: betekenisvolle echte inzending.";
  }
  if (demoParentBoards.has(record.boardName)) {
    next.advice = "Overslaan als demo";
    next.confidence = "Hoog";
    next.reviewNote = "Hoofditem hoort bij herkenbare monday-voorbeelddata.";
  }
  if (record.sourceKind === "Ingebed subitem" && demoParentBoards.has(record.boardName)) {
    next.advice = "Overslaan als demo";
    next.confidence = "Hoog";
    next.reviewNote = "Subitem hoort bij herkenbare monday-voorbeelddata.";
  }
  if (record.boardName.startsWith("Subitems van ") && demoParentBoards.has(record.boardName.replace("Subitems van ", ""))) {
    next.advice = "Overslaan als demo";
    next.confidence = "Hoog";
    next.reviewNote = "Los subitembord hoort bij herkenbare monday-voorbeelddata.";
  }
  next.columns = columns;
  return next;
});

const includeMvp = (record) => ["Importeren in MVP", "Importeren als historiek"].includes(record.advice) && ["Inbox", "Taken", "Projecten"].includes(record.target);
const includeOther = (record) => record.target === "Overige" && ["Bewaren voor latere module", "Importeren als historiek", "Alleen historiek"].includes(record.advice);

const duplicateGroups = new Map();
for (const record of resolved.filter(includeMvp)) {
  const columns = record.columns;
  const email = lower(firstValue(columns, [/e-mail/, /email/]));
  const key = record.target === "Inbox" && email ? `${record.target}|${record.boardId}|email:${email}` : `${record.target}|title:${normalizeTitle(record.itemName)}`;
  if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
  duplicateGroups.get(key).push(record);
}
const duplicateKeys = new Map();
for (const [key, records] of duplicateGroups) if (records.length > 1) records.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).forEach((record, index) => duplicateKeys.set(record.itemId, { key, canonical: index === 0, count: records.length }));

const inboxRows = [], taskRows = [], projectRows = [], otherRows = [], manifest = { generated_at: new Date().toISOString(), mode: "dry-run", writes_performed: false, inbox_items: [], tasks: [], projects: [], legacy_records: [], skipped: [], duplicate_groups: [] };
const syntheticProjects = [
  { key: "synthetic:social-channel-strategy", title: "Social media heractivatie en kanaalstrategie", description: "Voorgesteld verzamelproject voor de concrete kanaalacties uit [MKT] Campaign master.", status: "active", priority: "high" },
  { key: "synthetic:stream-graphics-shop-launch", title: "BESC Stream Graphics Shop lancering", description: "Voorgesteld verzamelproject voor de taken uit [SHOP] Launch planning.", status: "planned", priority: "normal" },
  { key: "synthetic:merch-range-launch", title: "Nieuwe BESC-merchreeks lanceren", description: "Voorgesteld verzamelproject voor de uitvoerende merch-lanceringstaken.", status: "planned", priority: "normal" },
];
for (const project of syntheticProjects) {
  const row = { monday_item_id: project.key, title: project.title, description: project.description, status: project.status, priority: project.priority, start_date: null, due_date: null, drive_url: null, created_at: null, synthetic: true, external: { source_system: "monday-dry-run", synthetic_key: project.key } };
  manifest.projects.push(row);
  projectRows.push([project.key, row.title, row.status, row.priority, "", "", "", "Samengesteld uit taken", "Dry-run voorstel", row.description, ""]);
}
const projectHintFor = (record) => record.boardName === "[MKT] Campaign master" ? "synthetic:social-channel-strategy"
  : record.boardName === "[SHOP] Launch planning" ? "synthetic:stream-graphics-shop-launch"
  : record.boardName === "[SHOP] Merch pipeline" ? "synthetic:merch-range-launch" : null;
for (const record of resolved) {
  const columns = record.columns;
  const text = statusText(record, columns);
  const duplicate = duplicateKeys.get(record.itemId);
  const duplicateAction = duplicate ? (duplicate.canonical ? "Canoniek record" : "Samenvoegen/controleren") : "Geen duplicaat";
  const source = record.boardName.includes("INTAKE") || /form/.test(lower(record.group)) ? "form" : record.boardName === "Idea intake" ? "monday-idea" : "monday";
  const description = allMeaningfulFields(columns);
  const external = { source_system: "monday", workspace: record.workspace, board_id: record.boardId, board_name: record.boardName, item_id: record.itemId, source_url: record.sourceUrl, raw_fields: columns };

  if (includeMvp(record) && !duplicate?.canonical && duplicate) {
    manifest.skipped.push({ monday_item_id: record.itemId, reason: "Probabel duplicaat; eerst samenvoegen/controleren", duplicate_key: duplicate.key });
    continue;
  }
  if (includeMvp(record) && record.target === "Inbox") {
    const title = firstValue(columns, [/volledige naam/, /^naam$/, /organisatie/]) || record.itemName;
    const row = { monday_item_id: record.itemId, title, description, source, status: inboxStatus(text), priority: priorityFrom(columns), created_at: record.createdAt, external };
    manifest.inbox_items.push(row);
    inboxRows.push([record.itemId, title, source, row.status, row.priority, record.createdAt, record.boardName, duplicateAction, description, record.sourceUrl]);
  } else if (includeMvp(record) && record.target === "Taken") {
    const due = dateFrom(firstValue(columns, [/deadline/, /due/, /datum/, /date/, /timeline/]));
    const status = taskStatus(text);
    const projectHint = projectHintFor(record);
    const row = { monday_item_id: record.itemId, title: record.itemName, description, status, priority: priorityFrom(columns), due_at: due || null, completed_at: status === "done" ? (record.updatedAt || null) : null, proposed_project_key: projectHint, created_at: record.createdAt, external };
    manifest.tasks.push(row);
    taskRows.push([record.itemId, row.title, status, row.priority, due, projectHint ?? "Geen betrouwbare bronrelatie", record.boardName, record.group, description, record.sourceUrl]);
  } else if (includeMvp(record) && record.target === "Projecten") {
    const timeline = firstValue(columns, [/timeline/, /periode/]);
    const dates = clean(timeline).match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    const row = { monday_item_id: record.itemId, title: record.itemName, description, status: projectStatus(text), priority: priorityFrom(columns), start_date: dates[0] ?? null, due_date: dates[1] ?? (dateFrom(firstValue(columns, [/deadline/, /einddatum/, /date/])) || null), drive_url: firstValue(columns, [/drive/, /document/, /map/]) || null, created_at: record.createdAt, external };
    manifest.projects.push(row);
    projectRows.push([record.itemId, row.title, row.status, row.priority, row.start_date ?? "", row.due_date ?? "", row.drive_url ?? "", record.boardName, record.group, description, record.sourceUrl]);
  } else if (includeOther(record)) {
    const row = { monday_item_id: record.itemId, title: record.itemName, category: "Overige", suggested_module: record.futureModule, lifecycle: record.advice === "Bewaren voor latere module" ? "active_or_unknown" : "historical", source_status: firstValue(columns, [/status/]) || record.group, payload: external, created_at: record.createdAt };
    manifest.legacy_records.push(row);
    otherRows.push([record.itemId, row.title, row.suggested_module, row.lifecycle, row.source_status, record.boardName, record.group, record.createdAt, JSON.stringify(columns), record.sourceUrl]);
  } else {
    manifest.skipped.push({ monday_item_id: record.itemId, target: record.target, reason: record.advice, board: record.boardName });
  }
}
manifest.duplicate_groups = [...duplicateGroups.entries()].filter(([, records]) => records.length > 1).map(([key, records]) => ({ key, item_ids: records.map((record) => record.itemId), recommended_action: "Behoud oudste als canoniek; controleer of inhoud van overige records moet worden samengevoegd." }));

const highPriorityPatterns = /contentplanning|notulen|verslag av|actiepunten|besc games|tutorial|kalender|contacten|dagindeling|livestreamschema|streamathon|podcast|esports showcase|metricool|wettelijke verplichtingen|promotie besc games/i;
const ignorePatterns = /rondleiding|onboarding|mcp getting started|start hier|overzicht borden|nieuw bord|google docs embed|meeting notes|notulen leeg/i;
const unreadable = inventory.boards.filter((board) => board.state !== "active" && (board.items_count ?? 0) > 0).map((board) => {
  let decision = "Herstellen - controle";
  let reason = "Naam is BESC-relevant, maar iteminhoud is niet zichtbaar; kort herstellen om inhoud te beoordelen.";
  if (ignorePatterns.test(board.name)) { decision = "Niet herstellen"; reason = "Herkenbaar systeem-, onboarding-, leeg of testbord."; }
  else if (highPriorityPatterns.test(board.name) || (board.items_count ?? 0) > 8) { decision = "Herstellen - hoge prioriteit"; reason = "Waarschijnlijk betekenisvolle historiek of inhoud met meerdere records."; }
  if (board.name.includes("BESC_Tutorial_Planning_Alle_Titels") && String(board.id) === "1889962140") { decision = "Niet herstellen"; reason = "Waarschijnlijke duplicaatkopie van bord 1889961759; herstel eerst slechts \u00e9\u00e9n versie."; }
  return [board.workspace_name, String(board.id), clean(board.name), board.state, board.items_count ?? 0, decision, reason, board.url ?? ""];
});

await fs.writeFile(`${outputDir}/monday-import-dry-run.json`, JSON.stringify(manifest, null, 2));

const wb = Workbook.create();
const summary = wb.worksheets.add("Samenvatting");
const inbox = wb.worksheets.add("Inbox dry-run");
const tasks = wb.worksheets.add("Taken dry-run");
const projects = wb.worksheets.add("Projecten dry-run");
const other = wb.worksheets.add("Overige dry-run");
const duplicates = wb.worksheets.add("Duplicaten");
const unavailable = wb.worksheets.add("Te herstellen borden");
const mapping = wb.worksheets.add("Veldmapping");
const schema = wb.worksheets.add("Schema vooraf nodig");

const purple = "#342F74", orange = "#EF7F3B", palePurple = "#F4F1FF", green = "#E8F5E9", red = "#FDECEC", grid = "#D9DDE7";
const header = { fill: orange, font: { bold: true, color: "#FFFFFF" }, borders: { preset: "outside", style: "thin", color: grid } };
const title = { fill: purple, font: { bold: true, color: "#FFFFFF", size: 18 } };
const colName = (number) => { let out = "", n = number; while (n > 0) { n--; out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26); } return out; };
const setup = (sheet, headers, rows, tableName, widths = {}) => {
  sheet.getRangeByIndexes(0, 0, 1, headers.length).values = [headers]; sheet.getRangeByIndexes(0, 0, 1, headers.length).format = header;
  if (rows.length) sheet.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
  const used = sheet.getRangeByIndexes(0, 0, Math.max(1, rows.length + 1), headers.length); used.format.wrapText = true; used.format.borders = { insideHorizontal: { style: "thin", color: grid } }; used.format.autofitColumns();
  for (const [column, width] of Object.entries(widths)) sheet.getRange(`${column}:${column}`).format.columnWidth = width;
  sheet.freezePanes.freezeRows(1); sheet.showGridLines = false; if (rows.length) sheet.tables.add(`A1:${colName(headers.length)}${rows.length + 1}`, true, tableName);
};

summary.getRange("A1:H2").merge(); summary.getRange("A1").values = [["BESC monday.com - definitieve import dry-run"]]; summary.getRange("A1:H2").format = title;
summary.getRange("A4:B14").values = [["Resultaat", "Aantal"], ["Supabase-writes uitgevoerd", 0], ["Inboxitems klaar", manifest.inbox_items.length], ["Taken klaar", manifest.tasks.length], ["Bronprojecten klaar", manifest.projects.filter((project) => !project.synthetic).length], ["Voorgestelde verzamelprojecten", manifest.projects.filter((project) => project.synthetic).length], ["Projecten totaal te cre\u00ebren", manifest.projects.length], ["Overige/legacy klaar", manifest.legacy_records.length], ["Overgeslagen bronrecords", manifest.skipped.length], ["Duplicaatgroepen", manifest.duplicate_groups.length], ["Totaal bronrecords gecontroleerd", resolved.length]]; summary.getRange("A4:B4").format = header;
summary.getRange("D4:H10").merge(); summary.getRange("D4").values = [["Deze dry-run voert geen databasewrites uit. Home blijft een afgeleid dashboard. Betekenisvolle niet-MVP-data gaat later naar legacy_records met categorie Overige. Voor een idempotente import zijn eerst twee technische tabellen nodig: migration_source_links en legacy_records."]]; summary.getRange("D4:H10").format = { fill: palePurple, font: { bold: true, color: purple }, wrapText: true, borders: { preset: "outside", style: "thin", color: grid } };
const restoreCounts = ["Herstellen - hoge prioriteit", "Herstellen - controle", "Niet herstellen"].map((decision) => [decision, unreadable.filter((row) => row[5] === decision).length, unreadable.filter((row) => row[5] === decision).reduce((sum, row) => sum + Number(row[4]), 0)]);
summary.getRange("A17:C17").values = [["Niet-uitleesbare borden", "Borden", "monday itemteller"]]; summary.getRange("A17:C17").format = header; summary.getRangeByIndexes(17, 0, restoreCounts.length, 3).values = restoreCounts;
summary.getRange("A:C").format.columnWidth = 30; summary.getRange("D:H").format.columnWidth = 17; summary.showGridLines = false;

setup(inbox, ["monday Item ID", "Titel", "Bron", "Status", "Prioriteit", "Aangemaakt", "Bronbord", "Duplicaatadvies", "Beschrijving/velden", "monday URL"], inboxRows, "InboxDryRunTable", { B: 35, G: 32, H: 28, I: 75, J: 48 });
setup(tasks, ["monday Item ID", "Titel", "Status", "Prioriteit", "Deadline", "Projectkoppeling", "Bronbord", "Groep", "Beschrijving/velden", "monday URL"], taskRows, "TasksDryRunTable", { B: 45, F: 32, G: 32, H: 24, I: 65, J: 48 });
setup(projects, ["monday Item ID", "Titel", "Status", "Prioriteit", "Start", "Deadline", "Drive-link", "Bronbord", "Groep", "Beschrijving/velden", "monday URL"], projectRows, "ProjectsDryRunTable", { B: 42, G: 45, H: 32, I: 24, J: 65, K: 48 });
setup(other, ["monday Item ID", "Titel", "Voorgestelde module", "Levenscyclus", "Bronstatus", "Bronbord", "Groep", "Aangemaakt", "Ruwe velden (JSON)", "monday URL"], otherRows, "OtherDryRunTable", { B: 45, C: 34, F: 32, G: 25, I: 75, J: 48 });
for (const [sheet, dateColumns, rowCount] of [[inbox, ["F"], inboxRows.length], [tasks, ["E"], taskRows.length], [projects, ["E", "F"], projectRows.length], [other, ["H"], otherRows.length]]) for (const column of dateColumns) if (rowCount) sheet.getRange(`${column}2:${column}${rowCount + 1}`).format.numberFormat = "yyyy-mm-dd";

const duplicateRows = manifest.duplicate_groups.flatMap((group) => group.item_ids.map((id, index) => [group.key, id, index === 0 ? "Canoniek behouden" : "Samenvoegen/controleren", group.recommended_action]));
setup(duplicates, ["Duplicaatsleutel", "monday Item ID", "Advies", "Toelichting"], duplicateRows, "DuplicatesDryRunTable", { A: 55, C: 28, D: 75 });
setup(unavailable, ["Workspace", "Board ID", "Bord", "State", "monday itemteller", "Beslissing", "Reden", "URL"], unreadable, "RestoreBoardsTable", { C: 48, F: 30, G: 75, H: 48 });
if (unreadable.length) { unavailable.getRange(`F2:F${unreadable.length + 1}`).conditionalFormats.add("containsText", { text: "hoge prioriteit", format: { fill: green, font: { color: "#1B5E20" } } }); unavailable.getRange(`F2:F${unreadable.length + 1}`).conditionalFormats.add("containsText", { text: "Niet", format: { fill: red, font: { color: "#8A1C1C" } } }); }

const mappingRows = [
  ["Inbox", "title", "Naam/organisatie indien aanwezig, anders monday-itemnaam", "Verplicht"], ["Inbox", "description", "Alle niet-lege monday-formuliervelden als Markdown", "Persoonsgegevens; alleen bevoegde gebruikers"], ["Inbox", "source", "form, monday-idea of monday", "Genormaliseerd"], ["Inbox", "status", "new/reviewing/processed/rejected", "Volgens bronstatus en groep"],
  ["Taken", "title", "monday-itemnaam", "Verplicht"], ["Taken", "status", "todo/doing/waiting/review/done/cancelled", "Volgens bronstatus en groep"], ["Taken", "due_at", "Deadline/datum/timeline", "Leeg indien niet betrouwbaar"], ["Taken", "project_id", "Bronrelatie of voorgesteld verzamelproject", "39 taken krijgen een voorstel; overige blijven ongekoppeld"],
  ["Projecten", "title", "monday-itemnaam", "Verplicht"], ["Projecten", "status", "idea/planned/active/blocked/done/archived", "Volgens bronstatus en groep"], ["Projecten", "start_date/due_date", "Timeline of datumvelden", "Leeg indien onbekend"], ["Projecten", "drive_url", "Drive/document-map URL", "Alleen geldige bronwaarde"],
  ["Overige", "suggested_module", "Automatische moduleclassificatie", "Later herclassificeerbaar"], ["Alle", "monday item ID", "migration_source_links.external_id", "Unieke idempotentiesleutel"], ["Alle", "raw_payload", "Volledige bronmetadata als jsonb", "Audit en latere hermapping"],
];
setup(mapping, ["Doeltabel", "Doelveld", "Bron/transformatie", "Opmerking"], mappingRows, "FieldMappingTable", { A: 22, B: 28, C: 65, D: 55 });

const schemaRows = [
  ["migration_source_links", "Nieuwe technische tabel", "Koppelt monday-ID aan uiteindelijke UUID; voorkomt dubbele imports en bewaart bron-URL/raw payload."],
  ["legacy_records", "Nieuwe tijdelijke functionele tabel", "Bewaart Overige-records met suggested_module totdat hun definitieve module bestaat."],
  ["Unieke index", "(organization_id, source_system, external_id)", "Maakt de import veilig opnieuw uitvoerbaar."],
  ["RLS", "Actieve leden lezen; admin/board schrijven", "Sluit aan op bestaande private.is_active_member/is_org_manager functies."],
  ["Data API", "Expliciete grants controleren", "Sinds april 2026 kunnen nieuwe Supabase-projecten tabellen standaard niet blootstellen aan Data/GraphQL API."],
  ["Importactor", "Bestaande admin-gebruiker", "created_by kan niet uit monday betrouwbaar naar een Supabase UUID worden vertaald."],
];
setup(schema, ["Onderdeel", "Voorstel", "Waarom"], schemaRows, "SchemaProposalTable", { A: 32, B: 50, C: 85 });

await fs.mkdir(outputDir, { recursive: true });
for (const [sheetName, range] of [["Samenvatting", "A1:H21"], ["Inbox dry-run", "A1:J18"], ["Taken dry-run", "A1:J18"], ["Projecten dry-run", "A1:K12"], ["Overige dry-run", "A1:J18"], ["Duplicaten", "A1:D12"], ["Te herstellen borden", "A1:H20"], ["Veldmapping", "A1:D16"], ["Schema vooraf nodig", "A1:C7"]]) {
  const preview = await wb.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(`${outputDir}/qa-dry-run-${sheetName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`, new Uint8Array(await preview.arrayBuffer()));
}
const output = await SpreadsheetFile.exportXlsx(wb); await output.save(`${outputDir}/BESC-monday-import-dry-run-2026-07-20.xlsx`);
console.log((await wb.inspect({ kind: "table", range: "Samenvatting!A1:H21", include: "values,formulas", tableMaxRows: 25, tableMaxCols: 10 })).ndjson);
console.log((await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 200 }, summary: "final formula error scan" })).ndjson);
console.log(JSON.stringify({ inbox: manifest.inbox_items.length, tasks: manifest.tasks.length, projects: manifest.projects.length, legacy: manifest.legacy_records.length, skipped: manifest.skipped.length, duplicates: manifest.duplicate_groups.length, restore: Object.fromEntries(restoreCounts.map((row) => [row[0], row[1]])) }));
