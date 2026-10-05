const requiredVariables = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REFRESH_TOKEN",
  "GOOGLE_CLOUD_PROJECT_ID",
  "GOOGLE_SHARED_DRIVE_ID",
  "GOOGLE_DRIVE_ROOT_FOLDER_ID",
  "GOOGLE_CALENDAR_ID",
  "GOOGLE_TEMPLATE_MINUTES_ID",
  "GOOGLE_TEMPLATE_SPONSOR_REPORT_ID",
  "GOOGLE_TEMPLATE_EVENT_ID",
] as const;

export type GoogleWorkspaceVariable = (typeof requiredVariables)[number];

function env(name: string) {
  return (process.env[name] ?? "").trim().replace(/^["']|["']$/g, "");
}

export function googleWorkspaceConfiguration() {
  const missing = requiredVariables.filter((name) => !env(name));
  return {
    configured: missing.length === 0,
    missing,
    email: env("GOOGLE_OAUTH_USER_EMAIL"),
    projectId: env("GOOGLE_CLOUD_PROJECT_ID"),
    sharedDriveId: env("GOOGLE_SHARED_DRIVE_ID"),
    rootFolderId: env("GOOGLE_DRIVE_ROOT_FOLDER_ID"),
    calendarId: env("GOOGLE_CALENDAR_ID"),
    templates: {
      minutes: env("GOOGLE_TEMPLATE_MINUTES_ID"),
      sponsorReport: env("GOOGLE_TEMPLATE_SPONSOR_REPORT_ID"),
      event: env("GOOGLE_TEMPLATE_EVENT_ID"),
    },
  };
}

const googleApiScopes = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/calendar",
] as const;

let tokenCache: { cacheKey: string; token: string; expiresAt: number } | null = null;

export async function googleAccessToken(options: {
  scopes?: readonly string[];
} = {}) {
  const config = googleWorkspaceConfiguration();
  if (!config.configured) throw new Error(`Ontbrekende Google-configuratie: ${config.missing.join(", ")}`);
  const scopes = options.scopes?.length ? [...options.scopes] : [...googleApiScopes];
  const cacheKey = `${env("GOOGLE_OAUTH_CLIENT_ID")}|${scopes.join(" ")}`;
  if (tokenCache?.cacheKey === cacheKey && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: env("GOOGLE_OAUTH_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const result = await tokenResponse.json() as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!tokenResponse.ok || !result.access_token) {
    throw new Error(result.error_description || result.error || "Google OAuth-authenticatie is mislukt.");
  }
  tokenCache = {
    cacheKey,
    token: result.access_token,
    expiresAt: Date.now() + (result.expires_in ?? 3_600) * 1_000,
  };
  return tokenCache.token;
}

export class GoogleApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

async function googleJson<T>(url: string, init?: RequestInit) {
  const token = await googleAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const result = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new GoogleApiError(result.error?.message || `Google API-fout (${response.status})`, response.status);
  }
  return result;
}

export type GoogleCalendarSourceEvent = {
  id: string;
  organizationId: string;
  title: string;
  status: string;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  isOnline: boolean;
  roleBesc: string | null;
  driveUrl: string | null;
  eventbriteUrl: string | null;
  streamUrl: string | null;
};

type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  extendedProperties?: {
    private?: Record<string, string>;
  };
};

export function googleCalendarEventPayload(event: GoogleCalendarSourceEvent) {
  if (!event.startAt || !event.endAt) {
    throw new Error("Vul zowel de start- als eindtijd in voordat je dit event synchroniseert.");
  }
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new Error("De start- of eindtijd is ongeldig.");
  }
  if (end <= start) {
    throw new Error("De eindtijd moet na de starttijd liggen.");
  }
  const links = [
    event.driveUrl ? `Google Drive: ${event.driveUrl}` : null,
    event.eventbriteUrl ? `Eventbrite: ${event.eventbriteUrl}` : null,
    event.streamUrl ? `Livestream: ${event.streamUrl}` : null,
  ].filter(Boolean);
  const context = [
    event.description?.trim() || null,
    event.roleBesc ? `Rol BESC: ${event.roleBesc}` : null,
    links.length ? links.join("\n") : null,
    "Beheerd vanuit BESC Command Center.",
  ].filter(Boolean);
  return {
    summary: event.status === "cancelled" ? `GEANNULEERD — ${event.title.trim()}` : event.title.trim(),
    description: context.join("\n\n"),
    location: event.isOnline ? "Online" : event.location?.trim() || undefined,
    start: { dateTime: start.toISOString(), timeZone: "Europe/Brussels" },
    end: { dateTime: end.toISOString(), timeZone: "Europe/Brussels" },
    transparency: event.status === "cancelled" ? "transparent" : "opaque",
    extendedProperties: {
      private: {
        bescEntityType: "event",
        bescEntityId: event.id,
        bescOrganizationId: event.organizationId,
      },
    },
  };
}

