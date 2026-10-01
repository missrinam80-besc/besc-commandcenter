import assert from "node:assert/strict";
import test from "node:test";
import {
  googleDriveFileId,
  googleDriveModuleFolders,
  eventDriveSubfolders,
  googleCalendarEventPayload,
  googleCalendarMeetingPayload,
  googleWorkspaceConfiguration,
} from "../src/lib/google-workspace.ts";

test("Workspace-configuratie rapporteert ontbrekende variabelen zonder waarden te lekken", () => {
  const previous = process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  const result = googleWorkspaceConfiguration();
  assert.equal(result.configured, false);
  assert.ok(result.missing.includes("GOOGLE_OAUTH_CLIENT_ID"));
  if (previous) process.env.GOOGLE_OAUTH_CLIENT_ID = previous;
});

test("Google Calendar-payload bewaart exacte tijden en BESC-herkomst", () => {
  const payload = googleCalendarEventPayload({
    id: "event-1",
    organizationId: "org-1",
    title: "BESC Community Night",
    status: "confirmed",
    description: "Samen gamen.",
    startAt: "2026-08-01T18:00:00.000Z",
    endAt: "2026-08-01T21:00:00.000Z",
    location: "Antwerpen",
    isOnline: false,
    roleBesc: "organizer",
    driveUrl: "https://drive.google.com/example",
    eventbriteUrl: null,
    streamUrl: null,
  });
  assert.equal(payload.summary, "BESC Community Night");
  assert.equal(payload.start.dateTime, "2026-08-01T18:00:00.000Z");
  assert.equal(payload.end.dateTime, "2026-08-01T21:00:00.000Z");
  assert.equal(payload.start.timeZone, "Europe/Brussels");
  assert.equal(payload.extendedProperties.private.bescEntityId, "event-1");
  assert.match(payload.description, /Google Drive/);
});

test("Google Calendar-sync weigert ontbrekende of omgekeerde tijden", () => {
  const base = {
    id: "event-1",
    organizationId: "org-1",
    title: "Testevent",
    status: "planning",
    description: null,
    location: null,
    isOnline: true,
    roleBesc: "organizer",
    driveUrl: null,
    eventbriteUrl: null,
    streamUrl: null,
  };
  assert.throws(
    () => googleCalendarEventPayload({ ...base, startAt: null, endAt: null }),
    /start- als eindtijd/,
  );
  assert.throws(
    () => googleCalendarEventPayload({
      ...base,
      startAt: "2026-08-01T20:00:00.000Z",
      endAt: "2026-08-01T18:00:00.000Z",
    }),
    /na de starttijd/,
  );
});

test("Google Calendar-payload voor vergaderingen bevat geen interne notities", () => {
  const payload = googleCalendarMeetingPayload({
    id: "meeting-1",
    organizationId: "org-1",
    title: "Bestuursvergadering",
    status: "confirmed",
    meetingType: "board",
    startAt: "2026-08-04T17:00:00.000Z",
    endAt: "2026-08-04T19:00:00.000Z",
    attendees: ["Linda", "Alex"],
    minutesUrl: "https://docs.google.com/document/d/example",
  });
  assert.equal(payload.summary, "Bestuursvergadering");
  assert.match(payload.description, /Linda, Alex/);
  assert.match(payload.description, /Notulen/);
  assert.equal(payload.extendedProperties.private.bescEntityType, "meeting");
});

test("Google Calendar-sync voor vergaderingen vereist een eindtijd", () => {
  assert.throws(() => googleCalendarMeetingPayload({
    id: "meeting-1",
    organizationId: "org-1",
    title: "Bestuursvergadering",
    status: "planned",
    meetingType: "board",
    startAt: "2026-08-04T17:00:00.000Z",
    endAt: null,
    attendees: [],
    minutesUrl: null,
  }), /start- als eindtijd/);
});

test("geannuleerde Calendar-items blijven zichtbaar maar blokkeren geen tijd", () => {
  const event = googleCalendarEventPayload({
    id: "event-cancelled",
    organizationId: "org-1",
    title: "Community Night",
    status: "cancelled",
    description: null,
    startAt: "2026-08-10T18:00:00.000Z",
    endAt: "2026-08-10T20:00:00.000Z",
    location: null,
    isOnline: true,
    roleBesc: "organizer",
    driveUrl: null,
    eventbriteUrl: null,
    streamUrl: null,
  });
  assert.equal(event.summary, "GEANNULEERD — Community Night");
  assert.equal(event.transparency, "transparent");
});

test("Google Drive-map-ID wordt uit ondersteunde links gelezen", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz";
  assert.equal(googleDriveFileId(id), id);
  assert.equal(googleDriveFileId(`https://drive.google.com/drive/folders/${id}?usp=sharing`), id);
  assert.equal(googleDriveFileId(`https://docs.google.com/document/d/${id}/edit`), id);
  assert.equal(googleDriveFileId(`https://docs.google.com/spreadsheets/u/0/d/${id}/edit`), id);
  assert.equal(googleDriveFileId(`https://docs.google.com/presentation/d/${id}/edit`), id);
  assert.equal(googleDriveFileId(`https://drive.google.com/file/d/${id}/view`), id);
  assert.equal(googleDriveFileId(`https://drive.google.com/open?id=${id}`), id);
  assert.equal(googleDriveFileId("https://drive.google.com/drive/my-drive"), null);
  assert.equal(googleDriveFileId("geen geldige link"), null);
});

test("elke Command Center-module heeft een vaste Drive-mapnaam", () => {
  assert.equal(googleDriveModuleFolders.projects, "Projecten");
  assert.equal(googleDriveModuleFolders.events, "Events");
  assert.equal(googleDriveModuleFolders.content, "Content");
  assert.equal(googleDriveModuleFolders.finance, "Financiën");
  assert.equal(Object.keys(googleDriveModuleFolders).length, 11);
});

test("eventmappen krijgen de afgesproken basisstructuur", () => {
  assert.deepEqual([...eventDriveSubfolders], [
    "Planning",
    "Communicatie",
    "Partners",
    "Financiën",
    "Evaluatie",
  ]);
});
