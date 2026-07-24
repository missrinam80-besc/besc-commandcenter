import fs from "node:fs/promises";

const envText=await fs.readFile("../../.env.local","utf8");
const env=Object.fromEntries(envText.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith("#")&&line.includes("=")).map(line=>{const i=line.indexOf("=");return[line.slice(0,i),line.slice(i+1).replace(/^['\"]|['\"]$/g,"")]}));
if(!env.MONDAY_API_TOKEN)throw new Error("MONDAY_API_TOKEN ontbreekt in .env.local");

async function monday(query,variables={},attempt=1){
  try{
    const response=await fetch("https://api.monday.com/v2",{method:"POST",headers:{Authorization:env.MONDAY_API_TOKEN,"Content-Type":"application/json","API-Version":"2026-07"},body:JSON.stringify({query,variables})});
    const json=await response.json();
    if(!response.ok||json.errors)throw new Error(JSON.stringify({status:response.status,errors:json.errors}));
    return json.data;
  }catch(error){
    if(attempt>=4)throw error;
    await new Promise(resolve=>setTimeout(resolve,750*attempt));
    return monday(query,variables,attempt+1);
  }
}

const discovery=JSON.parse(await fs.readFile("../output/monday-workspace-discovery.json","utf8"));
const boards=discovery.targets.flatMap(workspace=>workspace.boards.map(board=>({...board,workspace_name:workspace.name})));
const nonEmptyBoards=boards.filter(board=>(board.items_count??0)>0);
const itemQuery=`query BoardItems($boardId:ID!,$cursor:String){
  boards(ids:[$boardId]){
    id name
    items_page(limit:100,cursor:$cursor){
      cursor
      items{
        id name url state created_at updated_at
        group{id title}
        creator{id name email}
        column_values{
          id type text value
          ... on FormulaValue{display_value}
          ... on BoardRelationValue{linked_items{id name board{id name}}}
        }
        subitems{
          id name url state created_at updated_at
          group{id title}
          creator{id name email}
          column_values{
            id type text value
            ... on FormulaValue{display_value}
            ... on BoardRelationValue{linked_items{id name board{id name}}}
          }
        }
      }
    }
  }
}`;

const inventory={generated_at:new Date().toISOString(),api_version:"2026-07",workspaces:discovery.targets.map(({id,name,description,kind,state})=>({id,name,description,kind,state})),boards,board_items:{},errors:[]};
let completed=0;

async function exportBoard(board){
  const items=[];
  let cursor=null;
  do{
    const data=await monday(itemQuery,{boardId:board.id,cursor});
    const page=data.boards?.[0]?.items_page;
    if(!page)break;
    items.push(...page.items);
    cursor=page.cursor||null;
  }while(cursor);
  inventory.board_items[board.id]={board_id:board.id,board_name:board.name,workspace_name:board.workspace_name,items};
  completed++;
  console.log(`[${completed}/${nonEmptyBoards.length}] ${board.workspace_name} / ${board.name}: ${items.length} items`);
}

for(let index=0;index<nonEmptyBoards.length;index+=3){
  const batch=nonEmptyBoards.slice(index,index+3);
  const results=await Promise.allSettled(batch.map(exportBoard));
  results.forEach((result,i)=>{if(result.status==="rejected"){const board=batch[i];inventory.errors.push({board_id:board.id,board_name:board.name,error:String(result.reason)});completed++;console.log(`[${completed}/${nonEmptyBoards.length}] FOUT ${board.workspace_name} / ${board.name}`);}});
  await fs.writeFile("../output/monday-full-inventory.checkpoint.json",JSON.stringify(inventory,null,2),"utf8");
}

const uniqueItems=new Set();
let rows=0,subitems=0,relations=0;
for(const board of Object.values(inventory.board_items))for(const item of board.items){rows++;uniqueItems.add(item.id);subitems+=item.subitems?.length||0;for(const value of item.column_values||[])if(value.linked_items?.length)relations+=value.linked_items.length;}
inventory.summary={workspace_count:inventory.workspaces.length,board_count:boards.length,non_empty_board_count:nonEmptyBoards.length,board_rows:rows,unique_item_count:uniqueItems.size,embedded_subitem_count:subitems,board_relation_links:relations,error_count:inventory.errors.length};
await fs.writeFile("../output/monday-full-inventory.json",JSON.stringify(inventory,null,2),"utf8");
console.log(JSON.stringify(inventory.summary,null,2));
