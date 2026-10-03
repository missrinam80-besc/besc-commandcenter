import Link from "next/link";
import { UserRoundSearch } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ReportSelector } from "@/components/report-selector";
import { requireActiveMembership } from "@/lib/auth-context";
import { isActiveStreamTeamMember } from "@/lib/reporting-scope";

export default async function CreatorReportsPage() {
  const { supabase, membership } = await requireActiveMembership();
  const org = membership.organization_id;
  if (!["admin", "board", "member"].includes(membership.role)) {
    return <AppShell active="Streamerrapportage"><div className="module-body"><div className="permission-note">Streamerrapportage is alleen beschikbaar voor bestuur en medewerkers.</div></div></AppShell>;
  }
  const { data } = await supabase
    .from("community_people")
    .select("id,display_name,handle,status,roles:community_person_roles(role)")
    .eq("organization_id", org)
    .is("deleted_at", null)
    .order("display_name");
  const people = (data ?? []).filter(isActiveStreamTeamMember);
  return <AppShell active="Streamerrapportage">
    <header className="topbar module-top"><div><p>INZICHTEN</p><h1>Streamerrapportage</h1></div><Link className="row-action" href="/app/rapportage">Alle KPI-resultaten</Link></header>
    <div className="module-body">
      <p className="lead">Kies een actief streamteamlid om deelname, gekoppelde dossiers en KPI-resultaten te bekijken.</p>
      <section className="form-card">
        <div className="form-heading"><div><span className="eyebrow">SELECTIE</span><h2>Streamer kiezen</h2></div><span>{people.length}</span></div>
        <div className="form-row">
          <ReportSelector label="Streamteamlid" placeholder="Selecteer een streamteamlid..." basePath="/app/rapportage/creators" options={people.map((person) => ({ id: person.id, label: person.display_name, meta: person.handle || person.status }))}/>
        </div>
      </section>
      <section className="report-kpi-grid">
        {people.map((person) => <article key={person.id}><div><span>{person.status}</span><b>{person.display_name}</b></div><UserRoundSearch size={22}/><p>{person.handle || "Geen handle ingevuld"}</p><footer><span>Streamerrapport</span><Link href={`/app/rapportage/creators/${person.id}`}>Openen</Link></footer></article>)}
        {!people.length && <div className="empty">Er zijn nog geen actieve streamteamleden om te rapporteren.</div>}
      </section>
    </div>
  </AppShell>;
}
