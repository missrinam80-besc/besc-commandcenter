import fs from "node:fs/promises";

const envText=await fs.readFile("../../.env.local","utf8");
const env=Object.fromEntries(envText.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith("#")&&line.includes("=")).map(line=>{const i=line.indexOf("=");return[line.slice(0,i),line.slice(i+1).replace(/^['\"]|['\"]$/g,"")]}));
if(!env.MONDAY_API_TOKEN)throw new Error("MONDAY_API_TOKEN ontbreekt in .env.local");

async function monday(query,variables={}){
  const response=await fetch("https://api.monday.com/v2",{method:"POST",headers:{Authorization:env.MONDAY_API_TOKEN,"Content-Type":"application/json","API-Version":"2026-07"},body:JSON.stringify({query,variables})});
  const json=await response.json();
  if(!response.ok||json.errors)throw new Error(JSON.stringify({status:response.status,errors:json.errors}));
  return json.data;
}

const workspaceData=await monday(`query { workspaces(limit: 500, page: 1) { id name description kind state is_default_workspace } }`);
const targets=workspaceData.workspaces.filter(w=>["besc hq","besc archive"].includes(w.name.trim().toLowerCase()));
const result={searched:["BESC HQ","BESC ARCHIVE"],availableWorkspaces:workspaceData.workspaces.map(({id,name,kind,state})=>({id,name,kind,state})),targets:[]};
for(const workspace of targets){
  const boards=[];
  for(let page=1;;page++){
    const data=await monday(`query WorkspaceBoards($ids:[ID!],$page:Int!) { boards(workspace_ids:$ids,limit:100,page:$page,state:all,order_by:created_at) { id name description state board_kind workspace_id board_folder_id created_at updated_at items_count hierarchy_type url groups { id title archived deleted position } columns(capabilities:[null,CALCULATED]) { id title type } } }`,{ids:[workspace.id],page});
    boards.push(...data.boards);
    if(data.boards.length<100)break;
  }
  result.targets.push({...workspace,boards});
}
await fs.mkdir("../output",{recursive:true});
await fs.writeFile("../output/monday-workspace-discovery.json",JSON.stringify(result,null,2),"utf8");
console.log(JSON.stringify({targets:result.targets.map(w=>({id:w.id,name:w.name,boardCount:w.boards.length,active:w.boards.filter(b=>b.state==="active").length,archived:w.boards.filter(b=>b.state==="archived").length,items:w.boards.reduce((sum,b)=>sum+(b.items_count||0),0)})),availableWorkspaceNames:result.availableWorkspaces.map(w=>w.name)},null,2));
