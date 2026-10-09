import "./keuzevelden.css";
import {AppShell} from "@/components/app-shell";
import {ConfirmSubmitButton} from "@/components/confirm-submit-button";
import {requirePermission} from "@/lib/auth-context";
import {dossierChoiceSets,type DossierChoice} from "@/lib/dossier-choices";
import {loadManagedChoices} from "@/lib/dossier-choices-server";
import {saveChoice,deleteChoice} from "./actions";

const errors:Record<string,string>={
 "in-gebruik":"Deze optie kan niet verwijderd worden: ze is gekoppeld aan een of meer fiches. Wijzig eerst die koppelingen. Ook gearchiveerde en verwijderde fiches tellen mee.",
 standaard:"Deze standaardoptie kan niet verwijderd worden: de app gebruikt haar bij nieuwe fiches.",
 beschermd:"Dit keuzeveld bepaalt de werking van de app en kan hier niet worden uitgebreid of verwijderd.",
 dubbel:"Er bestaat al een optie met deze benaming of sleutel in dit keuzeveld.",
 velden:"Vul een benaming van 1 tot 120 tekens en een geldige volgorde in.",
 rechten:"Je hebt geen rechten om deze opties te beheren.",
 "niet-beschikbaar":"De optie bestaat niet meer of is ondertussen gewijzigd. Vernieuw de lijst.",
 opslaan:"De wijziging is niet opgeslagen. Controleer de verbinding en de databankmigratie.",
};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const query=await searchParams,{supabase,membership}=await requirePermission("manageUsers");
 const sets=dossierChoiceSets(),selected=sets.find(set=>set.key===query.lijst)??sets.find(set=>set.editable)!;
 let rows:DossierChoice[]=[],loadError=false;
 try{
  rows=await loadManagedChoices(supabase,membership.organization_id);
  const {data,error}=await supabase.rpc("dossier_choice_usage",{p_organization_id:membership.organization_id});
  if(error||!Array.isArray(data))throw Error("Gebruik kon niet gecontroleerd worden.");
  const counts=new Map<string,number>((data??[]).map((row:{set_key:string;value:string;usage_count:number})=>[`${row.set_key}:${row.value}`,Number(row.usage_count)] as [string,number]));
  rows=rows.map(row=>({...row,usage_count:counts.get(`${row.set_key}:${row.value}`)??0}));
 }catch{loadError=true;}
 const options=rows.filter(row=>row.set_key===selected.key);
 return <AppShell active="Keuzevelden"><header className="topbar module-top"><div><p>BEHEER</p><h1>Keuzevelden</h1></div></header><div className="module-body choice-management">
  <p>Beheer types en categorieën voor alle fiches. Een gekoppelde optie kan niet worden verwijderd. Werkstroomkeuzes blijven beschermd.</p>
  {query.fout&&<div className="error-note" role="alert">{errors[query.fout]??errors.opslaan}</div>}{query.succes&&<div className="success" role="status">Keuzeveld bijgewerkt.</div>}
  {loadError&&<div className="error-note" role="alert">De opties of hun gebruik kunnen niet worden gecontroleerd. Er kan niets worden gewijzigd. Controleer de migratie voor beheerde keuzevelden.</div>}
  <section className="form-card"><form method="get" className="choice-list-selector"><label>Keuzeveld<select name="lijst" defaultValue={selected.key}>{[true,false].map(editable=><optgroup key={String(editable)} label={editable?"Types en categorieën · beheerbaar":"Werkstroomkeuzes · beschermd"}>{sets.filter(set=>set.editable===editable).map(set=><option key={set.key} value={set.key}>{set.label}</option>)}</optgroup>)}</select></label><button className="row-action">Lijst tonen</button></form></section>
  <section className="form-card"><h2>{selected.label}</h2>{selected.editable?!loadError&&<>
   {options.length===0&&<p className="empty-inline">Nog geen opties beschikbaar.</p>}
   {options.map(option=><article key={option.value} className="choice-management-row"><form action={saveChoice} className="choice-edit-form"><input type="hidden" name="set_key" value={selected.key}/><input type="hidden" name="value" value={option.value}/><label>Benaming<input name="label" defaultValue={option.label} required maxLength={120}/></label><label>Volgorde<input name="position" type="number" min={0} max={100000} defaultValue={option.position} required/></label><button className="row-action" aria-label={`Wijzigingen aan ${option.label} opslaan`}>Opslaan</button></form><form action={deleteChoice} className="choice-delete-form"><input type="hidden" name="set_key" value={selected.key}/><input type="hidden" name="value" value={option.value}/><ConfirmSubmitButton disabled={Boolean(option.usage_count||option.is_default)} className="danger-button" aria-describedby={`choice-usage-${option.value}`} message={`Optie “${option.label}” verwijderen?`}>Verwijderen</ConfirmSubmitButton></form><p id={`choice-usage-${option.value}`}>{option.usage_count?`In gebruik in ${option.usage_count} fiche(s). Verwijderen is geblokkeerd.`:option.is_default?"Standaardoptie: verwijderen is geblokkeerd.":"Niet gekoppeld aan fiches."}</p></article>)}
   <div className="choice-add"><h3>Optie toevoegen</h3><form action={saveChoice} className="choice-edit-form"><input type="hidden" name="set_key" value={selected.key}/><label>Benaming<input name="label" required maxLength={120} placeholder="Nieuwe optie"/></label><label>Volgorde<input name="position" type="number" min={0} max={100000} defaultValue={options.length*10} required/></label><button className="primary">Optie toevoegen</button></form></div>
  </>:<><p>Dit veld bepaalt de werking van de app. De opties zijn zichtbaar en beschermd tegen toevoegen, wijzigen en verwijderen.</p><ul>{selected.values.map(option=><li key={option.value}>{option.label}</li>)}</ul></>}</section>
 </div></AppShell>;
}
