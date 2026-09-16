import fs from "node:fs/promises";
import {SpreadsheetFile,Workbook} from "@oai/artifact-tool";

const source=JSON.parse(await fs.readFile("../output/monday-full-inventory.json","utf8"));
const out="../output";
const classification=name=>{
  const n=name.toLowerCase();
  if(n.includes("subitems"))return"Subtaken / onderliggende items";
  if(n.includes("[ops]")||n.includes("operations")||n.includes("tasks master"))return"Core: projecten en taken";
  if(n.includes("[intake]")||n.includes("intake")||n.includes("backlog"))return"Inbox en intake";
  if(n.includes("[content]")||n.includes("content")||n.includes("blog")||n.includes("podcast")||n.includes("video")||n.includes("tutorial"))return"Content";
  if(n.includes("[mkt]")||n.includes("social")||n.includes("campaign")||n.includes("branding")||n.includes("marketing"))return"Marketing en campagnes";
  if(n.includes("[event]")||n.includes("event")||n.includes("besc games")||n.includes("streamathon"))return"Events";
  if(n.includes("[crm]")||n.includes("sponsor")||n.includes("partner")||n.includes("outreach"))return"Sponsors en CRM";
  if(n.includes("[people]")||n.includes("people")||n.includes("volunteer")||n.includes("crew")||n.includes("moderator"))return"Community en mensen";
  if(n.includes("[fin]")||n.includes("finance")||n.includes("legal")||n.includes("contract")||n.includes("subsid"))return"Financiën en administratie";
  if(n.includes("[meet]")||n.includes("meeting")||n.includes("notulen")||n.includes("verslag av")||n.includes("decisions"))return"Vergaderingen en besluiten";
  if(n.includes("[data]")||n.includes("analytics")||n.includes("kpi")||n.includes("metricool"))return"Analytics en rapportage";
  if(n.includes("[comms]")||n.includes("newsletter")||n.includes("press")||n.includes("announcement"))return"Communicatie";
  if(n.includes("[stream]")||n.includes("livestream")||n.includes("obs")||n.includes("broadcast"))return"Streams";
  if(n.includes("[shop]")||n.includes("shop")||n.includes("merch"))return"Shop en merchandise";
  if(n.includes("[edu]")||n.includes("workshop")||n.includes("speaker"))return"Academy en kennis";
  if(n.includes("[act]")||n.includes("activat"))return"Activaties";
  return"Te beoordelen";
};
const recommendation=board=>board.state==="deleted"?"Herstel in monday nodig of alleen bordmetadata bewaren":board.state==="archived"?"Als historische bron migreren":board.name.toLowerCase().includes("subitems")?"Niet apart importeren; aan bovenliggend item koppelen":"Inhoud beoordelen en mappen";
const normalize=value=>{
  if(value==null)return"";
  if(typeof value==="string"||typeof value==="number"||typeof value==="boolean")return String(value);
  if(Array.isArray(value))return value.map(v=>v?.name??v?.text??String(v)).join("; ");
  return JSON.stringify(value);
};
const boardMap=new Map(source.boards.map(b=>[String(b.id),b]));
const boardRows=source.boards.map(b=>[b.workspace_name,b.id,b.name,b.state,b.board_kind,b.items_count??0,b.groups?.length??0,b.columns?.length??0,b.created_at??"",b.updated_at??"",classification(b.name),recommendation(b),b.url??""]);
const itemRows=[],subitemRows=[];
for(const entry of Object.values(source.board_items)){
  const board=boardMap.get(String(entry.board_id));
  const colTitles=new Map((board?.columns??[]).map(c=>[c.id,c.title]));
  for(const item of entry.items){
    const values=Object.fromEntries((item.column_values??[]).map(v=>[colTitles.get(v.id)??v.id,normalize(v.linked_items?.length?v.linked_items:(v.display_value??v.text??v.value))]));
    const linked=(item.column_values??[]).flatMap(v=>v.linked_items??[]).map(x=>`${x.board?.name??"Bord"}: ${x.name} (${x.id})`).join("; ");
    itemRows.push([entry.workspace_name,entry.board_id,entry.board_name,item.id,item.name,item.state??"",item.group?.title??"",item.creator?.name??"",item.created_at??"",item.updated_at??"",classification(entry.board_name),linked,JSON.stringify(values),item.url??""]);
    for(const sub of item.subitems??[]){
      const subValues=Object.fromEntries((sub.column_values??[]).map(v=>[v.id,normalize(v.linked_items?.length?v.linked_items:(v.display_value??v.text??v.value))]));
      subitemRows.push([entry.workspace_name,entry.board_id,entry.board_name,item.id,item.name,sub.id,sub.name,sub.state??"",sub.group?.title??"",sub.created_at??"",sub.updated_at??"",JSON.stringify(subValues),sub.url??""]);
    }
  }
}
const columnRows=source.boards.flatMap(b=>(b.columns??[]).map(c=>[b.workspace_name,b.id,b.name,c.id,c.title,c.type,classification(b.name)]));
const duplicateNames=new Map();for(const b of source.boards)duplicateNames.set(b.name.toLowerCase(),(duplicateNames.get(b.name.toLowerCase())??0)+1);
const duplicateRows=source.boards.filter(b=>(duplicateNames.get(b.name.toLowerCase())??0)>1).map(b=>[b.workspace_name,b.id,b.name,b.state,b.items_count??0,classification(b.name),recommendation(b)]);

