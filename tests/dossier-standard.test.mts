import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("de dossierstandaard biedt gedeelde metadata en compacte lifecycle-acties", async () => {
  const [metadata, lifecycle] = await Promise.all([
    source("src/components/record-metadata.tsx"),
    source("src/components/record-lifecycle-panel.tsx"),
  ]);
  assert.match(metadata, /record-metadata/);
  assert.match(lifecycle, /lifecycle-panel-compact/);
  assert.match(lifecycle, /pattern="VERWIJDER"/);
});

test("projecten tonen volledige metadata met lokaal geformatteerde datums", async () => {
  const [project, format] = await Promise.all([
    source("src/app/app/projecten/[id]/page.tsx"),
    source("src/lib/format.ts"),
  ]);
  assert.match(project, /RecordMetadata/);
  assert.match(project, /formatDate\(project\.start_date\)/);
  assert.match(project, /formatDateTime\(task\.due_at\)/);
  assert.doesNotMatch(project, /Google-ID/);
  assert.doesNotMatch(project, /name="drive_url"/);
  assert.match(format, /Intl\.DateTimeFormat\("nl-BE"/);
});

test("projecttaken en mijlpalen zijn vanuit het project bewerkbaar", async () => {
  const [project, actions, taskActions] = await Promise.all([
    source("src/app/app/projecten/[id]/page.tsx"),
    source("src/app/app/projecten/[id]/actions.ts"),
    source("src/app/app/taken/[id]/actions.ts"),
  ]);
  assert.match(project, /selectedTask/);
  assert.match(project, /selectedMilestone/);
  assert.match(actions, /updateMilestone/);
  assert.match(actions, /deleteMilestone/);
  assert.match(taskActions, /return_to/);
});

test("het taakdossier gebruikt compacte beheeracties zonder zichtbare activiteitensectie", async () => {
  const task = await source("src/app/app/taken/[id]/page.tsx");
  assert.match(task, /lifecycle-panel-compact/);
  assert.doesNotMatch(task, /ActivityTimeline/);
});

test("events en campagnes gebruiken dezelfde metadata- en datumstandaard", async () => {
  const [event, eventForm, operational] = await Promise.all([
    source("src/app/app/events/[id]/page.tsx"),
    source("src/components/event-form.tsx"),
    source("src/components/operational-record-detail.tsx"),
  ]);
  assert.match(event, /RecordMetadata/);
  assert.match(event, /formatEventEndpoint\(e, "start"/);
  assert.doesNotMatch(eventForm, /<label>Drive-map/);
  assert.match(operational, /campaignMetadata/);
  assert.match(operational, /formatCurrency/);
  assert.match(operational, /item\.campaign_id === id/);
});

test("projecten, events en campagnes delen gelabelde links en tweerichtingsrelaties", async () => {
  const [project, event, operational, panel, relations] = await Promise.all([
    source("src/app/app/projecten/[id]/page.tsx"),
    source("src/app/app/events/[id]/page.tsx"),
    source("src/components/operational-record-detail.tsx"),
    source("src/components/record-connections-panel.tsx"),
    source("src/lib/dossier-relations.ts"),
  ]);
  assert.match(project, /RecordConnectionsPanel entityType="project"/);
  assert.match(event, /RecordConnectionsPanel entityType="event"/);
  assert.match(operational, /connectionEntity = module === "campagnes" \? "campaign"/);
  assert.match(operational, /RecordConnectionsPanel entityType=\{connectionEntity\}/);
  assert.match(panel, /De relatie wordt automatisch ook op het andere dossier zichtbaar/);
  assert.match(relations, /source_type\.eq/);
  assert.match(relations, /target_type\.eq/);
});

test("dossierlinks en relaties zijn per organisatie afgeschermd", async () => {
  const migration = await source("supabase/migrations/20260803103432_add_record_links_and_relationships.sql");
  const optimization = await source("supabase/migrations/20260803112000_optimize_record_links_and_relationships.sql");
  assert.match(migration, /enable row level security/);
  assert.match(migration, /private\.is_active_member\(organization_id\)/);
  assert.match(migration, /private\.is_org_manager\(organization_id\)/);
  assert.match(optimization, /revoke all on public\.record_links from authenticated/);
  assert.match(optimization, /record_relationships_created_by_idx/);
});

test("relaties zijn doorzoekbaar en gelabelde links blijven bewerkbaar", async () => {
  const [picker, panel, actions] = await Promise.all([
    source("src/components/searchable-relation-picker.tsx"),
    source("src/components/record-connections-panel.tsx"),
    source("src/app/app/dossier-actions.ts"),
  ]);
  assert.match(picker, /Zoek een dossier/);
  assert.match(picker, /toLocaleLowerCase\("nl-BE"\)/);
  assert.match(panel, /Link bewerken/);
  assert.match(actions, /updateRecordLink/);
});

test("dossiers ondersteunen meerdere Drive-documenten zonder bestanden te kopiëren", async () => {
  const [migration, panel, documents] = await Promise.all([
    source("supabase/migrations/20260803121000_allow_multiple_google_documents_per_record.sql"),
    source("src/components/record-connections-panel.tsx"),
    source("src/app/app/documenten/page.tsx"),
  ]);
  assert.match(migration, /where resource_type in \('folder', 'calendar_event'\)/);
  assert.match(panel, /alleen de naam, link en metadata worden bewaard/);
  assert.match(documents, /linkedDocuments/);
  assert.match(documents, /linked_document/);
});

test("het centrale archief filtert alle kernmodules op status, periode en eigenaar", async () => {
  const [archive, shell] = await Promise.all([
    source("src/app/app/archief/page.tsx"),
    source("src/components/app-shell.tsx"),
  ]);
  assert.match(archive, /Centraal archief/);
  assert.match(archive, /name="owner"/);
  assert.match(archive, /name="vanaf"/);
  assert.match(archive, /deleted_at\.not\.is\.null/);
  assert.match(shell, /label: "Archief", href: "\/app\/archief"/);
});

test("één communitypersoon ondersteunt meerdere rollen en een optionele accountkoppeling", async () => {
  const [migration, form, actions, detail] = await Promise.all([
    source("supabase/migrations/20260803133000_add_central_person_roles_and_account_link.sql"),
    source("src/components/operational-record-form.tsx"),
    source("src/app/app/operations/actions.ts"),
    source("src/components/operational-record-detail.tsx"),
  ]);
  assert.match(migration, /create table public\.community_person_roles/);
  assert.match(migration, /account_user_id uuid references public\.profiles/);
  assert.match(form, /name="roles"/);
  assert.match(form, /name="account_user_id"/);
  assert.match(actions, /formData\.getAll\("roles"\)/);
  assert.match(detail, /Command Center-account/);
});

test("de gedeelde taakmodal ondersteunt project, verantwoordelijke, checklist en dossierrelatie", async () => {
  const [modal, actions, event, content, operational, task] = await Promise.all([
    source("src/components/task-create-modal.tsx"),
    source("src/app/app/actions.ts"),
    source("src/app/app/events/[id]/page.tsx"),
    source("src/app/app/content/[id]/page.tsx"),
    source("src/components/operational-record-detail.tsx"),
    source("src/app/app/taken/[id]/page.tsx"),
  ]);
  assert.match(modal, /name="assignee_id"/);
  assert.match(modal, /name="checklist"/);
  assert.match(modal, /context_entity_type/);
  assert.match(actions, /task_checklist_items/);
  assert.match(actions, /record_relationships/);
  assert.match(event, /TaskCreateModal/);
  assert.match(content, /TaskCreateModal/);
  assert.match(operational, /TaskCreateModal/);
  assert.match(task, /RecordConnectionsPanel entityType="task"/);
});

test("vergadernotulen blijven Drive-documenten en zijn als PDF exporteerbaar", async () => {
  const meeting = await source("src/app/app/vergaderingen/[id]/page.tsx");
  assert.match(meeting, /google_id,name,web_url/);
  assert.match(meeting, /export\?format=pdf/);
  assert.match(meeting, /PDF downloaden/);
});
