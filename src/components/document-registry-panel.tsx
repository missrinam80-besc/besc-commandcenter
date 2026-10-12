import {requireActiveMembership} from "@/lib/auth-context";
import {hasPermission} from "@/lib/permissions";
import {addRegistryDocument} from "@/app/app/documenten/actions";

export async function DocumentRegistryPanel({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const q=await searchParams,{supabase,membership}=await requireActiveMembership();
 const page=Math.max(1,Number.parseInt(q.pagina??"1",10)||1),term=(q.zoek??"").trim().slice(0,120);
 let request=supabase.from("document_registry").select("id,label,url,created_at",{count:"exact"}).eq("organization_id",membership.organization_id).order("label").order("id").range((page-1)*50,page*50-1);
 if(term)request=request.ilike("label","%"+term.replace(/[%,_]/g,"")+"%");
 const {data,error,count}=await request;
 const ids=(data??[]).map(row=>row.id);
 const [assets,links,sources,google]=ids.length?await Promise.all([
  supabase.from("asset_document_links").select("document_id,asset_id").eq("organization_id",membership.organization_id).in("document_id",ids),
  supabase.from("record_links").select("document_id,entity_type,entity_id").eq("organization_id",membership.organization_id).in("document_id",ids),
  supabase.from("document_registry_sources").select("document_id,table_name,record_id").eq("organization_id",membership.organization_id).in("document_id",ids),
  supabase.from("google_resource_links").select("document_id,entity_type,entity_id").eq("organization_id",membership.organization_id).in("document_id",ids)
 ]):[{data:[],error:null},{data:[],error:null},{data:[],error:null},{data:[],error:null}];
 const routes:Record<string,string>={project:"/app/projecten/",event:"/app/events/",campaign:"/app/campagnes/",partner:"/app/sponsors/",community_person:"/app/community/",task:"/app/taken/",content:"/app/content/",meeting:"/app/vergaderingen/"};
 const tableRoutes:Record<string,string>={assets:"/app/materialen?bewerken=",expenses:"/app/financien/kosten/",income_entries:"/app/financien/inkomsten/",partners:"/app/sponsors/",meetings:"/app/vergaderingen/",administrative_documents:"/app/administratie?fiche=administration&bewerken=",projects:"/app/projecten/",events:"/app/events/",campaigns:"/app/campagnes/",community_people:"/app/community/",knowledge_articles:"/app/kennisbank/",content_items:"/app/content/",merch_launches:"/app/shop/lanceringen/"};
 function attachments(id:string){
  const rows=[...(google.data??[]).filter(row=>row.document_id===id&&routes[row.entity_type]).map(row=>({href:routes[row.entity_type]+row.entity_id,label:"Gekoppelde fiche"})),...(assets.data??[]).filter(row=>row.document_id===id).map(row=>({href:"/app/materialen?bewerken="+row.asset_id,label:"Materiaalfiche"})),...(links.data??[]).filter(row=>row.document_id===id&&routes[row.entity_type]).map(row=>({href:routes[row.entity_type]+row.entity_id,label:"Gekoppelde fiche"})),...(sources.data??[]).filter(row=>row.document_id===id&&tableRoutes[row.table_name]).map(row=>({href:tableRoutes[row.table_name]+row.record_id,label:"Gekoppelde fiche"}))];
  return rows.filter((row,index)=>rows.findIndex(other=>other.href===row.href)===index);
 }

 return <section className="documents-register"><p className="lead">Eén register voor documentlinks. Kies een bestaand document in een fiche of voeg daar een nieuwe link toe; die verschijnt automatisch hier.</p>
 {q.fout&&<p className="error-note">Het document kon niet worden toegevoegd. Controleer het label en de volledige http- of https-link.</p>}
 {q.melding==="bestaand"&&<p className="success" role="status">Deze documentlink staat al in het register. Kies het bestaande document in je fiche.</p>}
 {q.succes&&<p className="success" role="status">Document toegevoegd.</p>}
 <form className="documents-search"><label>Zoek op label<input name="zoek" defaultValue={term}/></label><button>Zoeken</button></form>
 {hasPermission(membership,"manageOrganization")&&<details className="form-card"><summary>Nieuw document toevoegen</summary><form action={addRegistryDocument}><label>Label<input name="label" required maxLength={120}/></label><label>Documentlink<input name="url" type="url" required maxLength={2000}/></label><div className="form-actions"><button className="primary">Toevoegen</button></div></form></details>}
 <section className="project-task-section"><div className="section-heading"><h2>Documentregister</h2><span>{count??0} documenten</span></div>{(error||assets.error||links.error||sources.error||google.error)?<p className="error-note">Het documentregister kon niet worden geladen. Controleer de migratie.</p>:<><div className="documents-table-scroll"><table><thead><tr><th>Label</th><th>Link</th><th>Gekoppelde fiches</th></tr></thead><tbody>{data?.map(doc=><tr key={doc.id}><td>{doc.label}</td><td><a href={doc.url} target="_blank" rel="noreferrer">Open document</a></td><td>{attachments(doc.id).map(row=><a className="document-fiche-link" key={row.href} href={row.href}>{row.label}</a>)}{!attachments(doc.id).length&&<span>Nog niet gekoppeld</span>}</td></tr>)}</tbody></table></div>{!data?.length&&<p className="form-help">Geen documenten gevonden.</p>}</>}
 <nav aria-label="Documentpagina’s">{page>1&&<a href={"?pagina="+(page-1)+"&zoek="+encodeURIComponent(term)}>Vorige</a>}{page*50<(count??0)&&<a href={"?pagina="+(page+1)+"&zoek="+encodeURIComponent(term)}>Volgende</a>}</nav></section></section>;
}
