import Link from "next/link";
import {activeAssetUses,assetUsePeriod,openAssetRepairs,type AssetFollowup} from "@/lib/asset-followup";
import {assetStatuses} from "@/lib/asset-bulk";
import {dossierChoiceLabel} from "@/lib/dossier-editor-labels";
function date(value:string|null){return value?new Date(value).toLocaleString("nl-BE",{timeZone:"Europe/Brussels",dateStyle:"medium",...(value.includes("T")?{timeStyle:"short" as const}:{})}):"Nog niet gepland";}
export function AssetPlanning({followup,status}:{followup?:AssetFollowup;status:string}){
 const uses=followup?.uses??[],repairs=followup?.repairs??[],open=openAssetRepairs(repairs),active=activeAssetUses(uses);
 return <section className="asset-planning"><div className="asset-planning-state"><strong>{open.length?"Buiten dienst voor herstelling":active.length?"In gebruik voor een event":assetStatuses[status as keyof typeof assetStatuses]??status}</strong><span>Automatisch overzicht op basis van eventmaterialen en hersteltaken.</span></div>
 <h3>Gebruik bij events</h3>{!uses.length&&<p className="form-help">Nog niet aan een eventmateriaalregel gekoppeld. Voeg dit item toe via de materialenlijst van het event.</p>}
 {uses.map(row=>{const period=assetUsePeriod(row);return <article key={row.id}><div><Link href={"/app/events/"+row.event_id+"?tab=materialen"}>{row.events?.title??"Event niet beschikbaar"}</Link><span>{date(period.start)} → {date(period.end)}</span></div><span>{dossierChoiceLabel(row.status)}</span></article>;})}
 <h3>Gebruik bij projecten</h3>{!followup?.projectUses?.length&&<p className="form-help">Nog geen projectreserveringen gekoppeld.</p>}
 {followup?.projectUses?.map(row=><article key={row.id}><div><Link href={"/app/projecten/"+row.project_id+"?tab=planning"}>{row.projects?.title??row.name}</Link><span>{date(row.starts_at??row.projects?.start_date??null)} → {date(row.ends_at??row.projects?.due_date??null)}</span></div><span>{dossierChoiceLabel(row.status)}</span></article>)}
 <h3>Herstellingen</h3>{!repairs.length&&<p className="form-help">Nog geen hersteltaken gekoppeld.</p>}
 {repairs.map(row=><article key={row.id}><div><Link href={"/app/taken/"+row.id}>{row.title}</Link><span>Deadline: {date(row.due_at)}</span></div><span>{dossierChoiceLabel(row.status)}</span></article>)}
 </section>;
}
