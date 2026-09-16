import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const sourcePath = "../output/monday-full-inventory.json";
const outputDir = "../output";
const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const boardMap = new Map(source.boards.map((board) => [String(board.id), board]));

const clean = (value) => String(value ?? "")
  .replace(/\u00e2\u0080\u0093|\u00e2\u0080\u0094/g, "-")
  .replace(/\s+/g, " ")
  .trim();
const lower = (value) => clean(value).toLowerCase();

const futureModule = (boardName) => {
  const name = lower(boardName);
  if (name.includes("content") || name.includes("blog") || name.includes("podcast") || name.includes("video") || name.includes("thumbnail")) return "Content Studio";
  if (name.includes("[mkt]") || name.includes("social") || name.includes("campaign") || name.includes("branding") || name.includes("pr & press")) return "Social, marketing & campagnes";
  if (name.includes("[event]") || name.includes("event")) return "Events";
  if (name.includes("[crm]") || name.includes("sponsor") || name.includes("partner") || name.includes("outreach") || name.includes("contactmoment")) return "Sponsors & CRM";
  if (name.includes("[people]") || name.includes("people") || name.includes("volunteer") || name.includes("moderator") || name.includes("community support")) return "Community & vrijwilligers";
  if (name.includes("[fin]") || name.includes("legal") || name.includes("contract") || name.includes("insurance") || name.includes("subsid")) return "Administratie & financi\u00ebn";
  if (name.includes("[meet]") || name.includes("meeting") || name.includes("decision")) return "Vergaderingen & besluiten";
  if (name.includes("[data]") || name.includes("analytics") || name.includes("kpi") || name.includes("performance")) return "Analytics & rapportage";
  if (name.includes("[comms]") || name.includes("newsletter") || name.includes("press release") || name.includes("announcement") || name.includes("statement")) return "Communicatie";
  if (name.includes("[stream]") || name.includes("livestream") || name.includes("obs") || name.includes("broadcast") || name.includes("clip request")) return "Streams & broadcast";
  if (name.includes("[shop]") || name.includes("shop") || name.includes("merch") || name.includes("order") || name.includes("product catalog")) return "Shop & merchandise";
  if (name.includes("[edu]") || name.includes("workshop") || name.includes("speaker")) return "Academy & kennis";
  if (name.includes("asset library") || name.includes("calendar master")) return "Documenten & planning";
  return "Nog te bepalen";
};

const classify = (boardName, itemName, groupName, isSubitem = false) => {
  const board = lower(boardName);
  const item = lower(itemName);
  const group = lower(groupName);

  if (board.includes("idea intake") || board.includes("[intake]") || board.includes("participation intake")) {
    return { target: "Inbox", reason: "Bronbord is bedoeld voor nieuwe aanvragen, idee\u00ebn of inschrijvingen." };
  }
  if (board.includes("tasks master") || board.includes("[meet] action points") || board.includes("launch planning")) {
    return { target: "Taken", reason: "Item beschrijft een uitvoerbare actie of actiepunt." };
  }
  if (board.includes("campaign master")) {
    return { target: "Taken", reason: "De rijen zijn concrete kanaalacties; later kunnen ze aan campagneprojecten worden gekoppeld." };
  }
  if (board.includes("operations master")) {
    return isSubitem || board.includes("subitems")
      ? { target: "Taken", reason: "Onderliggend operationeel item is een projecttaak." }
      : { target: "Projecten", reason: "Operationeel hoofditem vertegenwoordigt een groter initiatief." };
  }
  if (board.includes("activations master")) {
    return { target: "Projecten", reason: "Activatie heeft een eigen levenscyclus en wordt voorlopig als project beheerd." };
  }
  if (board.includes("event master")) {
    return isSubitem || board.includes("subitems")
      ? { target: "Taken", reason: "Event-subitem is een uitvoerbare taak binnen een eventproject." }
      : { target: "Projecten", reason: "Tot de Events-module bestaat, wordt elk event als project beheerd." };
  }
  if (board.includes("merch pipeline") && (/finaliseer|marketing|test je|launchdatum/.test(item) || group.includes("lancering nieuwe reeks merch"))) {
    return { target: "Taken", reason: "Dit merch-item is geformuleerd als uitvoerbare actie." };
  }
  return { target: "Overige", reason: `Bewaren buiten de MVP; voorgestelde latere module: ${futureModule(boardName)}.` };
};

