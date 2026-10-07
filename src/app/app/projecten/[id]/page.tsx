import { toPersonPickerOptions } from "@/lib/person-picker";
import { ProjectOutcomeFields } from "@/components/project-outcome-fields";
import { missingProjectOutcomes, projectOutcomeLabels, type ProjectOutcomes } from "@/lib/project-outcomes";
import Link from "next/link";
import { ExternalLink, FolderInput, FolderPlus, Link2, Pencil, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/activity-timeline";
import { AppShell } from "@/components/app-shell";
import { Comments } from "@/components/comments";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { FormModal } from "@/components/form-modal";
import { MarkdownContent, MarkdownField } from "@/components/markdown-field";
import { RecordConnectionsPanel } from "@/components/record-connections-panel";
import { RecordLifecyclePanel } from "@/components/record-lifecycle-panel";
import { RecordMetadata } from "@/components/record-metadata";
import { TaskCreateModal } from "@/components/task-create-modal";
import { FinancialSummaryPanel } from "@/components/financial-summary-panel";
import { OperationalRecordForm } from "@/components/operational-record-form";
import { PeopleAssignmentsPanel } from "@/components/people-assignments-panel";
import { requireActiveMembership } from "@/lib/auth-context";
import { formatDate, formatDateTime, formatDateTimeLocal } from "@/lib/format";
import { loadDossierConnections, loadRelationOptions } from "@/lib/dossier-relations";
import { hasPermission } from "@/lib/permissions";
import { updateTaskStatus } from "../../actions";
import { createOperationalRecord } from "../../operations/actions";
import { updateTaskDetails } from "../../taken/[id]/actions";
import {
  addMilestone,
  createProjectFolder,
  deleteMilestone,
  linkProjectFolder,
  organizeProjectFolder,
  setProjectMember,
  toggleMilestone,
  updateMilestone,
  updateProject,
} from "./actions";

type Project = ProjectOutcomes & {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  owner_id: string | null;
  start_date: string | null;
  due_date: string | null;
  drive_url: string | null;
  organization_id: string;
};
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
};
type Milestone = { id: string; title: string; due_date: string | null; is_done: boolean };
type Member = { user_id: string; profiles: { display_name: string | null } | null };
type Comment = { id: string; body: string; created_at: string; profiles: { display_name: string | null } | null };
type DriveLink = { web_url: string; parent_id: string | null };

const labels: Record<string, string> = {
  todo: "Te doen",
  doing: "Bezig",
  waiting: "Wachten",
  review: "Review",
  done: "Afgerond",
  cancelled: "Geannuleerd",
  idea: "Idee",
  planned: "Gepland",
  active: "Actief",
  blocked: "Geblokkeerd",
  archived: "Gearchiveerd",
  low: "Laag",
  normal: "Normaal",
  high: "Hoog",
  urgent: "Urgent",
};
const driveErrors: Record<string, string> = {
  "afsluiting": "Vul projectdoel, op te leveren resultaten, oplevercriteria en afsluitevaluatie in voordat je het project afrondt.",
  "drive-bestaande-link": "De bestaande Drive-map is niet bereikbaar voor de BESC Google-koppeling. Deel de map met de Google-koppeling of maak een nieuwe projectmap.",
  "drive-aanmaken": "De nieuwe projectmap kon niet worden aangemaakt. Controleer de Google Workspace-integratie en rechten op de BESC-hoofdmap.",
  "drive-link": "De opgeslagen Drive-link bevat geen herkenbaar map-ID.",
  "drive-koppelen": "De gekozen map kon niet worden gekoppeld. Controleer of het een map is en of de Google-koppeling toegang heeft.",
  "drive-verplaatsen": "De projectmap kon niet onder de modulemap Projecten worden geplaatst.",
};

