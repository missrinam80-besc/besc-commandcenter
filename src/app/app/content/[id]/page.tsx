import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ApprovalPanel } from "@/components/approval-panel";
import { ContentForm } from "@/components/content-form";
import { FormModal } from "@/components/form-modal";
import { RecordLifecyclePanel } from "@/components/record-lifecycle-panel";
import { RecordConnectionsPanel } from "@/components/record-connections-panel";
import { TaskCreateModal } from "@/components/task-create-modal";
import { requireActiveMembership } from "@/lib/auth-context";
import { updateContent } from "../actions";
import { approvalStatuses, contentStatuses, contentTypes } from "../constants";
import { hasPermission } from "@/lib/permissions";
import { loadDossierConnections, loadRelationOptions } from "@/lib/dossier-relations";

type Content = {
  id: string;
  title: string;
  description: string | null;
  content_type: string;
  status: string;
  priority: string;
  project_id: string | null;
  primary_channel: string | null;
  channels: string[];
  deadline: string | null;
  publication_at: string | null;
  drive_url: string | null;
  canva_url: string | null;
  publication_url: string | null;
  approval_status: string;
  projects: { title: string } | null;
};

export default async function ContentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  const canManage = hasPermission(membership, "manageContent");
  const [{ data }, { data: projects }, { data: source }, { data: memberRows }] = await Promise.all([
    supabase.from("content_items").select("id,title,description,content_type,status,priority,project_id,primary_channel,channels,deadline,publication_at,drive_url,canva_url,publication_url,approval_status,projects(title)").eq("organization_id", membership.organization_id).eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("projects").select("id,title").eq("organization_id", membership.organization_id).is("deleted_at", null).order("title"),
    supabase.from("migration_source_links").select("source_url").eq("target_table", "content_items").eq("target_id", id).limit(1).maybeSingle(),
    supabase.from("organization_members").select("user_id,profiles(display_name)").eq("organization_id", membership.organization_id).eq("status", "active"),
  ]);
  if (!data) notFound();
  const item = data as unknown as Content;
  const people = (memberRows ?? []).map((member) => ({ id: member.user_id, label: (member.profiles as { display_name?: string } | null)?.display_name ?? "Naamloos account" }));
  const [connections, relationOptions] = await Promise.all([
    loadDossierConnections(supabase, membership.organization_id, "content", id),
    loadRelationOptions(supabase, membership.organization_id, "content", id),
  ]);
  return (
    <AppShell active="Content">
      <header className="project-detail-head">
        <div><Link href="/app/content">← Alle content</Link><span className="eyebrow">CONTENTDOSSIER</span><h1>{item.title}</h1><p>{item.description || "Nog geen beschrijving of briefing."}</p></div>
        <div className="project-actions">
          {item.drive_url && <a href={item.drive_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Drive</a>}
          {item.canva_url && <a href={item.canva_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Canva</a>}
          {source?.source_url && <a href={source.source_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>monday</a>}
          <Link href="?nieuw=taak">Taak toevoegen</Link>
          <Link className="primary" href="?bewerken=1">Bewerken</Link>
        </div>
      </header>
      <div className="project-detail-body">
        {query.fout && <div className="error-note">Wijziging mislukt ({query.fout}).</div>}
        {query.succes && <div className="success">{query.succes === "goedkeuring-aangevraagd" ? "Ter goedkeuring voorgelegd." : "Contentitem opgeslagen."}</div>}
        {query.bewerken && <FormModal title="Content bewerken"><ContentForm action={updateContent} content={item} projects={projects ?? []}/></FormModal>}
        {query.nieuw === "taak" ? <TaskCreateModal returnTo={`/app/content/${id}`} projects={projects ?? []} people={people} defaultProjectId={item.project_id} contextEntityType="content" contextEntityId={id}/> : null}
        <section className="content-summary">
          <article><span>Type</span><strong>{contentTypes[item.content_type as keyof typeof contentTypes] ?? item.content_type}</strong></article>
          <article><span>Status</span><strong>{contentStatuses[item.status as keyof typeof contentStatuses] ?? item.status}</strong></article>
          <article><span>Goedkeuring</span><strong>{approvalStatuses[item.approval_status as keyof typeof approvalStatuses] ?? item.approval_status}</strong></article>
          <article><span>Project</span><strong>{item.projects?.title ?? "Niet gekoppeld"}</strong></article>
          <article><span>Deadline</span><strong>{item.deadline ?? "Niet bepaald"}</strong></article>
          <article><span>Publicatie</span><strong>{item.publication_at ? new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.publication_at)) : "Niet gepland"}</strong></article>
        </section>
        <ApprovalPanel entityType="content" entityId={id} sourceHref={`/app/content/${id}`} title="Contentgoedkeuring"/>
        <section className="form-card">
          <div className="form-heading"><h2>Kanalen en links</h2></div>
          <div className="content-meta">
            <div><span>Hoofdkanaal</span><strong>{item.primary_channel ?? "Niet bepaald"}</strong></div>
            <div><span>Kanalen</span><strong>{item.channels.length ? item.channels.join(", ") : "Geen kanalen gekozen"}</strong></div>
            <div><span>Publicatielink</span>{item.publication_url ? <a href={item.publication_url} target="_blank" rel="noreferrer">Open publicatie</a> : <strong>Nog niet gepubliceerd</strong>}</div>
          </div>
        </section>
        <RecordConnectionsPanel entityType="content" entityId={id} links={connections.links} documents={connections.documents} relationships={connections.relationships} options={relationOptions} canManage={canManage} modal={query.koppeling} selectedLinkId={query.link}/>
        <RecordLifecyclePanel entity="content" id={id} label="Contentitem" isArchived={item.status === "archived"} canManage={canManage}/>
      </div>
    </AppShell>
  );
}
