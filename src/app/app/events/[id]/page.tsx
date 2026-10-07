import { eventDossierTabs, resolveEventDossierTab } from "@/lib/event-dossier-tabs";
import { toPersonPickerOptions } from "@/lib/person-picker";
import Link from "next/link";
import { CalendarSync, ExternalLink, FilePlus2, FolderInput, FolderPlus, Link2 } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EmailCommunicationPanel } from "@/components/email-communication-panel";
import { RecordLifecyclePanel } from "@/components/record-lifecycle-panel";
import { RecordConnectionsPanel } from "@/components/record-connections-panel";
import { EventForm, eventStatuses, eventTypes } from "@/components/event-form";
import { FormModal } from "@/components/form-modal";
import { MarkdownContent } from "@/components/markdown-field";
import { RecordMetadata } from "@/components/record-metadata";
import { TaskCreateModal } from "@/components/task-create-modal";
import { FinancialSummaryPanel } from "@/components/financial-summary-panel";
import { OperationalRecordForm } from "@/components/operational-record-form";
import { PeopleAssignmentsPanel } from "@/components/people-assignments-panel";
import { requireActiveMembership } from "@/lib/auth-context";
import { formatDateTime, formatEventEndpoint } from "@/lib/format";
import { loadDossierConnections, loadRelationOptions } from "@/lib/dossier-relations";
import { previewEventDriveStructure } from "@/lib/google-workspace";
import { saveEvent } from "../actions";
import { createOperationalRecord } from "../../operations/actions";
import { createEventFolder, linkEventFolder, organizeEventFolder } from "./actions";
import { generateEventDossier } from "@/app/app/google-document-actions";
import { syncEventToGoogleCalendar } from "../calendar-actions";
import { hasPermission } from "@/lib/permissions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { cancelEvent } from "../actions";

type DriveLink = {
  web_url: string;
  google_id: string;
};

type CalendarLink = {
  google_id: string;
  name: string;
  web_url: string;
  updated_at: string;
};