async function findGoogleCalendarEntity(entityType: "event" | "meeting", entityId: string) {
  const config = googleWorkspaceConfiguration();
  const params = new URLSearchParams({
    privateExtendedProperty: `bescEntityId=${entityId}`,
    maxResults: "2",
    singleEvents: "true",
    showDeleted: "false",
  });
  const result = await googleJson<{ items?: GoogleCalendarEvent[] }>(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events?${params}`,
  );
  return result.items?.find((item) =>
    item.extendedProperties?.private?.bescEntityType === entityType,
  ) ?? null;
}

async function getGoogleCalendarEvent(googleEventId: string) {
  const config = googleWorkspaceConfiguration();
  try {
    return await googleJson<GoogleCalendarEvent>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    );
  } catch (error) {
    if (error instanceof GoogleApiError && [404, 410].includes(error.status)) return null;
    throw error;
  }
}

export async function syncGoogleCalendarEvent(
  event: GoogleCalendarSourceEvent,
  knownGoogleEventId?: string | null,
) {
  const config = googleWorkspaceConfiguration();
  if (!config.configured) throw new Error(`Ontbrekende variabelen: ${config.missing.join(", ")}`);
  const payload = googleCalendarEventPayload(event);
  const discoveredEventId = (await findGoogleCalendarEntity("event", event.id))?.id ?? null;
  const linkedEvent = !discoveredEventId && knownGoogleEventId
    ? await getGoogleCalendarEvent(knownGoogleEventId)
    : null;
  const googleEventId = discoveredEventId || (linkedEvent?.status === "cancelled" ? null : linkedEvent?.id) || null;
  if (googleEventId) {
    try {
      const updated = await googleJson<GoogleCalendarEvent>(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(googleEventId)}?sendUpdates=none`,
        { method: "PATCH", body: JSON.stringify(payload) },
      );
      return {
        id: updated.id,
        name: updated.summary ?? event.title,
        webUrl: updated.htmlLink ?? `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(updated.id)}`,
        operation: "updated" as const,
      };
    } catch (error) {
      if (!(error instanceof GoogleApiError) || ![404, 410].includes(error.status)) throw error;
    }
  }
  const created = await googleJson<GoogleCalendarEvent>(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events?sendUpdates=none`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  return {
    id: created.id,
    name: created.summary ?? event.title,
    webUrl: created.htmlLink ?? `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(created.id)}`,
    operation: "created" as const,
  };
}

export async function deleteGoogleCalendarEvent(googleEventId: string) {
  const config = googleWorkspaceConfiguration();
  if (!config.configured) throw new Error(`Ontbrekende variabelen: ${config.missing.join(", ")}`);
  const token = await googleAccessToken();
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(googleEventId)}?sendUpdates=none`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (response.ok || response.status === 404 || response.status === 410) return;
  const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  throw new GoogleApiError(result?.error?.message || `Google API-fout (${response.status})`, response.status);
}

export type GoogleCalendarSourceMeeting = {
  id: string;
  organizationId: string;
  title: string;
  status: string;
  meetingType: string;
  startAt: string | null;
  endAt: string | null;
  attendees: string[];
  minutesUrl: string | null;
};

