import { dossierEditorGate } from "@/components/dossier-editor-gate";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { isManager } from "@/lib/permissions";
import {MaterialsInventory} from "@/components/materials-inventory";
import "./materials.css";

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const unifiedEditor = await dossierEditorGate({kind:"asset",query:q});
  if (unifiedEditor) return unifiedEditor;

  const { supabase, membership } = await requireActiveMembership();
  const org = membership.organization_id;
  const [assetsResult] = await Promise.all([
    supabase.from("assets").select("*,community_people(display_name),partners(name),projects(title),events(title),campaigns(title)").eq("organization_id", org).is("deleted_at", null).order("name")
  ]);
  const rows = assetsResult.data ?? [];
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
          licenties en andere resources. Koppel items aan projecten, events,
          campagnes of verantwoordelijken zodat iedereen weet wat beschikbaar is,
          waar het ligt en waarvoor het gebruikt wordt.
        </p>
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
          {assetsResult.error?<p className="error-note" role="alert">De materiaallijst kon niet worden geladen. Probeer opnieuw.</p>:<MaterialsInventory canManage={canManage} rows={rows.map(item=>({id:item.id,name:item.name,asset_type:item.asset_type,status:item.status,location:item.location,serial_number:item.serial_number,document_url:item.document_url,ownerLabel:item.community_people?.display_name||"Niet toegewezen",relationLabel:item.projects?.title||item.events?.title||item.campaigns?.title||"Niet gekoppeld",valueLabel:formatCurrency(item.current_value??item.purchase_value),acquiredLabel:item.acquired_date?`Sinds ${formatDate(item.acquired_date)}`:""}))}/>}
        </section>
      </div>
    </AppShell>
  );
}
