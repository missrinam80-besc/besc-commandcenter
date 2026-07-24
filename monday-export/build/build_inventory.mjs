import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir="../output";
await fs.mkdir(outputDir,{recursive:true});

const boards=[
  ["5042117","CRM","5033122201","Quotes & Invoices","active","public",0,1,8,"2025-10-08T09:01:24Z","2025-10-08T09:01:25Z","Niet migreren","Leeg standaard CRM-bord"],
  ["5042117","CRM","5033076200","Subitems van Activiteiten","active","public",0,1,4,"2025-10-08T08:46:51Z","2025-10-08T08:46:51Z","Niet apart migreren","Technisch subitembord"],
  ["5042117","CRM","5033076074","Subitems van Deals","active","public",3,1,4,"2025-10-08T08:46:50Z","2025-10-08T08:47:04Z","Takenhistoriek","Migreren via gekoppelde deal/projecttaken"],
  ["5042117","CRM","5033075938","Contacten","active","public",2,2,7,"2025-10-08T08:46:46Z","2025-10-08T08:48:36Z","Contacten","Beoordelen als sponsor/partnercontact"],
  ["5042117","CRM","5033075937","Products & Services","active","public",0,1,5,"2025-10-08T08:46:46Z","2025-10-08T08:46:47Z","Niet migreren","Leeg standaard CRM-bord"],
  ["5042117","CRM","5033075933","Accounts","active","public",3,1,8,"2025-10-08T08:46:46Z","2025-10-08T08:47:04Z","Partners/organisaties","Waarschijnlijk CRM-testdata"],
  ["5042117","CRM","5033075928","Deals","active","public",4,2,11,"2025-10-08T08:46:46Z","2025-10-08T08:47:04Z","Projecten/campagnes","Waarschijnlijk CRM-voorbeelddata"],
  ["5042117","CRM","5033075927","Activiteiten","active","public",1,1,8,"2025-10-08T08:46:46Z","2025-10-08T08:46:59Z","Activiteitshistoriek","Waarschijnlijk CRM-voorbeelddata"],
  ["5042117","CRM","5033075926","Leads","active","public",2,1,8,"2025-10-08T08:46:46Z","2025-10-08T08:46:59Z","Inbox/CRM-leads","Waarschijnlijk CRM-voorbeelddata"],
];