const driveErrors: Record<string, string> = {
  "drive-bestaande-link": "De bestaande Drive-map is niet bereikbaar voor de BESC Google-koppeling. Deel de map met het Google-serviceaccount of maak een nieuwe eventmap.",
  "drive-aanmaken": "De eventmap kon niet worden aangemaakt. Controleer de Google Workspace-integratie en rechten op de BESC-hoofdmap.",
  "drive-link": "De opgegeven Drive-link bevat geen herkenbaar map-ID.",
  "drive-koppelen": "De gekozen map kon niet worden gelezen of geregistreerd. Er zijn geen basismappen aangemaakt.",
  "drive-gewijzigd": "De gekoppelde map is gewijzigd. Bekijk het overzicht opnieuw vóór aanmaak.",
  "drive-aanvullen": "De basismappen konden niet volledig worden aangevuld of geregistreerd. Bekijk het overzicht opnieuw; eventueel reeds aangemaakte mappen blijven behouden. De eventmap is niet verplaatst.",
  "document-genereren": "Het eventdossier kon niet vanuit het Google-template worden gegenereerd.",
  "kalender-tijden": "Vul eerst een geldige start- én eindtijd in. De eindtijd moet na de starttijd liggen.",
  "kalender-sync": "Het event kon niet met Google Calendar worden gesynchroniseerd. Controleer de kalenderrechten en probeer opnieuw.",
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
  const activeTab = resolveEventDossierTab(q);
  const closeHref = `?tab=${activeTab}`;
  const { supabase, membership } = await requireActiveMembership();
  const canManage = hasPermission(membership, "manageEvents");
  const canManageCampaigns = hasPermission(membership, "manageOrganization");
  const [{ data: e }, { data: projects }, { data: source }, { data: driveRow }, { data: documentRow }, { data: calendarRow }, { data: memberRows }, { data: budgetRows }, { data: expenseRows }, { data: incomeRows }, { data: partners }, { data: assignmentRows }, { data: centralPeopleRows, error: centralPeopleError }] = await Promise.all([
    supabase.from("events").select("*").eq("organization_id", membership.organization_id).eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("projects").select("id,title").eq("organization_id", membership.organization_id).is("deleted_at", null).order("title"),
    supabase.from("migration_source_links").select("source_url").eq("target_table", "events").eq("target_id", id).limit(1).maybeSingle(),
    supabase.from("google_resource_links").select("google_id,name,web_url,drive_id").eq("organization_id", membership.organization_id).eq("entity_type", "event").eq("entity_id", id).eq("resource_type", "folder").maybeSingle(),
    supabase.from("google_resource_links").select("name,web_url").eq("organization_id", membership.organization_id).eq("entity_type", "event").eq("entity_id", id).eq("resource_type", "document").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("google_resource_links").select("google_id,name,web_url,updated_at").eq("organization_id", membership.organization_id).eq("entity_type", "event").eq("entity_id", id).eq("resource_type", "calendar_event").maybeSingle(),
    supabase.from("organization_members").select("user_id,profiles(display_name)").eq("organization_id", membership.organization_id).eq("status", "active"),
    supabase.from("budget_envelopes").select("id,name,planned_amount,status").eq("organization_id", membership.organization_id).eq("event_id", id).is("deleted_at", null).order("created_at"),
    supabase.from("expenses").select("id,title,amount,status").eq("organization_id", membership.organization_id).eq("event_id", id).is("deleted_at", null).order("expense_date", { ascending: false }),
    supabase.from("income_entries").select("id,title,amount,status").eq("organization_id", membership.organization_id).eq("event_id", id).is("deleted_at", null).order("expected_date", { ascending: false }),
    supabase.from("partners").select("id,name").eq("organization_id", membership.organization_id).is("deleted_at", null).order("name"),
    supabase.from("community_assignments").select("id,person_id,role_name,status,starts_at,notes,community_people(display_name)").eq("organization_id", membership.organization_id).eq("event_id", id).order("starts_at", { ascending: true, nullsFirst: false }),
    supabase.from("community_people").select("id,display_name,handle,discord_handle,community_person_roles(role)").eq("organization_id", membership.organization_id).is("deleted_at", null).neq("status", "archived").order("display_name"),
  ]);
  if (!e) notFound();
  const [connections, relationOptions] = await Promise.all([
    loadDossierConnections(supabase, membership.organization_id, "event", id),
    loadRelationOptions(supabase, membership.organization_id, "event", id),
  ]);
  const drive = driveRow as DriveLink | null;
  let structurePreview: Awaited<ReturnType<typeof previewEventDriveStructure>> | null = null;
  let structureError = false;
  if (canManage && q.drivePreview === "1" && drive?.google_id) {
    try { structurePreview = await previewEventDriveStructure(drive.google_id); } catch { structureError = true; }
  }
  const project = (projects ?? []).find((item) => item.id === e.project_id);
  const driveUrl = drive?.web_url || e.drive_url;
  const calendar = calendarRow as CalendarLink | null;
  const people = (memberRows ?? []).map((member) => ({ id: member.user_id, label: (member.profiles as { display_name?: string } | null)?.display_name ?? "Naamloos account" }));
  const calendarIsCurrent = calendar
    ? new Date(calendar.updated_at).getTime() >= new Date(e.updated_at).getTime()
    : false;

  return (
    <AppShell active="Events">
      <header className="project-detail-head">
        <div>
          <Link href="/app/events">← Alle events</Link>
          <span className="eyebrow">EVENTDOSSIER</span>
          <h1>{e.title}</h1>
          <p>{eventTypes[e.event_type as keyof typeof eventTypes]} · {eventStatuses[e.status as keyof typeof eventStatuses]}</p>
        </div>
        <div className="project-actions">
          {canManageCampaigns && <Link href={`/app/rapportage/events/${id}`}>Eventrapport</Link>}
          {canManage && <Link className="primary" href={`?tab=${activeTab}&bewerken=1`}>Bewerken</Link>}
        </div>
      </header>
      <nav className="event-dossier-tabs" aria-label="Onderdelen van het event">
        {eventDossierTabs.map(tab => <Link key={tab.id} href={`?tab=${tab.id}`} scroll={false} aria-current={activeTab === tab.id ? "page" : undefined}>{tab.label}</Link>)}
      </nav>
      <div className="project-detail-body event-dossier">
        {q.succes && <div className="success">{q.succes.startsWith("kalender-") ? `Google Calendar is ${q.succes === "kalender-created" ? "gekoppeld" : "bijgewerkt"}.` : q.succes === "geannuleerd" ? "Event geannuleerd." : q.succes === "drive-geordend" ? "De mapstructuur is gecontroleerd en de eventmap staat onder Google Drive → Events." : q.succes === "drive-al-geordend" ? "De mapstructuur is gecontroleerd. De eventmap stond al onder Google Drive → Events." : q.succes === "drive-aangevuld" ? "Ontbrekende basismappen toegevoegd. De eventmap bleef op haar bestaande plek." : q.succes === "drive" ? "Drive-map gekoppeld." : "Event opgeslagen."}</div>}
        {q.waarschuwing === "kalender-sync" && <div className="error-note">Het event is opgeslagen, maar Google Calendar kon niet automatisch worden bijgewerkt. Gebruik hieronder “Opnieuw synchroniseren”.</div>}
        {q.fout && <div className="error-note">{driveErrors[q.fout] ?? "Opslaan mislukt."}</div>}
        {q.bewerken && canManage && (
          <FormModal title="Event bewerken" closeHref={closeHref}>
            <EventForm action={saveEvent} event={{...e, calendar_removed: calendar?.name.startsWith("[VERWIJDERD]")}} projects={projects ?? []}/>
          </FormModal>
        )}
        {q.nieuw === "taak" ? <TaskCreateModal closeHref="?tab=planning" returnTo={`/app/events/${id}`} projects={projects ?? []} people={people} defaultProjectId={e.project_id} contextEntityType="event" contextEntityId={id}/> : null}
        {q.nieuw === "campagne" && canManageCampaigns ? <FormModal title="Nieuwe campagne voor dit event" closeHref={closeHref}><OperationalRecordForm action={createOperationalRecord} module="campagnes" record={{ event_id: id, project_id: e.project_id }} projects={projects ?? []} partners={partners ?? []} events={[{ id, title: e.title }]} returnTo={`/app/events/${id}`}/></FormModal> : null}
        {activeTab === "overzicht" && <>
        <section className="form-card record-overview">
          <div className="form-heading"><div><span className="eyebrow">OVERZICHT</span><h2>Eventgegevens</h2></div></div>
          {e.description ? <MarkdownContent>{e.description}</MarkdownContent> : <p>Nog geen eventbeschrijving.</p>}
          <RecordMetadata items={[
            { label: "Type", value: eventTypes[e.event_type as keyof typeof eventTypes] },
            { label: "Status", value: eventStatuses[e.status as keyof typeof eventStatuses] },
            { label: "Prioriteit", value: ({ low: "Laag", normal: "Normaal", high: "Hoog", urgent: "Urgent" } as Record<string, string>)[e.priority] ?? e.priority },
            { label: "Rol BESC", value: ({ organizer: "Organisator", partner: "Partner", promoter: "Promotor", participant: "Deelnemer" } as Record<string, string>)[e.role_besc] ?? e.role_besc },
            { label: "Start", value: formatEventEndpoint(e, "start", e.status === "completed" ? "Datum onbekend" : "Niet gepland") },
            { label: "Einde", value: formatEventEndpoint(e, "end", e.status === "completed" ? "Datum onbekend" : "Niet gepland") },
            { label: "Locatie", value: e.is_online ? (e.location ? `Online · ${e.location}` : "Online") : e.location ?? "Niet bepaald" },
            { label: "Verwachte deelnemers", value: e.expected_attendees ?? "Niet bepaald" },
            { label: "Project", value: project ? <Link href={`/app/projecten/${project.id}`}>{project.title}</Link> : "Geen project" },
          ]}/>
        </section>
        <div className="event-tab-actions">{canManage && !["cancelled", "archived", "completed"].includes(e.status) && <form action={cancelEvent}><input type="hidden" name="id" value={id}/><ConfirmSubmitButton className="danger-button" message="Dit event annuleren? Het event blijft bewaard en wordt als geannuleerd zichtbaar in Google Calendar.">Event annuleren</ConfirmSubmitButton></form>}</div>
        <RecordLifecyclePanel entity="event" id={id} label="Event" isArchived={e.status === "archived"} canManage={canManage}/>
        </>}
        {activeTab === "planning" && <>
          <div className="event-tab-actions"><Link href="?tab=planning&nieuw=taak">Taak toevoegen</Link>{canManageCampaigns && <Link href="?tab=planning&nieuw=campagne">Campagne toevoegen</Link>}</div>
        <PeopleAssignmentsPanel entityType="event" entityId={id} assignments={(assignmentRows ?? []) as never[]} people={toPersonPickerOptions(centralPeopleRows ?? [])} peopleError={Boolean(centralPeopleError)} canManage={canManage} closeHref="?tab=planning" selected={q.betrokkene}/>
          <section className="form-card event-tab-placeholder"><h2>Schema en shifts</h2><p>Hier komen het dagschema, streamschema, draaiboek en de crewshifts. Je kunt nu al betrokkenen en hun rollen beheren.</p></section>
        </>}
        {activeTab === "materialen" && <section className="form-card event-tab-placeholder"><h2>Materialenlijst</h2><p>De materialenlijst per event wordt in de volgende stap toegevoegd.</p><Link className="row-action" href="/app/materialen">Materialenregister openen</Link></section>}
        {activeTab === "giveaways" && <section className="form-card event-tab-placeholder"><h2>Giveaway-items</h2><p>Het beheer van items, aantallen en uitdeling wordt in een volgende stap toegevoegd.</p></section>}
        {activeTab === "inschrijvingen" && <section className="form-card event-tab-placeholder"><h2>Inschrijvingen</h2>{e.eventbrite_url ? <><p>Er is een Eventbrite-link bij dit event geregistreerd.</p><a className="row-action" href={e.eventbrite_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Eventbrite openen</a></> : <p>Er is geen Eventbrite-link geregistreerd. De keuze om met of zonder inschrijvingen te werken wordt in een volgende stap toegevoegd.</p>}</section>}
        {activeTab === "financien" && <>
        <FinancialSummaryPanel budgets={budgetRows ?? []} expenses={expenseRows ?? []} income={incomeRows ?? []}/>
        </>}
        {activeTab === "documenten" && <>
          <div className="event-tab-actions">
          {driveUrl && <a href={driveUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Drive</a>}
          {source?.source_url && <a href={source.source_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>monday</a>}
          {!documentRow && <form action={generateEventDossier}><input type="hidden" name="event_id" value={id}/><button><FilePlus2 size={16}/>Genereer eventdossier</button></form>}
          </div>
        <RecordConnectionsPanel entityType="event" entityId={id} links={connections.links} documents={connections.documents} relationships={connections.relationships} options={relationOptions} canManage={canManage} queryContext="tab=documenten" modal={q.koppeling} selectedLinkId={q.link}/>
        <section className="form-card">
          <div className="form-heading">
            <div><span className="eyebrow">GOOGLE CALENDAR</span><h2>Kalendersynchronisatie</h2></div>
            {calendar && !calendar.name.startsWith("[VERWIJDERD]") && <a href={calendar.web_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Open afspraak</a>}
          </div>
          {calendar ? (
              <RecordMetadata items={[
                { label: "Status", value: calendar.name.startsWith("[VERWIJDERD]") ? "Verwijderd uit Google Calendar" : calendarIsCurrent ? "Gesynchroniseerd" : "Synchronisatie nodig" },
                { label: "Kalenderitem", value: calendar.name.replace("[VERWIJDERD] ", "") },
                { label: "Laatste synchronisatie", value: formatDateTime(calendar.updated_at) },
              ]}/>
          ) : (
            <p>Dit event staat nog niet in de gedeelde BESC-kalender. Start- en eindtijd zijn verplicht.</p>
          )}
          {(!e.start_at || !e.end_at) && <p className="form-hint">Datum kan zonder tijd worden bewaard. Google Calendar wordt pas bijgewerkt als beide tijden bekend zijn; een bestaande afspraak blijft behouden.</p>}
          <form className="drive-organize-action" action={syncEventToGoogleCalendar}>
            <input type="hidden" name="event_id" value={id}/>
            <button disabled={!e.start_at || !e.end_at}><CalendarSync size={15}/>{calendar ? "Opnieuw synchroniseren" : "Publiceren naar Google Calendar"}</button>
          </form>
        </section>
        <section className="form-card">
          <div className="form-heading">
            <div><span className="eyebrow">GOOGLE WORKSPACE</span><h2>Eventmap</h2></div>
             {driveUrl && <a className="row-action" href={driveUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Open map</a>}
          </div>
          {drive ? (
            <div><strong>Drive-map gekoppeld</strong><p>De bestaande map en haar inhoud blijven op hun huidige plek.</p>
              {canManage && <Link href="?tab=documenten&drivePreview=1"><FolderInput size={15}/>Ontbrekende basismappen bekijken</Link>}
              {structureError && <p className="error-note">De mapinhoud kon niet worden gecontroleerd. Er is niets aangemaakt.</p>}
              {structurePreview && <div><p>{structurePreview.missing.length ? "Na bevestiging worden uitsluitend deze basismappen toegevoegd:" : "Alle basismappen zijn aanwezig. Er is niets aan te maken."}</p>
                <ul>{structurePreview.missing.map(name => <li key={name}>{name}</li>)}</ul>
                {!!structurePreview.missing.length && <form action={organizeEventFolder}><input type="hidden" name="event_id" value={id}/><input type="hidden" name="confirm_structure" value="yes"/><input type="hidden" name="expected_folder_id" value={structurePreview.folder.id}/><input type="hidden" name="expected_missing" value={JSON.stringify(structurePreview.missing)}/><ConfirmSubmitButton message={`Basismappen toevoegen: ${structurePreview.missing.join(", ")}? De bestaande map wordt niet verplaatst.`}>Deze basismappen aanmaken</ConfirmSubmitButton></form>}
              </div>}
            </div>
          ) : (
            <div className="drive-link-options">
              <div>
                <p>{e.drive_url ? "Registreer de oudere eventmap zonder bestanden of mappen te wijzigen." : "Maak een eventmap met Planning, Communicatie, Partners, Financiën en Evaluatie."}</p>
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
                <p>Koppel een bestaande Drive-map zonder bestanden te verplaatsen of submappen aan te maken.</p>
                <form className="milestone-add" action={linkEventFolder}>
                  <input type="hidden" name="event_id" value={id}/>
                  <input name="drive_folder" placeholder="Drive-maplink of map-ID" required/>
                  <button><Link2 size={15}/>Alleen koppelen</button>
                </form>
              </div>
            </div>
          )}
        </section>
        </>}
        {activeTab === "communicatie" && <>
        <EmailCommunicationPanel entityType="event" entityId={id}/>
        </>}
      </div>
    </AppShell>
  );
}
