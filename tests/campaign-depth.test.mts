import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("ieder campagnetype heeft een herbruikbaar briefing-, deliverable- en evaluatiesjabloon", async () => {
  const templates = await source("src/lib/campaign-templates.ts");
  for (const type of ["social", "partner", "sponsor", "giveaway", "crowdfunding", "event_promo", "stream", "blog"]) {
    assert.match(templates, new RegExp(`\\b${type}: \\{`));
  }
  assert.match(templates, /briefing:/);
  assert.match(templates, /deliverables:/);
  assert.match(templates, /evaluation:/);
  assert.match(templates, /channels:/);
});

test("een nieuwe campagne kan een sjabloon toepassen zonder het oude deliverable-tekstveld", async () => {
  const [form, actions] = await Promise.all([
    source("src/components/operational-record-form.tsx"),
    source("src/app/app/operations/actions.ts"),
  ]);
  assert.match(form, /name="apply_template"/);
  assert.match(form, /name="channels"/);
  assert.match(form, /name="event_id"/);
  assert.doesNotMatch(form, /label="Deliverables-overzicht"/);
  assert.match(actions, /campaignTemplates/);
  assert.match(actions, /campaign_deliverables/);
  assert.match(actions, /values\.channels/);
  assert.match(actions, /values\.event_id/);
});

test("campagnes kunnen rechtstreeks vanuit projecten en events worden gestart", async () => {
  const [project, event, detail] = await Promise.all([
    source("src/app/app/projecten/[id]/page.tsx"),
    source("src/app/app/events/[id]/page.tsx"),
    source("src/components/operational-record-detail.tsx"),
  ]);
  assert.match(project, /nieuw=campagne/);
  assert.match(project, /returnTo=\{`\/app\/projecten\/\$\{id\}`\}/);
  assert.match(event, /nieuw=campagne/);
  assert.match(event, /returnTo=\{`\/app\/events\/\$\{id\}`\}/);
  assert.match(detail, /nieuw=content/);
  assert.match(detail, /nieuw=social/);
});

test("de campagnefiche toont kanalen, event en een aparte evaluatie", async () => {
  const detail = await source("src/components/operational-record-detail.tsx");
  assert.match(detail, /label: "Kanalen"/);
  assert.match(detail, /label: "Event"/);
  assert.match(detail, /Resultaten en evaluatie/);
  assert.match(detail, /CampaignSections/);
});
