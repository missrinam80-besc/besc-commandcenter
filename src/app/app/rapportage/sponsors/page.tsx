import Link from "next/link";
import { Handshake } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ReportSelector } from "@/components/report-selector";
import { requireActiveMembership } from "@/lib/auth-context";

export default async function SponsorReportsPage() {
  const { supabase, membership } = await requireActiveMembership();
  const org = membership.organization_id;
  if (!["admin", "board", "member"].includes(membership.role)) {
    return <AppShell active="Sponsorrapportage"><div className="module-body"><div className="permission-note">Sponsorrapportage is alleen beschikbaar voor bestuur en medewerkers.</div></div></AppShell>;
  }
  const { data } = await supabase
    .from("partners")
    .select("id,name,status,collaboration_type")
    .eq("organization_id", org)
    .is("deleted_at", null)
    .order("name");
  const sponsors = data ?? [];
  return <AppShell active="Sponsorrapportage">
    <header className="topbar module-top"><div><p>INZICHTEN</p><h1>Sponsorrapportage</h1></div><Link className="row-action" href="/app/rapportage">Alle KPI-resultaten</Link></header>
    <div className="module-body">
      <p className="lead">Kies een sponsor om campagnes, deliverables, financiële realisatie en gekoppelde KPI-resultaten te bekijken.</p>
      <section className="form-card">
        <div className="form-heading"><div><span className="eyebrow">SELECTIE</span><h2>Sponsor kiezen</h2></div><span>{sponsors.length}</span></div>
        <div className="form-row">
          <ReportSelector label="Sponsor" placeholder="Selecteer een sponsor..." basePath="/app/rapportage/sponsors" options={sponsors.map((sponsor) => ({ id: sponsor.id, label: sponsor.name, meta: sponsor.collaboration_type || sponsor.status }))}/>
        </div>
      </section>
      <section className="report-kpi-grid">
        {sponsors.map((sponsor) => <article key={sponsor.id}><div><span>{sponsor.status}</span><b>{sponsor.name}</b></div><Handshake size={22}/><p>{sponsor.collaboration_type || "Geen samenwerkingstype ingevuld"}</p><footer><span>Sponsorrapport</span><Link href={`/app/rapportage/sponsors/${sponsor.id}`}>Openen</Link></footer></article>)}
        {!sponsors.length && <div className="empty">Er zijn nog geen sponsors om te rapporteren.</div>}
      </section>
    </div>
  </AppShell>;
}