const items=[
  ["5033076074","Subitems van Deals","5033076765","Contact opnemen met Matilde","Ermee bezig","","","","2025-10-08T08:47:01Z","2025-10-08T08:47:01Z","Taak","Koppelen aan Naam deal 1","https://belgianstreamerscommunity.monday.com/boards/5033076074/pulses/5033076765"],
  ["5033076074","Subitems van Deals","5033076772","Taak 2","Klaar","","","","2025-10-08T08:47:02Z","2025-10-08T08:47:01Z","Taak-historiek","Koppelen aan Naam deal 1","https://belgianstreamerscommunity.monday.com/boards/5033076074/pulses/5033076772"],
  ["5033076074","Subitems van Deals","5033076778","Taak 3","Klaar","","","","2025-10-08T08:47:02Z","2025-10-08T08:47:02Z","Taak-historiek","Koppelen aan Naam deal 1","https://belgianstreamerscommunity.monday.com/boards/5033076074/pulses/5033076778"],
  ["5033075938","Contacten","5033076681","Feline van Kleef","Klant","","Phoenix@email.com","13254785698","2025-10-08T08:46:59Z","2025-10-08T08:46:59Z","Contact","Relaties: HSBF, Pear inc, Naam deal 2","https://belgianstreamerscommunity.monday.com/boards/5033075938/pulses/5033076681"],
  ["5033075938","Contacten","5033076670","Matilde de Vries","Partner","","Madison@email.com","18547220499","2025-10-08T08:46:59Z","2025-10-08T08:46:59Z","Contact","Relaties: Bindeer Inc., Naam deal 1","https://belgianstreamerscommunity.monday.com/boards/5033075938/pulses/5033076670"],
  ["5033075933","Accounts","5033076683","Bindeer Inc.","Laag","Tech","","","2025-10-08T08:47:00Z","2025-10-08T08:47:00Z","Organisatie","Contact: Matilde de Vries","https://belgianstreamerscommunity.monday.com/boards/5033075933/pulses/5033076683"],
  ["5033075933","Accounts","5033076697","HSBF","Hoog","Tech","","","2025-10-08T08:47:00Z","2025-10-08T08:47:00Z","Organisatie","Contact: Feline van Kleef","https://belgianstreamerscommunity.monday.com/boards/5033075933/pulses/5033076697"],
  ["5033075933","Accounts","5033076707","Pear inc","Hoog","Tech","","","2025-10-08T08:47:00Z","2025-10-08T08:47:00Z","Organisatie","Contact: Feline van Kleef","https://belgianstreamerscommunity.monday.com/boards/5033075933/pulses/5033076707"],
  ["5033075928","Deals","5033076718","Naam deal 1","Lead","€70.000","","2021-09-30","2025-10-08T08:47:00Z","2025-10-08T08:47:00Z","Project/campagne","90%; verwacht €63.000; contact Matilde; 3 taken","https://belgianstreamerscommunity.monday.com/boards/5033075928/pulses/5033076718"],
  ["5033075928","Deals","5033076722","Naam deal 2","Voorstel","€122.000","","2021-09-01","2025-10-08T08:47:00Z","2025-10-08T08:47:00Z","Project/campagne","90%; verwacht €109.800; contact Feline","https://belgianstreamerscommunity.monday.com/boards/5033075928/pulses/5033076722"],
  ["5033075928","Deals","5033076732","Naam deal 3","Gewonnen","€55.000","","2024-02-08","2025-10-08T08:47:01Z","2025-10-08T08:47:01Z","Project-historiek","100%; verwacht €55.000","https://belgianstreamerscommunity.monday.com/boards/5033075928/pulses/5033076732"],
  ["5033075928","Deals","5033076743","Naam deal 4","Gewonnen","€30.000","","2023-12-29","2025-10-08T08:47:01Z","2025-10-08T08:47:01Z","Project-historiek","100%; verwacht €30.000","https://belgianstreamerscommunity.monday.com/boards/5033075928/pulses/5033076743"],
  ["5033075927","Activiteiten","5033076631","Dit is een activiteit","Klaar","Telefoongesprek","","2021-06-25 10:00","2025-10-08T08:46:58Z","2025-10-08T08:46:58Z","Activiteit-historiek","Geen gekoppeld item","https://belgianstreamerscommunity.monday.com/boards/5033075927/pulses/5033076631"],
  ["5033075926","Leads","5033076649","Eline Winter","Opvolgen","Agently BV","Elian@company.com","Operationeel directeur","2025-10-08T08:46:59Z","2025-10-08T08:46:59Z","Inbox/lead","Telefoon: 12027953213","https://belgianstreamerscommunity.monday.com/boards/5033075926/pulses/5033076649"],
  ["5033075926","Leads","5033076653","Nieuwe lead","Nieuwe lead","","","","2025-10-08T08:46:59Z","2025-10-08T08:46:59Z","Inbox/lead","Leeg voorbeelditem","https://belgianstreamerscommunity.monday.com/boards/5033075926/pulses/5033076653"],
];