const wb=Workbook.create();
const summary=wb.worksheets.add("Samenvatting"),workspaces=wb.worksheets.add("Workspaces"),boards=wb.worksheets.add("Borden"),items=wb.worksheets.add("Items"),subs=wb.worksheets.add("Subitems"),cols=wb.worksheets.add("Kolommen"),dupes=wb.worksheets.add("Dubbele bordnamen");
const purple="#342F74",orange="#EF7F3B",grid="#E5E7EB";
const header={fill:orange,font:{bold:true,color:"#FFFFFF"},borders:{preset:"outside",style:"thin",color:grid}};
const setup=(sheet,headers,rows,tableName,widths={})=>{sheet.getRangeByIndexes(0,0,1,headers.length).values=[headers];sheet.getRangeByIndexes(0,0,1,headers.length).format=header;if(rows.length)sheet.getRangeByIndexes(1,0,rows.length,headers.length).values=rows;const used=sheet.getRangeByIndexes(0,0,Math.max(rows.length+1,1),headers.length);used.format.wrapText=true;used.format.borders={insideHorizontal:{style:"thin",color:grid}};used.format.autofitColumns();for(const[col,width]of Object.entries(widths))sheet.getRange(`${col}:${col}`).format.columnWidth=width;sheet.freezePanes.freezeRows(1);sheet.showGridLines=false;if(rows.length)sheet.tables.add(`A1:${String.fromCharCode(64+headers.length)}${rows.length+1}`,true,tableName);};

summary.getRange("A1:H2").merge();summary.getRange("A1").values=[["BESC monday.com — volledige inventarisatie"]];summary.getRange("A1:H2").format={fill:purple,font:{bold:true,color:"#FFFFFF",size:18}};
summary.getRange("A4:B12").values=[["Kengetal","Resultaat"],["Workspaces",source.summary.workspace_count],["Borden",source.summary.board_count],["Actieve borden",source.boards.filter(b=>b.state==="active").length],["Gearchiveerde borden",source.boards.filter(b=>b.state==="archived").length],["Verwijderde borden",source.boards.filter(b=>b.state==="deleted").length],["Uitleesbare items",source.summary.unique_item_count],["Ingebedde subitems",source.summary.embedded_subitem_count],["Bordrelaties",source.summary.board_relation_links]];summary.getRange("A4:B4").format=header;
summary.getRange("D4:H8").merge();summary.getRange("D4").values=[["Migratierisico: 86 verwijderde borden verwijzen samen naar 843 items en 9 gearchiveerde borden naar 6 items. monday retourneert de iteminhoud daarvan niet via de normale API. Herstel relevante borden eerst in monday als die inhoud absoluut mee moet."]];summary.getRange("D4:H8").format={fill:"#FFF3E8",font:{color:"#7C3E0B",bold:true},wrapText:true};
const classCounts=[...new Set(source.boards.map(b=>classification(b.name)))].sort().map(c=>[c,source.boards.filter(b=>classification(b.name)===c).length,source.boards.filter(b=>classification(b.name)===c).reduce((s,b)=>s+(b.items_count??0),0)]);
summary.getRange("A15:C15").values=[["Voorgestelde module","Borden","monday-itemteller"]];summary.getRange("A15:C15").format=header;summary.getRangeByIndexes(15,0,classCounts.length,3).values=classCounts;summary.getRange("A:C").format.columnWidth=28;summary.getRange("D:H").format.columnWidth=16;summary.showGridLines=false;

setup(workspaces,["Workspace ID","Naam","Soort","State"],source.workspaces.map(w=>[w.id,w.name,w.kind??"",w.state??""]),"WorkspacesTable",{B:28});
setup(boards,["Workspace","Board ID","Bord","State","Soort","monday items","Groepen","Kolommen","Aangemaakt","Bijgewerkt","Voorgestelde module","Migratieadvies","URL"],boardRows,"BoardsTable",{C:34,K:32,L:48,M:48});
setup(items,["Workspace","Board ID","Bord","Item ID","Item","State","Groep","Maker","Aangemaakt","Bijgewerkt","Module","Relaties","Kolomwaarden (JSON)","URL"],itemRows,"ItemsTable",{C:30,E:34,L:45,M:65,N:48});
setup(subs,["Workspace","Parent board ID","Parent bord","Parent item ID","Parent item","Subitem ID","Subitem","State","Groep","Aangemaakt","Bijgewerkt","Kolomwaarden (JSON)","URL"],subitemRows,"SubitemsTable",{C:30,E:30,G:34,L:60,M:48});
setup(cols,["Workspace","Board ID","Bord","Column ID","Kolomtitel","Type","Module"],columnRows,"ColumnsTable",{C:32,D:34,E:32,G:30});
setup(dupes,["Workspace","Board ID","Bordnaam","State","Items","Module","Advies"],duplicateRows,"DuplicatesTable",{C:38,F:30,G:50});

await fs.mkdir(out,{recursive:true});
const preview=await wb.render({sheetName:"Samenvatting",range:`A1:H${16+classCounts.length}`,scale:1.4,format:"png"});await fs.writeFile(`${out}/monday-volledige-inventaris-preview.png`,new Uint8Array(await preview.arrayBuffer()));
const file=await SpreadsheetFile.exportXlsx(wb);await file.save(`${out}/BESC-monday-volledige-inventarisatie-2026-07-15.xlsx`);
console.log((await wb.inspect({kind:"table",range:"Samenvatting!A1:H25",include:"values,formulas",tableMaxRows:30,tableMaxCols:10})).ndjson);
console.log((await wb.inspect({kind:"match",searchTerm:"#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",options:{useRegex:true,maxResults:200},summary:"formula error scan"})).ndjson);