export function googleCalendarMeetingPayload(meeting: GoogleCalendarSourceMeeting) {
  if (!meeting.startAt || !meeting.endAt) {
    throw new Error("Vul zowel de start- als eindtijd in voordat je deze vergadering synchroniseert.");
  }
  const start = new Date(meeting.startAt);
  const end = new Date(meeting.endAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new Error("De start- of eindtijd is ongeldig.");
  }
  if (end <= start) {
    throw new Error("De eindtijd moet na de starttijd liggen.");
  }
  const description = [
    `Type: ${meeting.meetingType}`,
    meeting.attendees.length ? `Deelnemers: ${meeting.attendees.join(", ")}` : null,
    meeting.minutesUrl ? `Notulen: ${meeting.minutesUrl}` : null,
    "Beheerd vanuit BESC Command Center.",
  ].filter(Boolean).join("\n\n");
  return {
    summary: meeting.status === "cancelled" ? `GEANNULEERD — ${meeting.title.trim()}` : meeting.title.trim(),
    description,
    start: { dateTime: start.toISOString(), timeZone: "Europe/Brussels" },
    end: { dateTime: end.toISOString(), timeZone: "Europe/Brussels" },
    transparency: meeting.status === "cancelled" ? "transparent" : "opaque",
    extendedProperties: {
      private: {
        bescEntityType: "meeting",
        bescEntityId: meeting.id,
        bescOrganizationId: meeting.organizationId,
      },
    },
  };
}

export async function syncGoogleCalendarMeeting(
  meeting: GoogleCalendarSourceMeeting,
  knownGoogleEventId?: string | null,
) {
  const config = googleWorkspaceConfiguration();
  if (!config.configured) throw new Error(`Ontbrekende variabelen: ${config.missing.join(", ")}`);
  const payload = googleCalendarMeetingPayload(meeting);
  const discoveredEventId = (await findGoogleCalendarEntity("meeting", meeting.id))?.id ?? null;
  const linkedEvent = !discoveredEventId && knownGoogleEventId
    ? await getGoogleCalendarEvent(knownGoogleEventId)
    : null;
  const googleEventId = discoveredEventId || (linkedEvent?.status === "cancelled" ? null : linkedEvent?.id) || null;
  if (googleEventId) {
    try {
      const updated = await googleJson<GoogleCalendarEvent>(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(googleEventId)}?sendUpdates=none`,
        { method: "PATCH", body: JSON.stringify(payload) },
      );
      return {
        id: updated.id,
        name: updated.summary ?? meeting.title,
        webUrl: updated.htmlLink ?? `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(updated.id)}`,
        operation: "updated" as const,
      };
    } catch (error) {
      if (!(error instanceof GoogleApiError) || ![404, 410].includes(error.status)) throw error;
    }
  }
  const created = await googleJson<GoogleCalendarEvent>(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events?sendUpdates=none`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  return {
    id: created.id,
    name: created.summary ?? meeting.title,
    webUrl: created.htmlLink ?? `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(created.id)}`,
    operation: "created" as const,
  };
}

export type GoogleDriveFolder = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  driveId: string | null;
  parents: string[];
};

const driveFolderFields = "id,name,mimeType,webViewLink,driveId,parents,trashed";

export const googleDriveModuleFolders = {
  projects: "Projecten",
  events: "Events",
  content: "Content",
  sponsors: "Sponsors & Partners",
  campaigns: "Campagnes",
  meetings: "Vergaderingen",
  finance: "Financiën",
  administration: "Administratie",
  community: "Community",
  knowledge: "Kennisbank",
  shop: "Shop & Merchandise",
} as const;

export type GoogleDriveModule = keyof typeof googleDriveModuleFolders;

function driveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function createGoogleDriveFolder(name: string, parentId: string): Promise<GoogleDriveFolder> {
  const config = googleWorkspaceConfiguration();
  const folder = await googleJson<GoogleDriveFolder>(
    `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=${driveFolderFields}`,
    {
      method: "POST",
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    },
  );
  return { ...folder, driveId: folder.driveId ?? config.sharedDriveId, parents: folder.parents ?? [parentId] };
}

async function findGoogleDriveChildFolder(parentId: string, name: string) {
  const config = googleWorkspaceConfiguration();
  if (!config.configured) throw new Error(`Ontbrekende variabelen: ${config.missing.join(", ")}`);
  const query = [
    `'${driveQueryValue(parentId)}' in parents`,
    `name = '${driveQueryValue(name)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ].join(" and ");
  const params = new URLSearchParams({
    q: query,
    fields: `files(${driveFolderFields})`,
    spaces: "drive",
    corpora: "drive",
    driveId: config.sharedDriveId,
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
    pageSize: "10",
  });
  const result = await googleJson<{ files: GoogleDriveFolder[] }>(
    `https://www.googleapis.com/drive/v3/files?${params}`,
  );
  if (!Array.isArray(result.files)) throw new Error("De mapzoekopdracht kon niet worden gecontroleerd.");
  if (result.files.length > 1) throw new Error("Meerdere mappen met dezelfde naam gevonden. Koppel eerst de juiste map.");
  const existing = result.files[0];
  if (existing) {
    return { ...existing, driveId: existing.driveId ?? config.sharedDriveId, parents: existing.parents ?? [parentId] };
  }
  return null;
}

