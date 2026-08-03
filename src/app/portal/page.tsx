import Image from "next/image";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

type Access = { id: string; access_type: "sponsor" | "streamer"; partners: { name?: string } | null; community_people: { display_name?: string } | null };
type SponsorData = { partner: { name: string }; campaigns: Array<{ id: string; title: string; status: string; start_date: string | null; end_date: string | null; impressions: number | null; clicks: number | null }>; deliverables: Array<{ id: string; title: string; status: string; due_date: string | null }>; kpis: Array<{ id: string; metric: string; value: number; target: number | null; unit: string; source: string; collection_method: string }> };
type StreamerData = {
  person: { display_name: string; platforms: string[] };
  assignments: Array<{ id: string; role_name: string; status: string; starts_at: string | null; project_title: string | null; event_title: string | null }>;
  deliverables: Array<{ id: string; title: string; status: string; approval_status: string; due_date: string | null; campaign_title: string }>;
  development: Array<{ id: string; title: string; item_type: "onboarding" | "coaching" | "training"; completed: boolean; due_date: string | null; notes: string | null }>;
  kpis: Array<{ id: string; metric: string; value: number; target: number | null; unit: string; source: string; collection_method: string }>;
};

const number = (value: number) => new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2 }).format(value);
const developmentLabel = (type: StreamerData["development"][number]["item_type"]) => type === "coaching" ? "Coaching" : type === "training" ? "Training" : "Onboarding";

export default async function PortalPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.from("portal_access").select("id,access_type,partners(name),community_people(display_name)").eq("user_id", user.id).eq("status", "active").order("created_at");
  const access = (data ?? []) as unknown as Access[];
  if (!access.length) redirect("/wachten-op-goedkeuring");
  const selected = access.find((item) => item.id === query.toegang) ?? access[0];
  const rpc = selected.access_type === "sponsor"
    ? await supabase.rpc("portal_sponsor_dashboard", { p_access_id: selected.id })
    : await supabase.rpc("portal_streamer_dashboard", { p_access_id: selected.id });
  if (rpc.error) redirect("/wachten-op-goedkeuring");
  const sponsor = selected.access_type === "sponsor" ? rpc.data as SponsorData : null;
  const streamer = selected.access_type === "streamer" ? rpc.data as StreamerData : null;

  return <main className="portal-page">
    <header className="portal-header"><Image src="/besc-logo.png" width={170} height={56} alt="BESC"/><div><span>EXTERN PORTAAL</span><strong>{sponsor?.partner.name ?? streamer?.person.display_name}</strong></div><form action={signOut}><button>Uitloggen</button></form></header>
    <nav className="portal-access-tabs">{access.map((item) => <a className={item.id === selected.id ? "active" : ""} href={`?toegang=${item.id}`} key={item.id}>{item.access_type === "sponsor" ? item.partners?.name : item.community_people?.display_name}</a>)}</nav>
    <section className="portal-content">
      {sponsor && <>
        <div className="portal-intro"><span>SPONSORVIEWER</span><h1>{sponsor.partner.name}</h1><p>Je ziet uitsluitend de campagnes, deliverables en resultaten die aan jouw sponsordossier gekoppeld zijn.</p></div>
        <div className="portal-stats"><article><span>Campagnes</span><strong>{sponsor.campaigns.length}</strong></article><article><span>Deliverables</span><strong>{sponsor.deliverables.filter((item) => ["completed", "approved"].includes(item.status)).length}/{sponsor.deliverables.length}</strong></article><article><span>KPI-metingen</span><strong>{sponsor.kpis.length}</strong></article></div>
        <section className="portal-panel"><h2>Campagnes</h2>{sponsor.campaigns.map((item) => <article key={item.id}><div><strong>{item.title}</strong><span>{item.start_date ?? "—"} — {item.end_date ?? "—"}</span></div><b>{item.status}</b><span>{number(Number(item.impressions ?? 0))} impressies · {number(Number(item.clicks ?? 0))} klikken</span></article>)}</section>
        <section className="portal-panel"><h2>Deliverables</h2>{sponsor.deliverables.map((item) => <article key={item.id}><strong>{item.title}</strong><b>{item.status}</b><span>{item.due_date ?? "Geen deadline"}</span></article>)}</section>
        <section className="portal-panel"><h2>Resultaten</h2>{sponsor.kpis.map((item) => <article key={item.id}><div><strong>{item.metric}</strong><span>{item.source} · {item.collection_method === "api" ? "API" : item.collection_method === "imported" ? "Import" : "Handmatig"}</span></div><b>{number(Number(item.value))} {item.unit}</b><span>Doel {item.target == null ? "—" : number(Number(item.target))}</span></article>)}</section>
      </>}
      {streamer && <>
        <div className="portal-intro"><span>STREAMERPORTAAL</span><h1>{streamer.person.display_name}</h1><p>Volg je eigen inzetten, deliverables, ontwikkeling en resultaten. Interne BESC-dossiers blijven afgeschermd.</p></div>
        <div className="portal-stats"><article><span>Inzetten</span><strong>{streamer.assignments.length}</strong></article><article><span>Deliverables</span><strong>{streamer.deliverables.filter((item) => ["completed", "approved"].includes(item.status)).length}/{streamer.deliverables.length}</strong></article><article><span>Ontwikkelstappen</span><strong>{streamer.development.filter((item) => item.completed).length}/{streamer.development.length}</strong></article><article><span>KPI-metingen</span><strong>{streamer.kpis.length}</strong></article></div>
        <section className="portal-panel"><h2>Inschrijvingen en voortgang</h2>{streamer.assignments.map((item) => <article key={item.id}><div><strong>{item.project_title ?? item.event_title ?? "BESC-activiteit"}</strong><span>{item.role_name}</span></div><b>{item.status}</b><span>{item.starts_at ? new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium" }).format(new Date(item.starts_at)) : "Nog niet gepland"}</span></article>)}</section>
        <section className="portal-panel"><h2>Deliverables</h2>{streamer.deliverables.map((item) => <article key={item.id}><div><strong>{item.title}</strong><span>{item.campaign_title}</span></div><b>{item.status}</b><span>{item.due_date ?? "Geen deadline"}</span></article>)}</section>
        <section className="portal-panel"><h2>Onboarding, coaching en training</h2>{streamer.development.map((item) => <article key={item.id}><div><strong>{item.title}</strong><span>{developmentLabel(item.item_type)}</span></div><b>{item.completed ? "Afgerond" : "Open"}</b><span>{item.due_date ?? "Geen deadline"}</span></article>)}</section>
        <section className="portal-panel"><h2>Resultaten</h2>{streamer.kpis.map((item) => <article key={item.id}><div><strong>{item.metric}</strong><span>{item.source} · {item.collection_method === "api" ? "API" : item.collection_method === "imported" ? "Import" : "Handmatig"}</span></div><b>{number(Number(item.value))} {item.unit}</b><span>Doel {item.target == null ? "—" : number(Number(item.target))}</span></article>)}</section>
      </>}
    </section>
  </main>;
}
