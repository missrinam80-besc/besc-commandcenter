import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderEmailTemplate, unresolvedEmailVariables } from "../src/lib/email-templates.ts";

const migration = readFileSync("supabase/migrations/20260731100000_add_email_templates_and_newsletters.sql", "utf8");
const newsletterActions = readFileSync("src/app/app/nieuwsbrieven/actions.ts", "utf8");
const approvalActions = readFileSync("src/app/app/goedkeuringen/actions.ts", "utf8");
const gmail = readFileSync("src/lib/google-gmail.ts", "utf8");

test("sjabloonvariabelen worden ingevuld en onbekende waarden blijven zichtbaar", () => {
  const result = renderEmailTemplate("Dag {{contact_naam}}, welkom bij {{organisatie}}. {{onbekend}}", {
    contact_naam: "Alex",
    organisatie: "BESC",
  });
  assert.equal(result, "Dag Alex, welkom bij BESC. {{onbekend}}");
  assert.deepEqual(unresolvedEmailVariables(result), ["{{onbekend}}"]);
});

test("mailinglijsten registreren toestemming en uitschrijvingen", () => {
  assert.match(migration, /consent_basis/);
  assert.match(migration, /consent_at/);
  assert.match(migration, /unsubscribed_at/);
  assert.match(migration, /status in \('subscribed','unsubscribed','bounced'\)/);
});

test("nieuwsbrieven beperken Gmail-ontvangers en gebruiken BCC", () => {
  assert.match(migration, /recipient_count >= 0 and recipient_count <= 100/);
  assert.match(newsletterActions, /recipients\.length > 100/);
  assert.match(newsletterActions, /bcc: recipients/);
  assert.match(gmail, /`Bcc:/);
});

test("nieuwsbriefverzending vereist goedkeuring en registreert Gmail IDs", () => {
  assert.match(newsletterActions, /newsletter\.status !== "approved"/);
  assert.match(newsletterActions, /sendGmailDraft/);
  assert.match(newsletterActions, /gmail_message_id: sent\.id/);
  assert.match(approvalActions, /request\.entity_type === "newsletter"/);
});

test("iedere nieuwsbrief krijgt een uitschrijfinstructie", () => {
  assert.match(newsletterActions, /Antwoord op deze e-mail met \\"uitschrijven\\"/);
});