const genericItem = (name) => /^item\s*\d+$/i.test(clean(name)) || clean(name) === "1";
const obviousDemoPatterns = [
  /brighttech|playforge|edufund|medianova|shopsquare/i,
  /eurolan 2026|global gaming expo|streamfest|charity run 2026|innovatecon/i,
  /monthly wellness blog digest|future fitness trends panel|sneak peek: new app features|quick tips for home workouts/i,
  /design homepage layout|qa testing for mobile app|implement user authentication|prepare annual budget report/i,
  /social media campagne q3|jaarlijks bedrijfsevenement|duurzaamheidsstrategie|klantenretentie verbeterplan|nieuwe website launch/i,
  /facebook live charity event|plan june product launch stream|weekly twitch community q&a|final edit for may livestream highlights/i,
  /lara de vries|omar rahmani|sanne koopman|kevin janssens|noor bakker|pieter meijer/i,
  /spring summit 2026|lente launch|codeforge|cloudnova|community hacknight/i,
];

const importAdvice = ({ boardName, itemName, groupName, target }) => {
  const board = lower(boardName);
  const item = clean(itemName);
  const group = lower(groupName);
  if (genericItem(item)) return { advice: "Overslaan als demo/leeg", confidence: "Hoog", note: "Generieke placeholdernaam zonder betekenisvolle inhoud." };
  if (obviousDemoPatterns.some((pattern) => pattern.test(item))) return { advice: "Overslaan als demo", confidence: "Hoog", note: "Herkenbare monday-voorbeelddata of fictieve namen." };
  if (/incoming form answer/i.test(item)) return { advice: "Controle nodig", confidence: "Laag", note: "Formulieritem heeft geen herkenbare titel; controleer kolomwaarden v\u00f3\u00f3r import." };
  if (board.includes("februari 2025") || board.includes("maart 2025") || board.includes("april 2025") || board.includes("mei 2025")) return { advice: "Alleen historiek", confidence: "Middel", note: "Oud archiefbord; bewaren als historisch spoor." };
  if (/^doc updates?$/i.test(item)) return { advice: "Alleen historiek", confidence: "Middel", note: "Historische documentupdate zonder verdere duiding." };
  if (group.includes("gepubliceerd") || group.includes("afgerond") || group.includes("completed") || group.includes("gearchiveerd") || group.includes("inactief")) return { advice: "Importeren als historiek", confidence: "Hoog", note: "Betekenisvol afgewerkt of historisch item." };
  if (target === "Overige") return { advice: "Bewaren voor latere module", confidence: "Hoog", note: "Niet in MVP importeren, wel volledig bewaren met voorgestelde module." };
  return { advice: "Importeren in MVP", confidence: "Hoog", note: "Betekenisvol item dat in de huidige MVP past." };
};

const normalizeValue = (value) => {
  if (value == null) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (Array.isArray(value)) return value.map((entry) => entry?.name ?? entry?.text ?? JSON.stringify(entry)).join("; ");
  return JSON.stringify(value);
};

const extractColumns = (board, item) => {
  const titles = new Map((board?.columns ?? []).map((column) => [column.id, column.title]));
  return Object.fromEntries((item.column_values ?? []).map((value) => {
    const resolved = value.linked_items?.length ? value.linked_items : (value.display_value ?? value.text ?? value.value);
    return [titles.get(value.id) ?? value.id, normalizeValue(resolved)];
  }));
};