const columns=[
 ["Quotes & Invoices","name","Name","name"],["Quotes & Invoices","type","Type","status"],["Quotes & Invoices","amount","Amount","numbers"],["Quotes & Invoices","bill_to","Recipient","board_relation"],["Quotes & Invoices","file","File","file"],["Quotes & Invoices","status","Status","status"],["Quotes & Invoices","issue_date","Issue date","date"],["Quotes & Invoices","creation_log__1","Owner","creation_log"],
 ["Subitems van Activiteiten","name","Name","name"],["Subitems van Activiteiten","person","Owner","people"],["Subitems van Activiteiten","status","Status","status"],["Subitems van Activiteiten","date0","Date","date"],
 ["Subitems van Deals","name","Naam","name"],["Subitems van Deals","person","Eigenaar","people"],["Subitems van Deals","status","Status","status"],["Subitems van Deals","date0","Datum","date"],
 ["Contacten","name","Naam","name"],["Contacten","status","Type","status"],["Contacten","contact_deal","Deals","board_relation"],["Contacten","contact_phone","Telefoon","phone"],["Contacten","contact_email","E-mail","email"],["Contacten","contact_account","Accounts","board_relation"],["Contacten","custom_mkneta3j","Activiteitentijdlijn","unsupported"],
 ["Products & Services","name","Name","name"],["Products & Services","product_and_service_description","Description","long_text"],["Products & Services","product_and_service_price","Price","numbers"],["Products & Services","product_and_service_sku","SKU","text"],["Products & Services","product_and_service_type","Type","status"],
 ["Accounts","name","Naam","name"],["Accounts","account_contact","Contacten","board_relation"],["Accounts","account_deal","Deals","mirror"],["Accounts","mirror24","Accountwaarde","mirror"],["Accounts","status5","Prioriteit","status"],["Accounts","industry","Branche","dropdown"],["Accounts","mirror6","E-mail","mirror"],["Accounts","custom_mkt2xrtp","Activiteitentijdlijn","unsupported"],
 ["Deals","name","Naam","name"],["Deals","subitems","Taken","subtasks"],["Deals","deal_stage","Fase","status"],["Deals","deal_owner","Eigenaar","people"],["Deals","deal_contact","Contacten","board_relation"],["Deals","deal_value","Dealwaarde","numbers"],["Deals","deal_close_probability","Waarschijnlijkheid van afsluiten","numbers"],["Deals","deal_forecast_value","Verwachte waarde","formula"],["Deals","deal_expected_close_date","Verwachte sluitingsdatum","date"],["Deals","custom_mknwtr4f","Offertes en facturen","unsupported"],["Deals","custom_mkt2n061","Activiteitentijdlijn","unsupported"],
 ["Activiteiten","name","Naam","name"],["Activiteiten","subitems","Subitems","subtasks"],["Activiteiten","activity_owner","Eigenaar","people"],["Activiteiten","activity_item","Item","board_relation"],["Activiteiten","activity_start_time","Begintijd","date"],["Activiteiten","activity_end_time","Eindtijd","date"],["Activiteiten","activity_status","Status","status"],["Activiteiten","activity_type","Type activiteit","status"],
 ["Leads","name","Naam","name"],["Leads","lead_status","Status","status"],["Leads","button","Een contact aanmaken","button"],["Leads","lead_email","E-mail","email"],["Leads","text","Titel","text"],["Leads","lead_company","Bedrijf","text"],["Leads","lead_phone","Telefoon","phone"],["Leads","custom_mkt2naw2","Activiteitentijdlijn","unsupported"],
];

const wb=Workbook.create();
const summary=wb.worksheets.add("Samenvatting");
const boardSheet=wb.worksheets.add("Borden");
const itemSheet=wb.worksheets.add("Items");
const colSheet=wb.worksheets.add("Kolommen");

const titleStyle={fill:"#342F74",font:{bold:true,color:"#FFFFFF",size:18}};
const headerStyle={fill:"#EF7F3B",font:{bold:true,color:"#FFFFFF"},borders:{preset:"outside",style:"thin",color:"#D9D9D9"}};
const noteStyle={fill:"#F4F1FF",font:{color:"#342F74"},wrapText:true};

summary.getRange("A1:H2").merge(); summary.getRange("A1").values=[["monday.com inventarisatie — BESC Command Center"]]; summary.getRange("A1:H2").format=titleStyle;
summary.getRange("A4:B9").values=[["Onderdeel","Resultaat"],["Zichtbare workspaces",1],["Workspace","CRM (ID 5042117)"],["Borden",9],["Unieke rijen/items",15],["Zichtbare BESC HQ-workspace","Nee"]];
summary.getRange("A4:B4").format=headerStyle; summary.getRange("A4:B9").format.borders={preset:"inside",style:"thin",color:"#E5E7EB"};
summary.getRange("D4:H8").merge(); summary.getRange("D4").values=[["Belangrijk: de connector geeft alleen de workspace CRM terug. De verwachte BESC HQ-borden (Operations, Taken, Projecten, Content, Events enz.) zijn niet zichtbaar. Deze export is daarom een volledige inventaris van wat de huidige connector kan zien, maar nog niet van de bedoelde BESC HQ-omgeving."]]; summary.getRange("D4:H8").format=noteStyle;
summary.getRange("A11:H11").values=[["Eerste analyse","Waarneming","Aanbeveling","","","","",""]]; summary.getRange("A11:H11").format=headerStyle;
summary.getRange("A12:H15").values=[
 ["Structuur","De zichtbare omgeving is een standaard monday CRM-template.","Niet rechtstreeks als BESC Command Center-structuur overnemen.","","","","",""],
 ["Data","Veel namen, e-mails, bedragen en datums ogen als voorbeelddata.","Voor import eerst per item bevestigen: echt, test of verwijderen.","","","","",""],
 ["Relaties","Accounts, Contacten en Deals zijn onderling verbonden.","Relaties behouden via stabiele monday item-ID's.","","","","",""],
 ["Historiek","Drie afgeronde subtaken en twee gewonnen deals zijn zichtbaar.","Als betekenisvolle historiek importeren als de data echt is.","","","","",""],
 ]; summary.getRange("A12:H15").format.wrapText=true;