async function ensureGoogleDriveChildFolder(parentId: string, name: string) {
  return await findGoogleDriveChildFolder(parentId, name) ?? createGoogleDriveFolder(name, parentId);
}

export async function ensureGoogleDriveModuleFolder(module: GoogleDriveModule) {
  const config = googleWorkspaceConfiguration();
  if (!config.configured) throw new Error(`Ontbrekende variabelen: ${config.missing.join(", ")}`);
  return ensureGoogleDriveChildFolder(config.rootFolderId, googleDriveModuleFolders[module]);
}

export async function ensureGoogleDriveEntityFolder(module: GoogleDriveModule, entityTitle: string) {
  const moduleFolder = await ensureGoogleDriveModuleFolder(module);
  return ensureGoogleDriveChildFolder(moduleFolder.id, entityTitle.trim());
}

export type GoogleDriveDocumentMetadata = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  driveId: string | null;
  parents: string[];
  version?: string | null;
  modifiedTime?: string | null;
  checkedAt?: string | null;
};

export async function getGoogleDriveDocumentMetadata(fileId: string): Promise<GoogleDriveDocumentMetadata> {
  const file = await googleJson<GoogleDriveDocumentMetadata & { trashed?: boolean }>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,driveId,parents,trashed,version,modifiedTime`,
  );
  if (file.id !== fileId || !file.name || !file.mimeType || file.trashed !== false) {
    throw new Error("Het Google Drive-bestand kon niet worden gecontroleerd.");
  }
  if (["application/vnd.google-apps.folder", "application/vnd.google-apps.shortcut"].includes(file.mimeType)) {
    throw new Error("Kies een bestand; geen map of snelkoppeling.");
  }
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
    driveId: file.driveId ?? null,
    parents: file.parents ?? [],
    version: file.version ?? null,
    modifiedTime: file.modifiedTime ?? null,
    checkedAt: new Date().toISOString(),
  };
}

export async function getGoogleDriveFolder(fileId: string): Promise<GoogleDriveFolder> {
  const folder = await googleJson<GoogleDriveFolder & { trashed?: boolean }>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=${driveFolderFields}`,
  );
  if (folder.id !== fileId || folder.mimeType !== "application/vnd.google-apps.folder" || folder.trashed !== false) {
    throw new Error("De gekozen Google Drive-link verwijst niet naar een map.");
  }
  return { ...folder, driveId: folder.driveId ?? null, parents: folder.parents ?? [] };
}

export async function createProjectDriveFolder(projectTitle: string): Promise<GoogleDriveFolder> {
  const moduleFolder = await ensureGoogleDriveModuleFolder("projects");
  return createGoogleDriveFolder(projectTitle.trim(), moduleFolder.id);
}

export const eventDriveSubfolders = [
  "Planning",
  "Communicatie",
  "Partners",
  "Financiën",
  "Evaluatie",
] as const;

