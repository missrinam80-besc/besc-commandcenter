import Link from "next/link";
import { ExternalLink, FilePlus2, FolderInput, FolderPlus, Link2 } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EventForm, eventStatuses, eventTypes } from "@/components/event-form";
import { requireActiveMembership } from "@/lib/auth-context";
import { eventDriveSubfolders } from "@/lib/google-workspace";
import { saveEvent } from "../actions";
import { createEventFolder, linkEventFolder, organizeEventFolder } from "./actions";
import { generateEventDossier } from "@/app/app/google-document-actions";

type DriveLink = {
  google_id: string;
  name: string;
  web_url: string;
  drive_id: string | null;
};

const driveErrors: Record<string, string> = {
  "drive-bestaande-link": "De bestaande Drive-map is niet bereikbaar voor de BESC Google-koppeling. Deel de map met het Google-serviceaccount of maak een nieuwe eventmap.",
  "drive-aanmaken": "De eventmap kon niet worden aangemaakt. Controleer de Google Workspace-integratie en rechten op de BESC-hoofdmap.",
  "drive-link": "De opgegeven Drive-link bevat geen herkenbaar map-ID.",
  "drive-koppelen": "De gekozen map kon niet worden gekoppeld of de basisstructuur kon niet worden gemaakt.",
  "drive-verplaatsen": "De eventmap kon niet onder de modulemap Events worden geplaatst.",
  "document-genereren": "Het eventdossier kon niet vanuit het Google-template worden gegenereerd.",
};

export default async function Event({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  const [{ data: e }, { data: projects }, { data: source }, { data: driveRow }, { data: documentRow }] = await Promise.all([
    supabase.from("events").select("*").eq("organization_id", membership.organization_id).eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("projects").select("id,title").eq("organization_id", membership.organization_id).is("deleted_at", null).order("title"),
    supabase.from("migration_source_links").select("source_url").eq("target_table", "events").eq("target_id", id).limit(1).maybeSingle(),
    supabase.from("google_resource_links").select("google_id,name,web_url,drive_id").eq("organization_id", membership.organization_id).eq("entity_type", "event").eq("entity_id", id).eq("resource_type", "folder").maybeSingle(),
    supabase.from("google_resource_links").select("name,web_url").eq("organization_id", membership.organization_id).eq("entity_type", "event").eq("entity_id", id).eq("resource_type", "document").maybeSingle(),
  ]);
  if (!e) notFound();
  const drive = driveRow as DriveLink | null;

  return (
    <AppShell active="Events">
      <header className="project-detail-head">
        <div>
          <Link href="/app/events">← Alle events</Link>
          <span className="eyebrow">EVENTDOSSIER</span>
          <h1>{e.title}</h1>
          <p>{e.description || "Nog geen eventbeschrijving."}</p>
        </div>
        <div className="project-actions">
          {e.drive_url && <a href={e.drive_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Drive</a>}
          {e.eventbrite_url && <a href={e.eventbrite_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Eventbrite</a>}
          {source?.source_url && <a href={source.source_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>monday</a>}
          {!documentRow && <form action={generateEventDossier}><input type="hidden" name="event_id" value={id}/><button><FilePlus2 size={16}/>Genereer eventdossier</button></form>}
          <Link className="primary" href="?bewerken=1">Bewerken</Link>
        </div>
      </header>
      <div className="project-detail-body">
        {q.succes && <div className="success">Event opgeslagen.</div>}
        {q.fout && <div className="error-note">{driveErrors[q.fout] ?? "Opslaan mislukt."}</div>}
        {q.bewerken && (
          <section className="form-card">
            <div className="form-heading"><h2>Event bewerken</h2><Link href="?">Sluiten</Link></div>
            <EventForm action={saveEvent} event={e} projects={projects ?? []}/>
          </section>
        )}
        <section className="content-summary">
          <article><span>Type</span><strong>{eventTypes[e.event_type as keyof typeof eventTypes]}</strong></article>
          <article><span>Status</span><strong>{eventStatuses[e.status as keyof typeof eventStatuses]}</strong></article>
          <article><span>Rol BESC</span><strong>{e.role_besc}</strong></article>
          <article><span>Start</span><strong>{e.start_at ? new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(e.start_at)) : "Niet gepland"}</strong></article>
          <article><span>Locatie</span><strong>{e.is_online ? "Online" : e.location ?? "Niet bepaald"}</strong></article>
          <article><span>Deelnemers</span><strong>{e.expected_attendees ?? "Niet bepaald"}</strong></article>
        </section>
        {documentRow && <section className="form-card"><div className="form-heading"><h2>Google-document</h2><a href={documentRow.web_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> {documentRow.name}</a></div><p>Gegenereerd vanuit het eventtemplate. Alleen de link en metadata staan in het Command Center.</p></section>}
        <section className="form-card">
          <div className="form-heading">
            <div><span className="eyebrow">GOOGLE WORKSPACE</span><h2>Eventmap</h2></div>
            {e.drive_url && <a className="row-action" href={e.drive_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Open map</a>}
          </div>
          {drive ? (
            <>
              <div className="content-meta">
                <div><span>Mapnaam</span><strong>{drive.name}</strong></div>
                <div><span>Opslagstructuur</span><strong>BESC-hoofdmap / Events / {drive.name}</strong></div>
                <div><span>Basismappen</span><strong>{eventDriveSubfolders.join(", ")}</strong></div>
              </div>
              <form className="drive-organize-action" action={organizeEventFolder}>
                <input type="hidden" name="event_id" value={id}/>
                <button><FolderInput size={15}/>Controleer structuur en plaats onder Events</button>
              </form>
            </>
          ) : (
            <div className="drive-link-options">
              <div>
                <p>{e.drive_url ? "Registreer de oudere eventmap en voeg de ontbrekende basismappen toe." : "Maak een eventmap met Planning, Communicatie, Partners, Financiën en Evaluatie."}</p>
                <form action={createEventFolder}>
                  <input type="hidden" name="event_id" value={id}/>
                  <input type="hidden" name="mode" value={e.drive_url ? "existing" : "new"}/>
                  <button className="primary"><FolderPlus size={16}/>{e.drive_url ? "Bestaande map registreren" : "Eventmap aanmaken"}</button>
                </form>
                {e.drive_url && (
                  <form className="drive-new-folder" action={createEventFolder}>
                    <input type="hidden" name="event_id" value={id}/>
                    <input type="hidden" name="mode" value="new"/>
                    <button><FolderPlus size={16}/>Nieuwe map onder Events maken</button>
                  </form>
                )}
              </div>
              <div>
                <p>Of koppel een andere bestaande Drive-map; ontbrekende basismappen worden automatisch toegevoegd.</p>
                <form className="milestone-add" action={linkEventFolder}>
                  <input type="hidden" name="event_id" value={id}/>
                  <input name="drive_folder" placeholder="Drive-maplink of map-ID" required/>
                  <button><Link2 size={15}/>Koppelen</button>
                </form>
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
