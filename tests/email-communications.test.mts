import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260730200000_add_email_communications.sql", "utf8");
const actions = readFileSync("src/app/app/communicatie/actions.ts", "utf8");
const gmail = readFileSync("src/lib/google-gmail.ts", "utf8");
const approvals = readFileSync("src/lib/approvals.ts", "utf8");
const communicationPage = readFileSync("src/app/app/communicatie/page.tsx", "utf8");
const communicationComposer = readFileSync("src/components/communication-composer.tsx", "utf8");
const bccMigration = readFileSync("supabase/migrations/20260803150000_add_email_bcc_addresses.sql", "utf8");
const projectCampaignMigration = readFileSync("supabase/migrations/20260927100000_allow_project_campaign_email_communications.sql", "utf8");
const softDeleteMigration = readFileSync("supabase/migrations/20261001100000_add_email_communication_soft_delete.sql", "utf8");

test("e-mailcommunicatie ondersteunt dossiers en een gecontroleerde levenscyclus", () => {
  assert.match(migration, /entity_type in \('partner','event','meeting'\)/);
  assert.match(migration, /'pending_approval'/);
  assert.match(migration, /'approved'/);
  assert.match(migration, /'sent'/);
});

test("opstellers kunnen geen goedgekeurde of verzonden e-mailstatus schrijven", () => {
  assert.match(migration, /status in \('draft','pending_approval','changes_requested','failed'\)/);
  assert.match(migration, /approved_by is null/);
  assert.match(migration, /sent_by is null/);
});

test("verzenden vereist bestuurstoegang en een goedgekeurd Gmail-concept", () => {
  assert.match(actions, /isManager\(context\.membership\)/);
  assert.match(actions, /message\.status !== "approved"/);
  assert.match(actions, /sendGmailDraft/);
  assert.match(actions, /partner_interactions/);
});

test("Gmail MIME verwijdert regeleinden uit headers en gebruikt base64url", () => {
  assert.match(gmail, /replace\(\/\[\\r\\n\]\+\/g, " "\)/);
  assert.match(gmail, /toString\("base64url"\)/);
  assert.match(gmail, /Content-Type: text\/plain; charset="UTF-8"/);
});

test("dossiermails ondersteunen BCC en passen sjablonen toe vanuit een modal", () => {
  assert.match(bccMigration, /bcc_addresses text\[\]/);
  assert.match(actions, /bcc_addresses/);
  assert.match(actions, /saveGmailDraft\(\{[\s\S]*bcc/);
  assert.match(communicationPage, /FormModal title="Communicatie voorbereiden"/);
  assert.match(communicationComposer, /Sjabloon toepassen/);
  assert.match(communicationComposer, /renderTemplate/);
  assert.match(communicationComposer, /name="bcc_addresses"/);
  assert.match(communicationComposer, /name="communication_type" value=\{communicationType\}/);
  assert.match(actions, /redirect\("\/app\/communicatie\?succes=concept"\)/);
});

test("e-mailcommunicatie ondersteunt projecten en campagnes als dossier", () => {
  assert.match(actions, /z\.enum\(\["partner", "event", "meeting", "project", "campaign"\]\)/);
  assert.match(communicationPage, /CommunicationComposer/);
  assert.match(communicationComposer, /value=\{type\}/);
  assert.match(communicationPage, /projects/);
  assert.match(communicationPage, /campaigns/);
  assert.match(projectCampaignMigration, /'partner','event','meeting','project','campaign'/);
});

test("e-mailregister biedt bewerken, goedkeuring en soft-delete", () => {
  assert.match(communicationPage, /deleteEmailCommunication/);
  assert.match(communicationPage, /Goedkeuring/);
  assert.match(actions, /deleted_at/);
  assert.match(softDeleteMigration, /add column if not exists deleted_at timestamptz/);
});

test("alleen bestuur en beheerders kunnen e-mails beoordelen", () => {
  assert.match(approvals, /membership\.role === "admin" \|\| membership\.role === "board"/);
  assert.match(approvals, /return entityType === "expense"/);
});
