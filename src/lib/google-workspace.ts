const requiredVariables = [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_CLOUD_PROJECT_ID",
  "GOOGLE_CLOUD_PROJECT_NUMBER",
  "GOOGLE_WORKLOAD_IDENTITY_POOL_ID",
  "GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
  "GOOGLE_SHARED_DRIVE_ID",
  "GOOGLE_DRIVE_ROOT_FOLDER_ID",
  "GOOGLE_CALENDAR_ID",
  "GOOGLE_TEMPLATE_MINUTES_ID",
  "GOOGLE_TEMPLATE_SPONSOR_REPORT_ID",
  "GOOGLE_TEMPLATE_EVENT_ID",
] as const;

export type GoogleWorkspaceVariable = (typeof requiredVariables)[number];

function env(name: GoogleWorkspaceVariable) {
  return (process.env[name] ?? "").trim().replace(/^["']|["']$/g, "");
}

function resourceSegment(value: string, marker: string) {
  const normalized = value.replace(/^\/\/iam\.googleapis\.com\//, "");
  const index = normalized.lastIndexOf(marker);
  return index >= 0 ? normalized.slice(index + marker.length).split("/")[0] : normalized;
}

export function googleWorkloadAudience(input: {
  projectNumber: string;
  workloadIdentityPoolId: string;
  workloadIdentityProviderId: string;
}) {
  const projectNumber = resourceSegment(input.projectNumber.trim(), "projects/");
  const poolId = resourceSegment(input.workloadIdentityPoolId.trim(), "workloadIdentityPools/");
  const providerId = resourceSegment(input.workloadIdentityProviderId.trim(), "providers/");
  return `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
}

export function googleWorkspaceConfiguration() {
  const missing = requiredVariables.filter((name) => !env(name));
  return {
    configured: missing.length === 0,
    missing,
    email: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    projectId: env("GOOGLE_CLOUD_PROJECT_ID"),
    projectNumber: env("GOOGLE_CLOUD_PROJECT_NUMBER"),
    workloadIdentityPoolId: env("GOOGLE_WORKLOAD_IDENTITY_POOL_ID"),
    workloadIdentityProviderId: env("GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID"),
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

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function googleAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const config = googleWorkspaceConfiguration();
  if (!config.configured) throw new Error(`Ontbrekende Google-configuratie: ${config.missing.join(", ")}`);
  const { headers } = await import("next/headers");
  const requestHeaders = await headers();
  const oidcToken =
    requestHeaders.get("x-vercel-oidc-token") ??
    process.env.VERCEL_OIDC_TOKEN ??
    "";
  if (!oidcToken) {
    throw new Error("Geen Vercel OIDC-token beschikbaar. Deploy op Vercel of voer lokaal `vercel env pull` uit.");
  }
  const audience = googleWorkloadAudience(config);
  const stsResponse = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      audience,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      subject_token: oidcToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    }),
    cache: "no-store",
  });
  const sts = await stsResponse.json() as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!stsResponse.ok || !sts.access_token) {
    const target = audience.replace("//iam.googleapis.com/", "");
    throw new Error(`${sts.error_description || sts.error || "Google STS heeft het Vercel-token niet geaccepteerd."} Doel: ${target}`);
  }
  const impersonationResponse = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(config.email)}:generateAccessToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sts.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: [
          "https://www.googleapis.com/auth/cloud-platform",
          "https://www.googleapis.com/auth/drive",
          "https://www.googleapis.com/auth/documents",
          "https://www.googleapis.com/auth/calendar",
        ],
        lifetime: "3600s",
      }),
      cache: "no-store",
    },
  );
  const impersonation = await impersonationResponse.json() as {
    accessToken?: string;
    expireTime?: string;
    error?: { message?: string };
  };
  if (!impersonationResponse.ok || !impersonation.accessToken) {
    throw new Error(impersonation.error?.message || "Impersonatie van het Google-serviceaccount is mislukt.");
  }
  const expiresAt = impersonation.expireTime
    ? new Date(impersonation.expireTime).getTime()
    : Date.now() + 3_600_000;
  tokenCache = {
    token: impersonation.accessToken,
    expiresAt,
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

export async function syncGoogleCalendarEvent(
  event: GoogleCalendarSourceEvent,
  knownGoogleEventId?: string | null,
) {
  const config = googleWorkspaceConfiguration();
  if (!config.configured) throw new Error(`Ontbrekende variabelen: ${config.missing.join(", ")}`);
  const payload = googleCalendarEventPayload(event);
  let googleEventId = knownGoogleEventId || null;
  if (!googleEventId) {
    googleEventId = (await findGoogleCalendarEntity("event", event.id))?.id ?? null;
  }
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
      if (!(error instanceof GoogleApiError) || error.status !== 404) throw error;
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
  let googleEventId = knownGoogleEventId || null;
  if (!googleEventId) {
    googleEventId = (await findGoogleCalendarEntity("meeting", meeting.id))?.id ?? null;
  }
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
      if (!(error instanceof GoogleApiError) || error.status !== 404) throw error;
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

const driveFolderFields = "id,name,mimeType,webViewLink,driveId,parents";

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
  const existing = result.files?.[0];
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

export async function getGoogleDriveFolder(fileId: string): Promise<GoogleDriveFolder> {
  const folder = await googleJson<GoogleDriveFolder>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=${driveFolderFields}`,
  );
  if (folder.mimeType !== "application/vnd.google-apps.folder") {
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

export async function moveGoogleDriveFolderToModule(folderId: string, module: GoogleDriveModule) {
  const current = await getGoogleDriveFolder(folderId);
  const moduleFolder = await ensureGoogleDriveModuleFolder(module);
  if (current.parents.includes(moduleFolder.id)) return current;
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
  return verified;
}

export function googleDriveFileId(input: string) {
  const value = input.trim();
  if (/^[a-zA-Z0-9_-]{10,}$/.test(value)) return value;
  try {
    const url = new URL(value);
    const folderMatch = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    const queryId = url.searchParams.get("id");
    const id = folderMatch?.[1] ?? queryId;
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
