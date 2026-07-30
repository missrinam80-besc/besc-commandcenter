import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("centrale invoerformulieren openen in een dialoog", async () => {
  const [entity, content, events, meetings, operational] = await Promise.all([
    source("src/components/entity-form.tsx"),
    source("src/app/app/content/page.tsx"),
    source("src/app/app/events/page.tsx"),
    source("src/app/app/vergaderingen/page.tsx"),
    source("src/components/operational-module-page.tsx"),
  ]);
  for (const file of [entity, content, events, meetings, operational]) {
    assert.match(file, /FormModal/);
  }
});

test("lange operationele tekstvelden ondersteunen Markdown en voorbeeldweergave", async () => {
  const [field, task, content, event, meeting, operational] = await Promise.all([
    source("src/components/markdown-field.tsx"),
    source("src/app/app/taken/[id]/page.tsx"),
    source("src/components/content-form.tsx"),
    source("src/components/event-form.tsx"),
    source("src/components/meeting-form.tsx"),
    source("src/components/operational-record-form.tsx"),
  ]);
  assert.match(field, /Streamdown/);
  assert.match(field, /Voorbeeld/);
  for (const file of [task, content, event, meeting, operational]) {
    assert.match(file, /MarkdownField/);
  }
});

test("taken en documentregistraties hebben een afgeschermde verwijderactie", async () => {
  const [task, document, register] = await Promise.all([
    source("src/app/app/taken/[id]/actions.ts"),
    source("src/app/app/documenten/actions.ts"),
    source("src/app/app/documenten/page.tsx"),
  ]);
  assert.match(task, /deleted_at/);
  assert.match(task, /z\.literal\("VERWIJDER"\)/);
  assert.match(document, /google_resource_links/);
  assert.match(document, /resource_type", "document"/);
  assert.match(register, /Google Drive-bestand zelf blijft bestaan/);
});

test("primaire dossierformulieren vereisen geen titel in de browser", async () => {
  const files = await Promise.all([
    source("src/components/entity-form.tsx"),
    source("src/components/content-form.tsx"),
    source("src/components/event-form.tsx"),
    source("src/components/meeting-form.tsx"),
    source("src/components/operational-record-form.tsx"),
    source("src/app/app/taken/[id]/page.tsx"),
  ]);
  for (const file of files) {
    assert.doesNotMatch(file, /name="title"[^>]*\brequired\b/);
  }
});