const records = [];
const seen = new Set();
for (const entry of Object.values(source.board_items)) {
  const board = boardMap.get(String(entry.board_id));
  for (const item of entry.items ?? []) {
    if (!seen.has(String(item.id))) {
      seen.add(String(item.id));
      const mapped = classify(entry.board_name, item.name, item.group?.title, false);
      const advice = importAdvice({ boardName: entry.board_name, itemName: item.name, groupName: item.group?.title, target: mapped.target, createdAt: item.created_at });
      records.push({
        workspace: entry.workspace_name, boardId: String(entry.board_id), boardName: clean(entry.board_name), boardState: board?.state ?? "",
        itemId: String(item.id), itemName: clean(item.name), itemState: item.state ?? "", group: clean(item.group?.title), sourceKind: "Item",
        createdAt: item.created_at ?? "", updatedAt: item.updated_at ?? "", target: mapped.target, futureModule: mapped.target === "Overige" ? futureModule(entry.board_name) : "",
        reason: mapped.reason, advice: advice.advice, confidence: advice.confidence, reviewNote: advice.note,
        linkedProjectHint: "", columnValues: JSON.stringify(extractColumns(board, item)), sourceUrl: item.url ?? "",
      });
    }
    for (const sub of item.subitems ?? []) {
      if (seen.has(String(sub.id))) continue;
      seen.add(String(sub.id));
      const mapped = classify(entry.board_name, sub.name, sub.group?.title, true);
      const advice = importAdvice({ boardName: entry.board_name, itemName: sub.name, groupName: sub.group?.title, target: mapped.target, createdAt: sub.created_at });
      records.push({
        workspace: entry.workspace_name, boardId: String(entry.board_id), boardName: clean(entry.board_name), boardState: board?.state ?? "",
        itemId: String(sub.id), itemName: clean(sub.name), itemState: sub.state ?? "", group: clean(sub.group?.title), sourceKind: "Ingebed subitem",
        createdAt: sub.created_at ?? "", updatedAt: sub.updated_at ?? "", target: mapped.target, futureModule: mapped.target === "Overige" ? futureModule(entry.board_name) : "",
        reason: mapped.reason, advice: advice.advice, confidence: advice.confidence, reviewNote: advice.note,
        linkedProjectHint: clean(item.name), columnValues: JSON.stringify(extractColumns(board, sub)), sourceUrl: sub.url ?? "",
      });
    }
  }
}

const boardDecisions = source.boards.map((board) => {
  const readable = records.filter((record) => record.boardId === String(board.id));
  const targets = [...new Set(readable.map((record) => record.target))];
  return {
    workspace: board.workspace_name, boardId: String(board.id), boardName: clean(board.name), state: board.state,
    mondayCount: board.items_count ?? 0, readableCount: readable.length, targets: targets.join("; ") || "Geen uitleesbare items",
    futureModule: futureModule(board.name),
    decision: board.state === "deleted" ? "Herstellen indien inhoud nodig is" : board.state === "archived" ? "Historische bron" : readable.length ? "Volgens itemclassificatie verwerken" : "Geen actie / leeg",
    note: board.state === "deleted" || board.state === "archived" ? "monday geeft momenteel geen volledige iteminhoud terug; bordmetadata blijft bewaard." : "",
    url: board.url ?? "",
  };
});

const unavailableBoards = source.boards.filter((board) => board.state !== "active" && (board.items_count ?? 0) > 0).map((board) => [
  board.workspace_name, String(board.id), clean(board.name), board.state, board.items_count ?? 0, futureModule(board.name),
  board.state === "deleted" ? "Herstel het bord in monday om de items alsnog uit te lezen." : "Maak het bord tijdelijk actief om de items alsnog uit te lezen.", board.url ?? "",
]);

const targetOrder = ["Home", "Inbox", "Taken", "Projecten", "Overige"];
const targetCounts = targetOrder.map((target) => [target, records.filter((record) => record.target === target).length]);
const adviceValues = [...new Set(records.map((record) => record.advice))].sort();
const adviceCounts = adviceValues.map((advice) => [advice, records.filter((record) => record.advice === advice).length]);
const moduleValues = [...new Set(records.filter((record) => record.target === "Overige").map((record) => record.futureModule))].sort();
const moduleCounts = moduleValues.map((module) => [module, records.filter((record) => record.futureModule === module).length]);

const wb = Workbook.create();
const summary = wb.worksheets.add("Samenvatting");
const migration = wb.worksheets.add("Migratie-items");
const boards = wb.worksheets.add("Bordbeslissingen");
const other = wb.worksheets.add("Overige roadmap");
const unavailable = wb.worksheets.add("Niet uitleesbare borden");
const legend = wb.worksheets.add("Uitleg");

const purple = "#342F74", orange = "#EF7F3B", palePurple = "#F4F1FF", paleOrange = "#FFF3E8", green = "#E8F5E9", red = "#FDECEC", grid = "#D9DDE7";
const headerStyle = { fill: orange, font: { bold: true, color: "#FFFFFF" }, borders: { preset: "outside", style: "thin", color: grid } };
const titleStyle = { fill: purple, font: { bold: true, color: "#FFFFFF", size: 18 } };
const setup = (sheet, headers, rows, tableName, widths = {}) => {
  sheet.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
  sheet.getRangeByIndexes(0, 0, 1, headers.length).format = headerStyle;
  if (rows.length) sheet.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
  const used = sheet.getRangeByIndexes(0, 0, Math.max(rows.length + 1, 1), headers.length);
  used.format.wrapText = true;
  used.format.borders = { insideHorizontal: { style: "thin", color: grid } };
  used.format.autofitColumns();
  for (const [column, width] of Object.entries(widths)) sheet.getRange(`${column}:${column}`).format.columnWidth = width;
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = false;
  if (rows.length) sheet.tables.add(`A1:${columnName(headers.length)}${rows.length + 1}`, true, tableName);
};
const columnName = (number) => {
  let result = "", current = number;
  while (current > 0) { current -= 1; result = String.fromCharCode(65 + (current % 26)) + result; current = Math.floor(current / 26); }
  return result;
};

