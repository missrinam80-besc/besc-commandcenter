"use client";
import {useState,useTransition,type FormEvent} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {Archive,MapPin,Pencil,Plus,Trash2,ExternalLink} from "lucide-react";
import {bulkAssetAction} from "@/app/app/materialen/actions";
import {assetStatuses,type AssetListRow} from "@/lib/asset-bulk";
const types:Record<string,string>={equipment:"Materiaal",computer:"Computer",streaming:"Streaming",furniture:"Meubilair",software:"Software/licentie",vehicle:"Voertuig",other:"Overige resource"};
export function MaterialsInventory({rows,canManage}:{rows:AssetListRow[];canManage:boolean}){
 const router=useRouter(),[selected,setSelected]=useState<string[]>([]),[pending,startTransition]=useTransition();
 const [showBulk,setShowBulk]=useState(false),[changeLocation,setChangeLocation]=useState(false),[changeStatus,setChangeStatus]=useState(false);
 const [location,setLocation]=useState(""),[status,setStatus]=useState<keyof typeof assetStatuses>("active"),[feedback,setFeedback]=useState<{ok:boolean;message:string}|null>(null);
 const chosen=rows.filter(row=>selected.includes(row.id)),ids=chosen.map(row=>row.id),count=ids.length;
 function toggle(id:string){setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);setFeedback(null);}
 function run(mode:"update"|"archive"|"delete"){
  if(pending||!count)return;
  if(mode!=="update"){
   const names=chosen.slice(0,10).map(row=>row.name).join("\n")+(count>10?`\n… en ${count-10} andere items`:"");
   if(!window.confirm(`${count} ${count===1?"item":"items"} ${mode==="archive"?"archiveren":"uit de operationele inventaris verwijderen"}?\n\n${names}`))return;
  }
  setFeedback(null);
  startTransition(async()=>{
   try{
    const result=await bulkAssetAction({ids,mode,changeLocation,location,changeStatus,status});setFeedback(result);
    if(result.ok){setSelected([]);setShowBulk(false);setChangeLocation(false);setChangeStatus(false);router.refresh();}
   }catch{setFeedback({ok:false,message:"De bulkactie kon niet worden bevestigd. Vernieuw de lijst voordat je opnieuw probeert."});}
  });
 }
 function submit(event:FormEvent){event.preventDefault();run("update");}
 return <>
  {canManage&&<div className="materials-toolbar" role="group" aria-label="Acties voor geselecteerde materialen">
   <Link className="primary" href="?nieuw=1"><Plus size={16}/>Nieuw item</Link>
   <button type="button" disabled={pending||count!==1} onClick={()=>router.push(`?bewerken=${ids[0]}`)}><Pencil size={16}/>Bewerken</button>
   <button type="button" disabled={pending||!count} aria-expanded={showBulk} aria-controls="materials-bulk-form" onClick={()=>setShowBulk(value=>!value)}><MapPin size={16}/>Locatie / status aanpassen</button>
   <button type="button" disabled={pending||!count} onClick={()=>run("archive")}><Archive size={16}/>Archiveren</button>
   <button type="button" className="danger-button" disabled={pending||!count} onClick={()=>run("delete")}><Trash2 size={16}/>Verwijderen</button>
   <span aria-live="polite">{count} geselecteerd{pending?" · Bezig met opslaan…":""}</span>
   <p>Selecteer eerst een of meer items. Bewerken opent één fiche; de andere acties werken op alle geselecteerde items.</p>
  </div>}
  {feedback&&<div className={feedback.ok?"success":"error-note"} role={feedback.ok?"status":"alert"}>{feedback.message}</div>}
  {canManage&&showBulk&&<form id="materials-bulk-form" className="form-card materials-bulk-form" onSubmit={submit}>
   <h3>Locatie en status voor {count} {count===1?"item":"items"}</h3><p>Vink alleen de velden aan die je wilt wijzigen. Andere gegevens blijven behouden.</p>
   <fieldset disabled={pending}><label className="materials-check"><input type="checkbox" checked={changeLocation} onChange={event=>setChangeLocation(event.target.checked)}/>Locatie wijzigen</label>
   <label>Nieuwe locatie<input value={location} disabled={!changeLocation} maxLength={300} onChange={event=>setLocation(event.target.value)}/></label><p className="form-hint">Laat leeg om de locatie te wissen.</p>
   <label className="materials-check"><input type="checkbox" checked={changeStatus} onChange={event=>setChangeStatus(event.target.checked)}/>Status wijzigen</label>
   <label>Nieuwe status<select value={status} disabled={!changeStatus} onChange={event=>setStatus(event.target.value as keyof typeof assetStatuses)}>{Object.entries(assetStatuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <div className="form-actions"><button className="primary" type="submit" disabled={!count||(!changeLocation&&!changeStatus)}>Wijzigingen toepassen</button><button type="button" onClick={()=>setShowBulk(false)}>Annuleren</button></div></fieldset>
  </form>}
  <div className="materials-table-scroll"><table className="materials-table"><thead><tr>
   {canManage&&<th scope="col"><label className="materials-check"><input type="checkbox" aria-label="Alle getoonde materialen selecteren" checked={Boolean(rows.length&&count===rows.length)} disabled={pending||!rows.length} ref={node=>{if(node)node.indeterminate=count>0&&count<rows.length;}} onChange={event=>{setSelected(event.target.checked?rows.map(row=>row.id):[]);setFeedback(null);}}/>Alles</label></th>}
   <th scope="col">Item</th><th scope="col">Verantwoordelijke / locatie</th><th scope="col">Waarde</th><th scope="col">Koppeling</th><th scope="col">Status</th>
  </tr></thead><tbody>{rows.map(item=><tr key={item.id} data-selected={ids.includes(item.id)||undefined}>
   {canManage&&<td><input type="checkbox" aria-label={`${item.name} selecteren`} checked={ids.includes(item.id)} disabled={pending} onChange={()=>toggle(item.id)}/></td>}
   <td><strong>{item.name}</strong><small>{types[item.asset_type]??item.asset_type}{item.serial_number?` · ${item.serial_number}`:""}</small>{item.document_url&&<a href={item.document_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/>Document</a>}</td>
   <td>{item.ownerLabel}{item.location&&<small>{item.location}</small>}</td><td>{item.valueLabel}<small>{item.acquiredLabel}</small></td><td>{item.relationLabel}</td><td><span className="badge purple">{assetStatuses[item.status as keyof typeof assetStatuses]??item.status}</span></td>
  </tr>)}</tbody></table>{!rows.length&&<p className="empty">Nog geen materialen of resources geregistreerd.</p>}</div>
 </>;
}
