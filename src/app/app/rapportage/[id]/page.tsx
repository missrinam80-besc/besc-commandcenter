import Link from "next/link";
import { ExternalLink, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { FormModal } from "@/components/form-modal";
import { KpiForm, type KpiOptions } from "@/components/kpi-form";
import { MarkdownContent } from "@/components/markdown-field";
import { requireActiveMembership } from "@/lib/auth-context";
import { deleteKpi } from "../actions";

type Relation = { id: string; title?: string | null; name?: string | null } | null;
const relation = (label: string, value: Relation, href: string) => value ? <article><span>{label}</span><Link href={`${href}/${value.id}`}>{value.title || value.name || "Naamloos dossier"}</Link></article> : null;

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  const org = membership.organization_id;
  const manager = ["admin", "board"].includes(membership.role);
  const [record, projects, campaigns, events, content, partners, tasks, people, social] = await Promise.all([
    supabase.from("kpi_records").select("*,projects(id,title),campaigns(id,title),events(id,title),content_items(id,title),partners(id,name),tasks(id,title),community_people(id,name:display_name),social_posts(id,title)").eq("organization_id", org).eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("projects").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("campaigns").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("events").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("content_items").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("partners").select("id,name").eq("organization_id", org).is("deleted_at", null).order("name"),
    supabase.from("tasks").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("community_people").select("id,name:display_name").eq("organization_id", org).is("deleted_at", null).order("display_name"),
    supabase.from("social_posts").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
  ]);
  if (!record.data) notFound();
  const data = record.data;
  const options: KpiOptions = { projects: projects.data ?? [], campaigns: campaigns.data ?? [], events: events.data ?? [], content: content.data ?? [], partners: partners.data ?? [], tasks: tasks.data ?? [], people: people.data ?? [], social: social.data ?? [] };
  return <AppShell active="Rapportage & KPI">
    <header className="project-detail-head"><div><Link href="/app/rapportage">← Terug naar rapportage</Link><span className="eyebrow">{data.domain}</span><h1>{data.name}</h1><p>{data.metric} · {data.period_start || "geen startdatum"} — {data.period_end || "geen einddatum"}</p></div><div className="project-actions">{data.source_url && <a href={data.source_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Open bron</a>}{manager && !q.bewerken && <Link className="primary" href="?bewerken=1">Bewerken</Link>}</div></header>
    <div className="project-detail-body">
      {q.succes && <div className="success">KPI bijgewerkt.</div>}{q.fout && <div className="error-note">De actie is mislukt ({q.fout}).</div>}
      {q.bewerken && manager ? <FormModal title="KPI bewerken"><KpiForm record={data} options={options}/></FormModal> : <>
        <section className="project-summary"><article><span>Waarde</span><strong>{Number(data.value).toLocaleString("nl-BE")}</strong></article><article><span>Doel</span><strong>{data.target == null ? "—" : Number(data.target).toLocaleString("nl-BE")}</strong></article><article><span>Eenheid</span><strong>{data.unit}</strong></article><article><span>Bron</span><strong>{data.source}</strong></article><article><span>Verzamelmethode</span><strong>{({ manual: "Handmatig", imported: "Import", api: "API" } as Record<string, string>)[data.collection_method] ?? data.collection_method}</strong></article></section>
        <section className="project-summary">{relation("Project", data.projects as Relation, "/app/projecten")}{relation("Campagne", data.campaigns as Relation, "/app/campagnes")}{relation("Event", data.events as Relation, "/app/events")}{relation("Content", data.content_items as Relation, "/app/content")}{relation("Sponsor / partner", data.partners as Relation, "/app/sponsors")}{relation("Actie / taak", data.tasks as Relation, "/app/taken")}{relation("Creator / streamer", data.community_people as Relation, "/app/community")}{relation("Social post", data.social_posts as Relation, "/app/social")}</section>
        <section className="form-card record-notes"><div className="form-heading"><h2>Metricdefinitie</h2></div>{data.metric_definition ? <MarkdownContent>{data.metric_definition}</MarkdownContent> : <p>Nog geen definitie vastgelegd.</p>}</section>
        <section className="form-card record-notes"><div className="form-heading"><h2>Notities</h2></div>{data.notes ? <MarkdownContent>{data.notes}</MarkdownContent> : <p>Geen notities.</p>}</section>
        {manager && <section className="form-card danger-zone"><div><h2>KPI verwijderen</h2><p>De registratie verdwijnt uit rapportages maar blijft technisch bewaard voor auditdoeleinden.</p></div><form action={deleteKpi}><input type="hidden" name="id" value={id}/><label>Typ VERWIJDER om te bevestigen<input name="confirmation" required pattern="VERWIJDER"/></label><button><Trash2 size={15}/>Verwijderen</button></form></section>}
      </>}
    </div>
  </AppShell>;
}