summary.getRange("A1:H2").merge();
summary.getRange("A1").values = [["BESC monday.com - migratieclassificatie"]];
summary.getRange("A1:H2").format = titleStyle;
summary.getRange("A4:B10").values = [
  ["Kengetal", "Resultaat"], ["Unieke leesbare records", records.length], ["Home", targetCounts.find((row) => row[0] === "Home")[1]],
  ["Inbox", targetCounts.find((row) => row[0] === "Inbox")[1]], ["Taken", targetCounts.find((row) => row[0] === "Taken")[1]],
  ["Projecten", targetCounts.find((row) => row[0] === "Projecten")[1]], ["Overige", targetCounts.find((row) => row[0] === "Overige")[1]],
];
summary.getRange("A4:B4").format = headerStyle;
summary.getRange("D4:H9").merge();
summary.getRange("D4").values = [["Home ontvangt geen rechtstreekse monday-items: Home is een afgeleid dashboard bovenop Inbox, Taken en Projecten. Alle niet-MVP-data blijft behouden onder Overige en krijgt een voorgestelde toekomstige module. Er is nog niets naar Supabase geschreven."]];
summary.getRange("D4:H9").format = { fill: palePurple, font: { color: purple, bold: true }, wrapText: true, borders: { preset: "outside", style: "thin", color: grid } };
summary.getRange("A13:B13").values = [["Importadvies", "Records"]]; summary.getRange("A13:B13").format = headerStyle;
summary.getRangeByIndexes(13, 0, adviceCounts.length, 2).values = adviceCounts;
summary.getRange("D13:E13").values = [["Latere module voor Overige", "Records"]]; summary.getRange("D13:E13").format = headerStyle;
summary.getRangeByIndexes(13, 3, moduleCounts.length, 2).values = moduleCounts;
summary.getRange("A:B").format.columnWidth = 29; summary.getRange("D:D").format.columnWidth = 36; summary.getRange("E:E").format.columnWidth = 14;
summary.showGridLines = false;

const migrationRows = records.map((record) => [
  record.workspace, record.boardId, record.boardName, record.boardState, record.itemId, record.itemName, record.group, record.sourceKind,
  record.createdAt, record.updatedAt, record.target, record.futureModule, record.advice, record.confidence, record.reason, record.reviewNote,
  record.linkedProjectHint, record.columnValues, record.sourceUrl,
]);
setup(migration, ["Workspace", "Board ID", "Bord", "Bordstatus", "Item ID", "Item", "Groep", "Brontype", "Aangemaakt", "Bijgewerkt", "MVP-doel", "Latere module", "Importadvies", "Zekerheid", "Reden toewijzing", "Controle-opmerking", "Bovenliggend project (hint)", "Kolomwaarden (JSON)", "monday URL"], migrationRows, "MigrationItemsTable", { C: 30, F: 42, G: 24, K: 15, L: 28, M: 25, O: 48, P: 45, Q: 34, R: 70, S: 48 });
migration.getRange(`I2:J${migrationRows.length + 1}`).format.numberFormat = "yyyy-mm-dd hh:mm";
migration.getRange(`K2:K${migrationRows.length + 1}`).dataValidation = { rule: { type: "list", values: ["Home", "Inbox", "Taken", "Projecten", "Overige"] } };
migration.getRange(`M2:M${migrationRows.length + 1}`).dataValidation = { rule: { type: "list", values: ["Importeren in MVP", "Importeren als historiek", "Alleen historiek", "Bewaren voor latere module", "Overslaan als demo", "Overslaan als demo/leeg", "Controle nodig"] } };
migration.getRange(`K2:K${migrationRows.length + 1}`).conditionalFormats.add("containsText", { text: "Overige", format: { fill: paleOrange, font: { color: "#7C3E0B" } } });
migration.getRange(`M2:M${migrationRows.length + 1}`).conditionalFormats.add("containsText", { text: "Overslaan", format: { fill: red, font: { color: "#8A1C1C" } } });
migration.getRange(`M2:M${migrationRows.length + 1}`).conditionalFormats.add("containsText", { text: "Importeren", format: { fill: green, font: { color: "#1B5E20" } } });

