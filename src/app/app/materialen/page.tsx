import { dossierEditorGate } from "@/components/dossier-editor-gate";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { isManager } from "@/lib/permissions";
import type {AssetCalendar} from "@/lib/asset-followup";
import {assetStatuses} from "@/lib/asset-bulk";
import {MaterialsInventory} from "@/components/materials-inventory";
import "./materials.css";

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const unifiedEditor = await dossierEditorGate({kind:"asset",query:q});
  if (unifiedEditor) return unifiedEditor;

  const { supabase, membership } = await requireActiveMembership();
  const org = membership.organization_id;
  const [assetsResult,calendarResult] = await Promise.all([
    supabase.from("assets").select("*,community_people(display_name),partners(name)").eq("organization_id", org).is("deleted_at", null).order("name"),
    supabase.rpc("asset_booking_calendar",{p_organization_id:org})
  ]);
  const rows = assetsResult.data ?? [];
  const calendar=(calendarResult.data??[]) as AssetCalendar[];
  const now=calendar[0]?.asOf?Date.parse(calendar[0].asOf):0;
  function planning(item:{id:string;status:string}){
    const entry=calendar.find(row=>row.id===item.id);
    if(calendarResult.error)return {relationLabel:"Planning niet beschikbaar",statusLabel:assetStatuses[item.status as keyof typeof assetStatuses]??item.status};
    const current=entry?.bookings.find(row=>(!row.start||Date.parse(row.start)<=now)&&(!row.end||now<Date.parse(row.end)));
    return {relationLabel:entry?.repair?"Open hersteltaak":current?"In gebruik bij "+(current.table==="event_materials"?"event":"project"):entry?.bookings.length?"Reservering gepland":"Geen reserveringen",statusLabel:entry?.repair?"In herstelling":current?"In gebruik":assetStatuses[item.status as keyof typeof assetStatuses]??item.status};
  }
  const canManage = isManager(membership);

  return (
    <AppShell active="Materialen & resources">
      <header className="topbar module-top">
        <div>
          <p>ORGANISATIE & INVENTARIS</p>
          <h1>Materialen & resources</h1>
        </div>
      </header>
      <div className="module-body">
        <p className="lead">
          Centrale inventaris voor streammateriaal, eventbenodigdheden, hardware,
          licenties en andere resources. Volg eventgebruik en herstellingen op,
          zodat iedereen weet wat beschikbaar is,
          waar het ligt en waarvoor het gebruikt wordt.
        </p>
        {calendarResult.error&&<p className="error-note">De materiaalplanning kon niet worden gecontroleerd. De inventaris blijft zichtbaar.</p>}
        {q.succes && <div className="success">De materialen- en resourceslijst is bijgewerkt.</div>}
        {q.fout && <div className="error-note">De actie is mislukt ({q.fout}).</div>}

        <section className="project-task-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">INVENTARIS</span>
              <h2>Materialen en resources</h2>
            </div>
            <span>{rows.length}</span>
          </div>
          {assetsResult.error?<p className="error-note" role="alert">De materiaallijst kon niet worden geladen. Probeer opnieuw.</p>:<MaterialsInventory canManage={canManage} rows={rows.map(item=>({id:item.id,name:item.name,asset_type:item.asset_type,status:item.status,location:item.location,serial_number:item.serial_number,document_url:item.document_url,ownerLabel:item.community_people?.display_name||"Niet toegewezen",...planning(item),valueLabel:["borrowed","gifted"].includes(item.acquisition_type)?"Niet van toepassing":formatCurrency(item.current_value??item.purchase_value),acquiredLabel:item.acquisition_type==="purchased"&&item.acquired_date?`Sinds ${formatDate(item.acquired_date)}`:""}))}/>}
        </section>
      </div>
    </AppShell>
  );
}
