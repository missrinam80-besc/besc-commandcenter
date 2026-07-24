import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { MeetingForm } from "@/components/meeting-form";
import { requireActiveMembership } from "@/lib/auth-context";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  const result = await supabase.from("meetings").select("*").eq("organization_id", membership.organization_id).is("deleted_at", null).order("meeting_at", { ascending: false });
  const data = result.data ?? [];
  return <AppShell active="Vergaderingen & besluiten"><header className="topbar module-top"><div><p>BESTUUR & GOVERNANCE</p><h1>Vergaderingen & besluiten</h1></div><Link className="primary" href="?nieuw=1">Nieuwe vergadering</Link></header><div className="module-body"><p className="lead">Bewaar agenda, notulen, formele besluiten en opvolgbare actiepunten samen.</p>{q.fout&&<div className="error-note">Opslaan is mislukt ({q.fout}).</div>}<section className="history-stats"><article><span>Totaal</span><strong>{data.length}</strong></article><article><span>Gepland</span><strong>{data.filter(x=>["planned","confirmed"].includes(x.status)).length}</strong></article><article><span>Afgerond</span><strong>{data.filter(x=>x.status==="completed").length}</strong></article></section>{q.nieuw&&<section className="form-card"><div className="form-heading"><h2>Nieuwe vergadering</h2><Link href="?">Sluiten</Link></div><MeetingForm/></section>}<div className="operations-table"><div className="operations-head"><span>Vergadering</span><span>Type</span><span>Datum / deelnemers</span><span>Status</span><span></span></div>{data.map(x=><article key={x.id}><div><strong>{x.title}</strong><p>{x.decisions||x.notes||"Geen verslaginformatie"}</p></div><span>{x.meeting_type}</span><span>{x.meeting_at?new Date(x.meeting_at).toLocaleString("nl-BE"):`${(x.attendees??[]).length} deelnemers`}</span><span className="badge purple">{x.status}</span><Link className="row-action" href={`/app/vergaderingen/${x.id}`}>Openen</Link></article>)}{!data.length&&<div className="empty">Nog geen vergaderingen.</div>}</div></div></AppShell>;
}