export default async function ProjectPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  const canManage = hasPermission(membership, "manageProjects");
  const canManageCampaigns = hasPermission(membership, "manageOrganization");
  const [
    { data: projectRow },
    { data: taskRows },
    { data: milestoneRows },
    { data: memberRows },
    { data: teamRows },
    { data: commentRows },
    { data: activityRows },
    { data: driveRow },
    { data: budgetRows },
    { data: expenseRows },
    { data: incomeRows },
    { data: partnerRows },
    { data: eventRows },
    { data: assignmentRows },
    { data: centralPeopleRows, error: centralPeopleError },
  ] = await Promise.all([
    supabase.from("projects").select("id,title,description,status,priority,owner_id,start_date,due_date,drive_url,organization_id,goal,deliverables,acceptance_criteria,closure_evaluation").eq("organization_id", membership.organization_id).eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("tasks").select("id,title,description,status,priority,due_at").eq("project_id", id).is("deleted_at", null).order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }),
    supabase.from("project_milestones").select("id,title,due_date,is_done").eq("project_id", id).order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("organization_members").select("user_id,profiles(display_name)").eq("organization_id", membership.organization_id).eq("status", "active"),
    supabase.from("project_members").select("user_id").eq("project_id", id),
    supabase.from("comments").select("id,body,created_at,profiles!comments_author_id_fkey(display_name)").eq("entity_type", "project").eq("entity_id", id).order("created_at"),
    supabase.from("activity_events").select("id,action,created_at,profiles!activity_events_actor_id_fkey(display_name)").eq("entity_type", "project").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("google_resource_links").select("web_url,parent_id").eq("organization_id", membership.organization_id).eq("entity_type", "project").eq("entity_id", id).eq("resource_type", "folder").maybeSingle(),
    supabase.from("budget_envelopes").select("id,name,planned_amount,status").eq("organization_id", membership.organization_id).eq("project_id", id).is("deleted_at", null).order("created_at"),
    supabase.from("expenses").select("id,title,amount,status").eq("organization_id", membership.organization_id).eq("project_id", id).is("deleted_at", null).order("expense_date", { ascending: false }),
    supabase.from("income_entries").select("id,title,amount,status").eq("organization_id", membership.organization_id).eq("project_id", id).is("deleted_at", null).order("expected_date", { ascending: false }),
    supabase.from("partners").select("id,name").eq("organization_id", membership.organization_id).is("deleted_at", null).order("name"),
    supabase.from("events").select("id,title").eq("organization_id", membership.organization_id).is("deleted_at", null).order("title"),
    supabase.from("community_assignments").select("id,person_id,role_name,status,starts_at,notes,community_people(display_name)").eq("organization_id", membership.organization_id).eq("project_id", id).order("starts_at", { ascending: true, nullsFirst: false }),
    supabase.from("community_people").select("id,display_name,handle,discord_handle,community_person_roles(role)").eq("organization_id", membership.organization_id).is("deleted_at", null).neq("status", "archived").order("display_name"),
  ]);
  if (!projectRow) notFound();

  const [connections, relationOptions] = await Promise.all([
    loadDossierConnections(supabase, membership.organization_id, "project", id),
    loadRelationOptions(supabase, membership.organization_id, "project", id),
  ]);

  const project = projectRow as Project;
  const tasks = (taskRows ?? []) as Task[];
  const milestones = (milestoneRows ?? []) as Milestone[];
  const people = (memberRows ?? []) as unknown as Member[];
  const teamIds = new Set((teamRows ?? []).map((item) => item.user_id));
  const finishedStatuses = new Set(["done", "cancelled"]);
  const openTasks = tasks.filter((item) => !finishedStatuses.has(item.status));
  const finishedTasks = tasks.filter((item) => finishedStatuses.has(item.status));
  const selectedTask = tasks.find((item) => item.id === query.taak);
  const selectedMilestone = milestones.find((item) => item.id === query.mijlpaal);
  const owner = people.find((person) => person.user_id === project.owner_id);
  const drive = driveRow as DriveLink | null;
  const driveUrl = drive?.web_url || project.drive_url;

  return (
    <AppShell active="Projecten">
      <header className="project-detail-head">
        <div>
          <Link href="/app/projecten">← Alle projecten</Link>
          <span className="eyebrow">PROJECTDOSSIER</span>
          <h1>{project.title}</h1>
          <p>{labels[project.status] ?? project.status} · {owner?.profiles?.display_name || "Geen eigenaar"}</p>
        </div>
        <div className="project-actions">
          {driveUrl ? <a href={driveUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Drive-map</a> : null}
          {canManage ? <Link href="?bewerken=1">Bewerken</Link> : null}
          {canManageCampaigns ? <Link href="?nieuw=campagne"><Plus size={16}/>Campagne</Link> : null}
          <Link className="primary" href="?nieuw=taak"><Plus size={16}/>Taak</Link>
        </div>
      </header>

      <div className="project-detail-body">
        {query.fout ? <div className="error-note">{driveErrors[query.fout] ?? `Actie mislukt: ${query.fout}.`}</div> : null}
        {query.succes === "drive-geordend" ? <div className="success">De mapstructuur is gecontroleerd en de projectmap staat onder Google Drive → Projecten.</div> : null}
        {query.succes === "drive-al-geordend" ? <div className="success">De mapstructuur is gecontroleerd. De projectmap stond al onder Google Drive → Projecten.</div> : null}
        {query.succes && !query.succes.startsWith("drive-") ? <div className="success">Wijziging opgeslagen.</div> : null}

        {query.bewerken && canManage ? (
          <FormModal title="Project bewerken">
            <form action={updateProject}>
              <input type="hidden" name="id" value={id}/>
              <label>Titel<input name="title" defaultValue={project.title}/></label>
              <MarkdownField name="description" label="Beschrijving" rows={6} defaultValue={project.description}/>
              {query.fout === "afsluiting" ? <p className="error-note">{driveErrors.afsluiting}</p> : null}
              <ProjectOutcomeFields project={project}/>
              <div className="form-row">
                <label>Status<select name="status" defaultValue={project.status}><option value="idea">Idee</option><option value="planned">Gepland</option><option value="active">Actief</option><option value="blocked">Geblokkeerd</option><option value="done">Afgerond</option><option value="archived">Gearchiveerd</option></select></label>
                <label>Prioriteit<select name="priority" defaultValue={project.priority}><option value="low">Laag</option><option value="normal">Normaal</option><option value="high">Hoog</option><option value="urgent">Urgent</option></select></label>
                <label>Eigenaar<select name="owner_id" defaultValue={project.owner_id || ""}><option value="">Geen eigenaar</option>{people.map((person) => <option key={person.user_id} value={person.user_id}>{person.profiles?.display_name || "Naamloos account"}</option>)}</select></label>
                <label>Start<input type="date" name="start_date" defaultValue={project.start_date || ""}/></label>
                <label>Deadline<input type="date" name="due_date" defaultValue={project.due_date || ""}/></label>
              </div>
              <div className="form-actions"><Link href="?">Annuleren</Link><button className="primary">Opslaan</button></div>
            </form>
          </FormModal>
        ) : null}

        {query.nieuw === "taak" ? (
          <TaskCreateModal returnTo={`/app/projecten/${id}`} defaultProjectId={id} projects={[{ id, title: project.title }]} people={people.map((person) => ({ id: person.user_id, label: person.profiles?.display_name || "Naamloos account" }))}/>
        ) : null}

        {query.nieuw === "campagne" && canManageCampaigns ? (
          <FormModal title="Nieuwe campagne voor dit project">
            <OperationalRecordForm action={createOperationalRecord} module="campagnes" record={{ project_id: id }} projects={[{ id, title: project.title }]} partners={partnerRows ?? []} events={eventRows ?? []} returnTo={`/app/projecten/${id}`}/>
          </FormModal>
        ) : null}

        {selectedTask ? (
          <FormModal title="Taak bewerken">
            <form action={updateTaskDetails}>
              <input type="hidden" name="id" value={selectedTask.id}/>
              <input type="hidden" name="project_id" value={project.id}/>
              <input type="hidden" name="return_to" value={`/app/projecten/${project.id}`}/>
              <label>Titel<input name="title" defaultValue={selectedTask.title}/></label>
              <MarkdownField name="description" label="Beschrijving" rows={5} defaultValue={selectedTask.description}/>
              <div className="form-row">
                <label>Status<select name="status" defaultValue={selectedTask.status}><option value="todo">Te doen</option><option value="doing">Bezig</option><option value="waiting">Wachten</option><option value="review">Review</option><option value="done">Afgerond</option><option value="cancelled">Geannuleerd</option></select></label>
                <label>Prioriteit<select name="priority" defaultValue={selectedTask.priority}><option value="low">Laag</option><option value="normal">Normaal</option><option value="high">Hoog</option><option value="urgent">Urgent</option></select></label>
                <label>Deadline<input type="datetime-local" name="due_at" defaultValue={formatDateTimeLocal(selectedTask.due_at)}/></label>
              </div>
              <div className="form-actions"><Link href={`/app/taken/${selectedTask.id}`}>Volledig taakdossier</Link><button className="primary">Opslaan</button></div>
            </form>
          </FormModal>
        ) : null}

        {selectedMilestone && canManage ? (
          <FormModal title="Mijlpaal bewerken">
            <form action={updateMilestone}>
              <input type="hidden" name="project_id" value={project.id}/><input type="hidden" name="id" value={selectedMilestone.id}/>
              <label>Titel<input name="title" defaultValue={selectedMilestone.title}/></label>
              <label>Deadline<input type="date" name="due_date" defaultValue={selectedMilestone.due_date || ""}/></label>
              <div className="form-actions"><Link href="?">Annuleren</Link><button className="primary">Opslaan</button></div>
            </form>
            <form className="modal-danger-zone" action={deleteMilestone}>
              <input type="hidden" name="project_id" value={project.id}/><input type="hidden" name="id" value={selectedMilestone.id}/>
              <ConfirmSubmitButton className="danger-button" message="Deze mijlpaal verwijderen?">Mijlpaal verwijderen</ConfirmSubmitButton>
            </form>
          </FormModal>
        ) : null}

        <section className="form-card record-overview">
          <div className="form-heading"><div><span className="eyebrow">OVERZICHT</span><h2>Projectgegevens</h2></div></div>
          {project.description ? <MarkdownContent>{project.description}</MarkdownContent> : <p>Nog geen beschrijving toegevoegd.</p>}
          <RecordMetadata items={[
            { label: "Status", value: labels[project.status] ?? project.status },
            { label: "Prioriteit", value: labels[project.priority] ?? project.priority },
            { label: "Eigenaar", value: owner?.profiles?.display_name || "Niet toegewezen" },
            { label: "Start", value: formatDate(project.start_date) },
            { label: "Deadline", value: formatDate(project.due_date) },
            { label: "Projectteam", value: `${teamIds.size} ${teamIds.size === 1 ? "persoon" : "personen"}` },
          ]}/>
        </section>

        <section className="form-card">
          <div className="form-heading"><div><span className="eyebrow">RESULTAAT & AFSLUITING</span><h2>Doel en oplevering</h2></div></div>
          {Object.entries(projectOutcomeLabels).map(([key, label]) => <div key={key}>
            <h3>{label}</h3>
            {project[key as keyof ProjectOutcomes]?.trim() ? <MarkdownContent>{project[key as keyof ProjectOutcomes]}</MarkdownContent> : <p>Nog niet ingevuld.</p>}
          </div>)}
          {missingProjectOutcomes(project).length ? <p>Voor een nieuwe afsluiting ontbreken: {missingProjectOutcomes(project).join(", ")}. {project.status === "done" ? "Dit eerder afgeronde project behoudt zijn status." : "Je kunt het dossier alvast verder voorbereiden."}</p> : <p>De afsluitinformatie is ingevuld. De bevoegde projectbeheerder beoordeelt de uitkomst; de app bevestigt niet automatisch dat het doel is behaald.</p>}
        </section>

        <RecordConnectionsPanel entityType="project" entityId={id} links={connections.links} documents={connections.documents} relationships={connections.relationships} options={relationOptions} canManage={canManage} modal={query.koppeling} selectedLinkId={query.link}/>
        <PeopleAssignmentsPanel entityType="project" entityId={id} assignments={(assignmentRows ?? []) as never[]} people={toPersonPickerOptions(centralPeopleRows ?? [])} peopleError={Boolean(centralPeopleError)} canManage={canManage} selected={query.betrokkene}/>
        <FinancialSummaryPanel budgets={budgetRows ?? []} expenses={expenseRows ?? []} income={incomeRows ?? []}/>

        <section className="form-card drive-card">
          <div className="form-heading"><div><span className="eyebrow">GOOGLE WORKSPACE</span><h2>Projectmap</h2></div>{driveUrl ? <a className="row-action" href={driveUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Open map</a> : null}</div>
          {drive ? (
            <div className="drive-connected-row"><div><strong>Drive-map gekoppeld</strong><p>De projectbestanden blijven in Google Drive onder de modulemap Projecten.</p></div><form action={organizeProjectFolder}><input type="hidden" name="project_id" value={id}/><button><FolderInput size={15}/>Mapstructuur controleren</button></form></div>
          ) : (
            <div className="drive-link-options"><div><p>{project.drive_url ? "Registreer de bestaande projectmap in de Google-koppeling." : "Maak automatisch een projectmap onder de modulemap Projecten."}</p><form action={createProjectFolder}><input type="hidden" name="project_id" value={id}/><input type="hidden" name="mode" value={project.drive_url ? "existing" : "new"}/><button className="primary"><FolderPlus size={16}/>{project.drive_url ? "Bestaande map registreren" : "Projectmap aanmaken"}</button></form>{project.drive_url ? <form className="drive-new-folder" action={createProjectFolder}><input type="hidden" name="project_id" value={id}/><input type="hidden" name="mode" value="new"/><button><FolderPlus size={16}/>Nieuwe projectmap maken</button></form> : null}</div><div><p>Of koppel een bestaande Google Drive-map.</p><form className="milestone-add" action={linkProjectFolder}><input type="hidden" name="project_id" value={id}/><input name="drive_folder" placeholder="Drive-maplink of map-ID"/><button><Link2 size={15}/>Koppelen</button></form></div></div>
          )}
        </section>

        <div className="project-columns">
          <section className="project-task-section">
            <div className="section-heading"><div><span className="eyebrow">UITVOERING</span><h2>Projecttaken</h2></div><span>{openTasks.length} open</span></div>
            <div className="data-list">{openTasks.length ? openTasks.map((task) => <article key={task.id}><form action={updateTaskStatus}><input type="hidden" name="id" value={task.id}/><input type="hidden" name="status" value="done"/><input type="hidden" name="return_to" value={`/app/projecten/${id}`}/><button aria-label={`${task.title} afronden`} className="check"/></form><div><Link className="task-link" href={`?taak=${task.id}`}><strong>{task.title}</strong></Link><p>{formatDateTime(task.due_at)}</p></div><span className="badge">{labels[task.status] ?? task.status}</span><Link aria-label={`${task.title} bewerken`} className="row-action" href={`?taak=${task.id}`}><Pencil size={13}/></Link></article>) : <div className="empty">Nog geen open taken.</div>}</div>
          </section>
          <aside>
            <section className="form-card">
              <div className="form-heading"><h2>Mijlpalen</h2></div>
              <div className="checklist">{milestones.map((milestone) => <div className="milestone-row" key={milestone.id}>{canManage ? <form action={toggleMilestone}><input type="hidden" name="project_id" value={id}/><input type="hidden" name="id" value={milestone.id}/><input type="hidden" name="is_done" value={String(!milestone.is_done)}/><button aria-label={`${milestone.title} ${milestone.is_done ? "heropenen" : "afronden"}`} className={`check ${milestone.is_done ? "checked" : ""}`}>{milestone.is_done ? "✓" : ""}</button></form> : <span className={`check ${milestone.is_done ? "checked" : ""}`} aria-label={milestone.is_done ? "Afgerond" : "Open"}>{milestone.is_done ? "✓" : ""}</span>}<span className={milestone.is_done ? "done" : ""}>{milestone.title}<small>{formatDate(milestone.due_date, "Geen deadline")}</small></span>{canManage ? <Link aria-label={`${milestone.title} bewerken`} href={`?mijlpaal=${milestone.id}`}><Pencil size={13}/></Link> : null}</div>)}</div>
              {canManage ? <form className="milestone-add" action={addMilestone}><input type="hidden" name="project_id" value={id}/><input name="title" placeholder="Nieuwe mijlpaal"/><input type="date" name="due_date"/><button>Toevoegen</button></form> : null}
            </section>
            <section className="form-card">
              <div className="form-heading"><h2>Projectaccounts</h2></div>
              <div className="team-list">{people.map((person) => { const enabled = teamIds.has(person.user_id); return <form action={setProjectMember} key={person.user_id}><input type="hidden" name="project_id" value={id}/><input type="hidden" name="user_id" value={person.user_id}/><input type="hidden" name="enabled" value={String(!enabled)}/><span>{person.profiles?.display_name || "Naamloos"}</span>{canManage ? <button className={enabled ? "member-on" : ""}>{enabled ? "In team" : "Toevoegen"}</button> : <span>{enabled ? "In team" : "Niet in team"}</span>}</form>; })}</div>
            </section>
          </aside>
        </div>

        {finishedTasks.length ? <section className="completed-section"><div><span className="eyebrow">HISTORIEK</span><h2>Afgeronde en geannuleerde taken</h2></div><div className="data-list completed-list">{finishedTasks.map((task) => <article key={task.id}><span className="check checked">✓</span><div><Link className="task-link" href={`?taak=${task.id}`}><strong>{task.title}</strong></Link><p>{labels[task.status] ?? task.status}</p></div><span className="badge">{labels[task.status] ?? task.status}</span><Link aria-label={`${task.title} bekijken`} className="row-action" href={`?taak=${task.id}`}><Pencil size={13}/></Link></article>)}</div></section> : null}
        <Comments entityType="project" entityId={id} returnTo={`/app/projecten/${id}`} comments={(commentRows ?? []) as unknown as Comment[]}/>
        <ActivityTimeline events={(activityRows ?? []) as never[]}/>
        <RecordLifecyclePanel entity="project" id={id} label="Project" isArchived={project.status === "archived"} canManage={canManage}/>
      </div>
    </AppShell>
  );
}