summary.getRange("A:H").format.columnWidth=16; summary.getRange("A:A").format.columnWidth=24; summary.getRange("B:B").format.columnWidth=28; summary.getRange("C:C").format.columnWidth=38; summary.getRange("D:H").format.columnWidth=16; summary.getRange("A11:H15").format.autofitRows(); summary.showGridLines=false;

const boardHeaders=["Workspace ID","Workspace","Board ID","Bord","State","Soort","Items","Groepen","Kolommen","Aangemaakt","Bijgewerkt","Voorgestelde bestemming","Analyse"];
boardSheet.getRangeByIndexes(0,0,1,boardHeaders.length).values=[boardHeaders]; boardSheet.getRangeByIndexes(0,0,1,boardHeaders.length).format=headerStyle;
boardSheet.getRangeByIndexes(1,0,boards.length,boardHeaders.length).values=boards; boardSheet.getRange(`A1:M${boards.length+1}`).format.wrapText=true; boardSheet.getRange("A:M").format.autofitColumns(); boardSheet.getRange("D:D").format.columnWidth=24; boardSheet.getRange("M:M").format.columnWidth=34; boardSheet.freezePanes.freezeRows(1); boardSheet.showGridLines=false; boardSheet.tables.add(`A1:M${boards.length+1}`,true,"BoardsTable");

const itemHeaders=["Board ID","Bord","Item ID","Item","Status/type","Waarde/bedrijf","E-mail","Datum/titel","Aangemaakt","Bijgewerkt","Mapping","Relaties/notitie","monday URL"];
itemSheet.getRangeByIndexes(0,0,1,itemHeaders.length).values=[itemHeaders]; itemSheet.getRangeByIndexes(0,0,1,itemHeaders.length).format=headerStyle;
itemSheet.getRangeByIndexes(1,0,items.length,itemHeaders.length).values=items; itemSheet.getRange(`A1:M${items.length+1}`).format.wrapText=true; itemSheet.getRange("A:M").format.autofitColumns(); itemSheet.getRange("D:D").format.columnWidth=28; itemSheet.getRange("L:L").format.columnWidth=38; itemSheet.getRange("M:M").format.columnWidth=45; itemSheet.freezePanes.freezeRows(1); itemSheet.showGridLines=false; itemSheet.tables.add(`A1:M${items.length+1}`,true,"ItemsTable");

const colHeaders=["Bord","Column ID","Titel","Type"];
colSheet.getRange("A1:D1").values=[colHeaders]; colSheet.getRange("A1:D1").format=headerStyle; colSheet.getRangeByIndexes(1,0,columns.length,4).values=columns; colSheet.getRange("A:D").format.autofitColumns(); colSheet.getRange("A:A").format.columnWidth=28; colSheet.getRange("B:B").format.columnWidth=34; colSheet.freezePanes.freezeRows(1); colSheet.showGridLines=false; colSheet.tables.add(`A1:D${columns.length+1}`,true,"ColumnsTable");

for(const sheet of [boardSheet,itemSheet,colSheet]) sheet.getUsedRange().format.borders={insideHorizontal:{style:"thin",color:"#E5E7EB"}};

const preview=await wb.render({sheetName:"Samenvatting",range:"A1:H15",scale:1.5,format:"png"});
await fs.writeFile(`${outputDir}/monday-inventaris-preview.png`,new Uint8Array(await preview.arrayBuffer()));
const xlsx=await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(`${outputDir}/BESC-monday-inventarisatie-2026-07-13.xlsx`);

console.log((await wb.inspect({kind:"table",range:"Samenvatting!A1:H15",include:"values,formulas",tableMaxRows:20,tableMaxCols:10})).ndjson);
console.log((await wb.inspect({kind:"match",searchTerm:"#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",options:{useRegex:true,maxResults:100},summary:"formula error scan"})).ndjson);