const boardRows = boardDecisions.map((board) => [board.workspace, board.boardId, board.boardName, board.state, board.mondayCount, board.readableCount, board.targets, board.futureModule, board.decision, board.note, board.url]);
setup(boards, ["Workspace", "Board ID", "Bord", "State", "monday itemteller", "Uitleesbare records", "Doelcategorie\u00ebn", "Voorgestelde module", "Beslissing", "Opmerking", "URL"], boardRows, "BoardDecisionsTable", { C: 36, G: 27, H: 30, I: 36, J: 55, K: 48 });

setup(other, ["Voorgestelde latere module", "Aantal records", "Aanbevolen moment", "Waarom apart"], moduleCounts.map(([module, count]) => [module, count, module === "Content Studio" || module === "Social, marketing & campagnes" ? "Volgende functionele ronde" : "Na stabiele MVP en monday-import", "De data past niet semantisch in Inbox, Taken of Projecten en verdient eigen velden/workflows."]), "OtherRoadmapTable", { A: 36, C: 34, D: 70 });
setup(unavailable, ["Workspace", "Board ID", "Bord", "State", "monday itemteller", "Voorgestelde module", "Vereiste actie", "URL"], unavailableBoards, "UnavailableBoardsTable", { C: 40, F: 30, G: 60, H: 48 });

legend.getRange("A1:F2").merge(); legend.getRange("A1").values = [["Leeswijzer en migratieregels"]]; legend.getRange("A1:F2").format = titleStyle;
legend.getRange("A4:B11").values = [
  ["Veld", "Betekenis"], ["MVP-doel", "Bestemming in de huidige Command Center-scope."], ["Home", "Geen opslagcategorie; dashboard wordt opgebouwd uit andere modules."],
  ["Overige", "Veilige tijdelijke categorie voor data buiten de MVP."], ["Importadvies", "Bepaalt of het record later in een dry-run wordt meegenomen."],
  ["Zekerheid", "Hoe betrouwbaar de automatische classificatie is."], ["Bovenliggend project (hint)", "Naam van het parent-item bij ingebedde subitems."],
  ["Kolomwaarden (JSON)", "Volledige uitleesbare monday-velden, bewaard voor latere veldmapping."],
];
legend.getRange("A4:B4").format = headerStyle; legend.getRange("A:B").format.columnWidth = 58; legend.getRange("A4:B11").format.wrapText = true; legend.showGridLines = false;

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(`${outputDir}/monday-migration-classification.json`, JSON.stringify({ generatedAt: new Date().toISOString(), records, boardDecisions }, null, 2));
const preview = await wb.render({ sheetName: "Samenvatting", range: `A1:H${Math.max(22, 14 + Math.max(adviceCounts.length, moduleCounts.length))}`, scale: 1.4, format: "png" });
await fs.writeFile(`${outputDir}/monday-migratieclassificatie-preview.png`, new Uint8Array(await preview.arrayBuffer()));
for (const [sheetName, range] of [
  ["Migratie-items", "A1:S22"], ["Bordbeslissingen", "A1:K22"], ["Overige roadmap", `A1:D${moduleCounts.length + 1}`],
  ["Niet uitleesbare borden", "A1:H22"], ["Uitleg", "A1:F11"],
]) {
  const sheetPreview = await wb.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(`${outputDir}/qa-${sheetName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`, new Uint8Array(await sheetPreview.arrayBuffer()));
}
const file = await SpreadsheetFile.exportXlsx(wb);
await file.save(`${outputDir}/BESC-monday-migratieclassificatie-2026-07-15.xlsx`);

console.log((await wb.inspect({ kind: "table", range: "Samenvatting!A1:H25", include: "values,formulas", tableMaxRows: 30, tableMaxCols: 10 })).ndjson);
console.log((await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 200 }, summary: "final formula error scan" })).ndjson);
console.log(JSON.stringify({ records: records.length, targetCounts: Object.fromEntries(targetCounts), adviceCounts: Object.fromEntries(adviceCounts), unavailableBoards: unavailableBoards.length }));
