import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderEmailTemplate, unresolvedEmailVariables } from "../src/lib/email-templates.ts";
import { newsletterHtml, safeNewsletterImageUrl } from "../src/lib/newsletter-html.ts";

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

test("HTML-nieuwsbrieven blijven veilig en behouden een tekstfallback", () => {
  const html = newsletterHtml({
    title: "BESC <update>",
    bodyText: "Welkom <script>alert(1)</script>",
    heroImageUrl: "https://example.com/header.png",
    unsubscribeUrl: "https://example.com/uitschrijven",
  });
  assert.match(html, /BESC &lt;update&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(safeNewsletterImageUrl("http://example.com/onveilig.png"), null);
  assert.match(gmail, /Content-Type: multipart\/alternative/);
  assert.match(gmail, /Content-Type: text\/plain/);
  assert.match(gmail, /Content-Type: text\/html/);
});

test("nieuwsbriefopmaak wordt additief in templates en verzendingen opgeslagen", () => {
  const htmlMigration = readFileSync("supabase/migrations/20260803130000_add_html_newsletters.sql", "utf8");
  const layouts = readFileSync("supabase/migrations/20260803132000_seed_newsletter_layouts.sql", "utf8");
  assert.match(htmlMigration, /newsletter_variant/);
  assert.match(htmlMigration, /body_html/);
  assert.match(layouts, /'event',true/);
  assert.match(layouts, /'partner',true/);
  assert.match(layouts, /'compact',true/);
  assert.match(newsletterActions, /body_html: html/);
  assert.match(newsletterActions, /html,/);
});

test("nieuwsbriefverzending vereist goedkeuring en registreert Gmail IDs", () => {
  assert.match(newsletterActions, /newsletter\.status !== "approved"/);
  assert.match(newsletterActions, /sendGmailDraft/);
  assert.match(newsletterActions, /gmail_message_id: sent\.id/);
  assert.match(approvalActions, /request\.entity_type === "newsletter"/);
});

test("iedere nieuwsbrief krijgt een uitschrijfinstructie", () => {
  assert.match(newsletterActions, /Antwoord op deze e-mail met \\"uitschrijven\\"/);
  assert.match(newsletterActions, /nieuwsbrief\/uitschrijven/);
});

test("publieke inschrijving gebruikt dubbele bevestiging zonder mailinglijsten openbaar te maken", () => {
  const publicMigration = readFileSync("supabase/migrations/20260803203000_add_public_newsletter_signup.sql", "utf8");
  const hardening = readFileSync("supabase/migrations/20260803204500_harden_public_newsletter_signup.sql", "utf8");
  const publicActions = readFileSync("src/app/nieuwsbrief/actions.ts", "utf8");
  const publicPage = readFileSync("src/app/nieuwsbrief/[slug]/page.tsx", "utf8");
  assert.match(publicMigration, /newsletter_subscription_requests enable row level security/);
  assert.match(publicMigration, /revoke all on public\.newsletter_subscription_requests from anon, authenticated/);
  assert.match(publicMigration, /request_newsletter_subscription/);
  assert.match(publicMigration, /confirm_newsletter_subscription/);
  assert.match(publicMigration, /public_double_opt_in/);
  assert.match(hardening, /set schema private/);
  assert.match(hardening, /security invoker/);
  assert.match(hardening, /revoke all on table private\.newsletter_subscription_requests/);
  assert.match(publicActions, /randomBytes\(32\)/);
  assert.match(publicActions, /Als dit adres kan worden ingeschreven|aangevraagd=1/);
  assert.match(publicPage, /name="consent"/);
  assert.doesNotMatch(publicPage, /supabase\.from\("mailing_/);
});

test("publieke uitschrijving verifieert het adres zonder lijstlidmaatschap te onthullen", () => {
  const migration = readFileSync("supabase/migrations/20260803210000_add_public_newsletter_unsubscribe.sql", "utf8");
  const publicActions = readFileSync("src/app/nieuwsbrief/actions.ts", "utf8");
  const page = readFileSync("src/app/nieuwsbrief/uitschrijven/[slug]/page.tsx", "utf8");
  assert.match(migration, /create table private\.newsletter_unsubscribe_requests/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /status = 'unsubscribed'/);
  assert.match(publicActions, /requestNewsletterUnsubscription/);
  assert.match(publicActions, /Als dit adres op de lijst staat|aangevraagd=1/);
  assert.doesNotMatch(page, /mailing_subscribers/);
});
