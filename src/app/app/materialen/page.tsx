import { dossierEditorGate } from "@/components/dossier-editor-gate";
import Link from "next/link";
import { Archive, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { requireActiveMembership } from "@/lib/auth-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { isManager } from "@/lib/permissions";
import { removeAsset } from "./actions";

const statusLabels: Record<string, string> = {
  planned: "Gepland",
  active: "In gebruik",
  maintenance: "Onderhoud",
  loaned: "Uitgeleend",
  retired: "Buiten gebruik",
  lost: "Vermist",
  archived: "Gearchiveerd",
};

const typeLabels: Record<string, string> = {
  equipment: "Materiaal",
  computer: "Computer",
  streaming: "Streaming",
  furniture: "Meubilair",
  software: "Software/licentie",
  vehicle: "Voertuig",
  other: "Overige resource",
};

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
        <div className="project-actions">
          {canManage && <Link className="primary" href="?nieuw=1"><Plus size={16}/>Nieuw item</Link>}
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
          <div className="operations-table">
            <div className="operations-head">
              <span>Item</span>
              <span>Verantwoordelijke / locatie</span>
              <span>Waarde</span>
              <span>Koppeling</span>
              <span>Status</span>
              <span/>
            </div>
            {rows.map((item) => {
              const relation = item.projects?.title || item.events?.title || item.campaigns?.title || "Niet gekoppeld";
              return (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>{typeLabels[item.asset_type] ?? item.asset_type}{item.serial_number ? ` · ${item.serial_number}` : ""}</p>
                  </div>
                  <span>{item.community_people?.display_name || "Niet toegewezen"}{item.location ? ` · ${item.location}` : ""}</span>
                  <span>{formatCurrency(item.current_value ?? item.purchase_value)}<small>{item.acquired_date ? ` sinds ${formatDate(item.acquired_date)}` : ""}</small></span>
                  <span>{relation}</span>
                  <span className="badge purple">{statusLabels[item.status] ?? item.status}</span>
                  <div>
                    {item.document_url && <a className="row-action" href={item.document_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/></a>}
                    {canManage && <Link className="row-action" href={`?bewerken=${item.id}`}><Pencil size={13}/></Link>}
                    {canManage && <details className="contact-dossier-actions"><summary>Acties</summary>
                      <form action={removeAsset}>
                        <input type="hidden" name="id" value={item.id}/><input type="hidden" name="mode" value="archive"/>
                        <button><Archive size={14}/>Archiveren</button>
                      </form>
                      <form action={removeAsset}>
                        <input type="hidden" name="id" value={item.id}/><input type="hidden" name="mode" value="delete"/>
                        <ConfirmSubmitButton className="danger-button" message="Dit item verbergen uit de operationele inventaris?"><Trash2 size={14}/>Verwijderen</ConfirmSubmitButton>
                      </form>
                    </details>}
                  </div>
                </article>
              );
            })}
            {!rows.length && <div className="empty">Nog geen materialen of resources geregistreerd.</div>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