// Read the chosen folder's own drive, including every page; never create or move here.
export async function previewEventDriveStructure(folderId: string) {
  const folder = await getGoogleDriveFolder(folderId);
  const names = new Set<string>();
  let pageToken: string | undefined;
  const seen = new Set<string>();
  do {
    const params = new URLSearchParams({
      q: `'${driveQueryValue(folder.id)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken,incompleteSearch,files(name)", pageSize: "1000", supportsAllDrives: "true", includeItemsFromAllDrives: "true",
    });
    if (folder.driveId) { params.set("corpora", "drive"); params.set("driveId", folder.driveId); }
    if (pageToken) params.set("pageToken", pageToken);
    const page = await googleJson<{files: {name: string}[]; nextPageToken?: string; incompleteSearch?: boolean}>(`https://www.googleapis.com/drive/v3/files?${params}`);
    if (page.incompleteSearch || !Array.isArray(page.files)) throw new Error("De mapinhoud kon niet worden gecontroleerd.");
    for (const child of page.files) names.add(child.name);
    pageToken = page.nextPageToken;
    if (pageToken && seen.has(pageToken)) throw new Error("De mapinhoud is onvolledig.");
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  return {folder, missing: eventDriveSubfolders.filter(name => !names.has(name))};
}

export async function completeEventDriveStructure(folderId: string, expectedMissing: string[]) {
  const preview = await previewEventDriveStructure(folderId);
  if (new Set(expectedMissing).size !== preview.missing.length || preview.missing.some(name => !expectedMissing.includes(name))) throw new Error("De ontbrekende basismappen zijn gewijzigd. Bekijk het overzicht opnieuw.");
  // Recheck at execution time; preserve existing children and the original parent.
  for (const name of preview.missing) await createGoogleDriveFolder(name, preview.folder.id);
  return preview.folder;
}

export async function ensureEventDriveStructure(eventTitle: string, eventFolderId?: string) {
  const moduleFolder = await ensureGoogleDriveModuleFolder("events");
  const eventFolder = eventFolderId
    ? await getGoogleDriveFolder(eventFolderId)
    : await ensureGoogleDriveChildFolder(moduleFolder.id, eventTitle.trim());
  const subfolders = await Promise.all(
    eventDriveSubfolders.map((name) => ensureGoogleDriveChildFolder(eventFolder.id, name)),
  );
  return { eventFolder, subfolders };
}

export type GoogleTemplateRole = "minutes" | "sponsorReport" | "event";

export function googlePitchdeckConfiguration() {
  const sponsor = env("GOOGLE_TEMPLATE_SPONSOR_PITCHDECK_ID");
  return { configured: Boolean(sponsor), sponsor };
}

export async function createDocumentFromGoogleTemplate(input: {
  template: GoogleTemplateRole;
  name: string;
  parentId: string;
  replacements: Record<string, string | number | null | undefined>;
}) {
  const config = googleWorkspaceConfiguration();
  if (!config.configured) throw new Error(`Ontbrekende variabelen: ${config.missing.join(", ")}`);
  const templateId = config.templates[input.template];
  const copied = await googleJson<{
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
    driveId?: string;
    parents?: string[];
  }>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(templateId)}/copy?supportsAllDrives=true&fields=${driveFolderFields}`,
    {
      method: "POST",
      body: JSON.stringify({ name: input.name.trim(), parents: [input.parentId] }),
    },
  );
  if (copied.mimeType !== "application/vnd.google-apps.document") {
    throw new Error("Het ingestelde Google-template is geen Google Docs-document.");
  }
  const requests = Object.entries(input.replacements).map(([key, value]) => ({
    replaceAllText: {
      containsText: { text: `{{${key}}}`, matchCase: false },
      replaceText: value == null || String(value).trim() === "" ? "Niet ingevuld" : String(value),
    },
  }));
  if (requests.length) {
    await googleJson<{ replies: unknown[] }>(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(copied.id)}:batchUpdate`,
      { method: "POST", body: JSON.stringify({ requests }) },
    );
  }
  const verified = await googleJson<{
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
    driveId?: string;
    parents?: string[];
  }>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(copied.id)}?supportsAllDrives=true&fields=${driveFolderFields}`,
  );
  return {
    id: verified.id,
    name: verified.name,
    mimeType: verified.mimeType,
    webViewLink: verified.webViewLink ?? `https://docs.google.com/document/d/${verified.id}/edit`,
    driveId: verified.driveId ?? null,
    parents: verified.parents ?? [input.parentId],
  };
}

export async function createPresentationFromGoogleTemplate(input: {
  template: "sponsor";
  name: string;
  parentId: string;
  replacements: Record<string, string | number | null | undefined>;
}) {
  const templates = googlePitchdeckConfiguration();
  const templateId = templates[input.template];
  if (!templateId) throw new Error(`Google Slides-template voor ${input.template} ontbreekt.`);
  const copied = await googleJson<{id:string;name:string;mimeType:string;webViewLink?:string;driveId?:string;parents?:string[]}>(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(templateId)}/copy?supportsAllDrives=true&fields=${driveFolderFields}`,{method:"POST",body:JSON.stringify({name:input.name.trim(),parents:[input.parentId]})});
  if(copied.mimeType!=="application/vnd.google-apps.presentation")throw new Error("Het ingestelde pitchdeck-template is geen Google Slides-presentatie.");
  const requests=Object.entries(input.replacements).map(([key,value])=>({replaceAllText:{containsText:{text:`{{${key}}}`,matchCase:false},replaceText:value==null||String(value).trim()===""?"Niet ingevuld":String(value)}}));
  if(requests.length)await googleJson<{replies:unknown[]}>(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(copied.id)}:batchUpdate`,{method:"POST",body:JSON.stringify({requests})});
  return {id:copied.id,name:copied.name,mimeType:copied.mimeType,webViewLink:copied.webViewLink??`https://docs.google.com/presentation/d/${copied.id}/edit`,driveId:copied.driveId??null,parents:copied.parents??[input.parentId]};
}

