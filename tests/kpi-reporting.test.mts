import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("KPI-registraties koppelen bron, definitie en alle relevante dossiers", async () => {
  const [migration, peopleMigration, form, actions, detail] = await Promise.all([
    source("supabase/migrations/20260803180000_deepen_kpi_relations.sql"),
    source("supabase/migrations/20260803183000_add_kpi_people.sql"),
    source("src/components/kpi-form.tsx"),
    source("src/app/app/rapportage/actions.ts"),
    source("src/app/app/rapportage/[id]/page.tsx"),
  ]);
  assert.match(migration, /task_id uuid references public\.tasks/);
  assert.match(migration, /collection_method in \('manual', 'imported', 'api'\)/);
  for (const field of ["project_id", "campaign_id", "event_id", "content_id", "partner_id", "task_id", "community_person_id", "social_post_id"]) {
    assert.match(form, new RegExp(`name=["']${field}["']`));
    assert.match(actions, new RegExp(`${field}: values\\.${field} \\|\\| null`));
  }
  assert.match(peopleMigration, /community_person_id uuid references public\.community_people/);
  assert.match(form, /name="metric_definition"/);
  assert.match(detail, /Verzamelmethode/);
});

test("social inzichten koppelen publicaties aan controleerbare KPI-metingen",async()=>{const[page,route,migration]=await Promise.all([source("src/app/app/rapportage/social/page.tsx"),source("src/app/app/rapportage/social/export/route.ts"),source("supabase/migrations/20260803193000_link_kpis_to_social_posts.sql")]);assert.match(migration,/social_post_id uuid references public\.social_posts/);assert.match(page,/PLATFORMOVERZICHT/);assert.match(page,/collection_method/);assert.match(page,/ManagementReportActions/);assert.match(route,/Content-Disposition/)});

test("sponsorrapport is online, afdrukbaar en als CSV beschikbaar", async () => {
  const [overview, page, detail, exportRoute] = await Promise.all([
    source("src/app/app/rapportage/sponsors/page.tsx"),
    source("src/app/app/rapportage/sponsors/[id]/page.tsx"),
    source("src/components/operational-record-detail.tsx"),
    source("src/app/app/rapportage/sponsors/[id]/export/route.ts"),
  ]);
  assert.match(overview, /ReportSelector/);
  assert.match(overview, /basePath="\/app\/rapportage\/sponsors"/);
  assert.match(page, /ManagementReportActions/);
  assert.match(page, /FINANCIËLE REALISATIE/);
  assert.match(page, /CREATORS & STREAMERS/);
  assert.match(page, /\["admin", "board", "member"\]/);
  assert.match(detail, /Sponsorrapport/);
  assert.match(exportRoute, /Content-Disposition/);
  assert.match(exportRoute, /collection_method/);
  assert.match(exportRoute, /\["admin", "board", "member"\]/);
});

test("event- en creatorrapporten gebruiken dezelfde controleerbare uitvoer", async () => {
  const [eventPage, eventExport, creatorOverview, creatorPage, creatorExport, eventDetail, operationalDetail] = await Promise.all([
    source("src/app/app/rapportage/events/[id]/page.tsx"),
    source("src/app/app/rapportage/events/[id]/export/route.ts"),
    source("src/app/app/rapportage/creators/page.tsx"),
    source("src/app/app/rapportage/creators/[id]/page.tsx"),
    source("src/app/app/rapportage/creators/[id]/export/route.ts"),
    source("src/app/app/events/[id]/page.tsx"),
    source("src/components/operational-record-detail.tsx"),
  ]);
  assert.match(creatorOverview, /ReportSelector/);
  assert.match(creatorOverview, /basePath="\/app\/rapportage\/creators"/);
  for (const page of [eventPage, creatorPage]) {
    assert.match(page, /ManagementReportActions/);
    assert.match(page, /collection_method/);
  }
  assert.match(creatorPage, /\["admin","board","member"\]/);
  assert.match(creatorExport, /\["admin","board","member"\]/);
  for (const route of [eventExport, creatorExport]) assert.match(route, /Content-Disposition/);
  assert.match(eventDetail, /Eventrapport/);
  assert.match(operationalDetail, /Creatorrapport/);
});

test("sponsor- en eventrapporten kunnen optioneel een Google Slides-pitchdeck maken", async () => {
  const [workspace, actions, sponsorPage, eventPage, environment] = await Promise.all([
    source("src/lib/google-workspace.ts"),
    source("src/app/app/google-document-actions.ts"),
    source("src/app/app/rapportage/sponsors/[id]/page.tsx"),
    source("src/app/app/rapportage/events/[id]/page.tsx"),
    source(".env.example"),
  ]);
  assert.match(workspace, /https:\/\/www\.googleapis\.com\/auth\/presentations/);
  assert.match(workspace, /slides\.googleapis\.com\/v1\/presentations/);
  assert.match(workspace, /replaceAllText/);
  assert.match(workspace, /googlePitchdeckConfiguration/);
  assert.match(environment, /GOOGLE_TEMPLATE_SPONSOR_PITCHDECK_ID=/);
  assert.match(environment, /GOOGLE_TEMPLATE_EVENT_PITCHDECK_ID=/);
  assert.match(actions, /generateSponsorPitchdeck/);
  assert.match(actions, /generateEventPitchdeck/);
  assert.match(actions, /saveDocumentMetadata/);
  assert.match(sponsorPage, /Google Slides-pitchdeck/);
  assert.match(eventPage, /Google Slides-pitchdeck/);
});