export async function moveGoogleDriveFolderToModule(folderId: string, module: GoogleDriveModule): Promise<GoogleDriveFolder & { moved: boolean }> {
  const current = await getGoogleDriveFolder(folderId);
  const moduleFolder = await ensureGoogleDriveModuleFolder(module);
  if (current.parents.includes(moduleFolder.id)) return { ...current, moved: false };
  const params = new URLSearchParams({
    addParents: moduleFolder.id,
    removeParents: current.parents.join(","),
    supportsAllDrives: "true",
    fields: driveFolderFields,
  });
  const moved = await googleJson<GoogleDriveFolder>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?${params}`,
    { method: "PATCH" },
  );
  const verified = await getGoogleDriveFolder(moved.id);
  if (!verified.parents.includes(moduleFolder.id)) {
    throw new Error(`De map kon niet onder de modulemap ${googleDriveModuleFolders[module]} worden geplaatst.`);
  }
  return { ...verified, moved: true };
}

export function googleDriveFileId(input: string) {
  const value = input.trim();
  if (/^[a-zA-Z0-9_-]{10,}$/.test(value)) return value;
  try {
    const url = new URL(value);
    const folderMatch = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    const fileMatch = url.pathname.match(/\/(?:file|document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
    const queryId = url.searchParams.get("id");
    const id = folderMatch?.[1] ?? fileMatch?.[1] ?? queryId;
    return id && /^[a-zA-Z0-9_-]{10,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export type WorkspaceResource = {
  type: "shared_drive" | "folder" | "calendar" | "template";
  role?: "minutes" | "sponsor_report" | "event";
  id: string;
  name: string;
  webUrl: string | null;
  mimeType: string | null;
};

export async function testGoogleWorkspace(): Promise<WorkspaceResource[]> {
  const config = googleWorkspaceConfiguration();
  if (!config.configured) throw new Error(`Ontbrekende variabelen: ${config.missing.join(", ")}`);
  const fileFields = "id,name,mimeType,webViewLink,driveId";
  const [drive, folder, calendar, minutes, sponsorReport, event] = await Promise.all([
    googleJson<{ id: string; name: string }>(
      `https://www.googleapis.com/drive/v3/drives/${encodeURIComponent(config.sharedDriveId)}?fields=id,name`,
    ),
    googleJson<{ id: string; name: string; mimeType: string; webViewLink?: string }>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(config.rootFolderId)}?supportsAllDrives=true&fields=${fileFields}`,
    ),
    googleJson<{ id: string; summary: string }>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}`,
    ),
    googleJson<{ id: string; name: string; mimeType: string; webViewLink?: string }>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(config.templates.minutes)}?supportsAllDrives=true&fields=${fileFields}`,
    ),
    googleJson<{ id: string; name: string; mimeType: string; webViewLink?: string }>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(config.templates.sponsorReport)}?supportsAllDrives=true&fields=${fileFields}`,
    ),
    googleJson<{ id: string; name: string; mimeType: string; webViewLink?: string }>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(config.templates.event)}?supportsAllDrives=true&fields=${fileFields}`,
    ),
  ]);
  return [
    { type: "shared_drive", id: drive.id, name: drive.name, webUrl: null, mimeType: null },
    { type: "folder", id: folder.id, name: folder.name, webUrl: folder.webViewLink ?? null, mimeType: folder.mimeType },
    { type: "calendar", id: calendar.id, name: calendar.summary, webUrl: null, mimeType: null },
    { type: "template", role: "minutes", id: minutes.id, name: minutes.name, webUrl: minutes.webViewLink ?? null, mimeType: minutes.mimeType },
    { type: "template", role: "sponsor_report", id: sponsorReport.id, name: sponsorReport.name, webUrl: sponsorReport.webViewLink ?? null, mimeType: sponsorReport.mimeType },
    { type: "template", role: "event", id: event.id, name: event.name, webUrl: event.webViewLink ?? null, mimeType: event.mimeType },
  ];
}
