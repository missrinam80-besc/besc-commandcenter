import { createSign } from "node:crypto";

const requiredVariables = [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  "GOOGLE_CLOUD_PROJECT_ID",
  "GOOGLE_SHARED_DRIVE_ID",
  "GOOGLE_DRIVE_ROOT_FOLDER_ID",
  "GOOGLE_CALENDAR_ID",
  "GOOGLE_TEMPLATE_MINUTES_ID",
  "GOOGLE_TEMPLATE_SPONSOR_REPORT_ID",
  "GOOGLE_TEMPLATE_EVENT_ID",
] as const;

export type GoogleWorkspaceVariable = (typeof requiredVariables)[number];

export function googleWorkspaceConfiguration() {
  const missing = requiredVariables.filter((name) => !process.env[name]?.trim());
  return {
    configured: missing.length === 0,
    missing,
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "",
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID ?? "",
    sharedDriveId: process.env.GOOGLE_SHARED_DRIVE_ID ?? "",
    rootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? "",
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? "",
    templates: {
      minutes: process.env.GOOGLE_TEMPLATE_MINUTES_ID ?? "",
      sponsorReport: process.env.GOOGLE_TEMPLATE_SPONSOR_REPORT_ID ?? "",
      event: process.env.GOOGLE_TEMPLATE_EVENT_ID ?? "",
    },
  };
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function googleAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const config = googleWorkspaceConfiguration();
  if (!config.configured) throw new Error(`Ontbrekende Google-configuratie: ${config.missing.join(", ")}`);
  const rawPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!;
  const privateKey = (
    rawPrivateKey.startsWith('"') && rawPrivateKey.endsWith('"')
      ? rawPrivateKey.slice(1, -1)
      : rawPrivateKey
  ).replaceAll("\\n", "\n");
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: config.email,
    scope: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/calendar",
    ].join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  const result = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || "Google heeft het serviceaccount niet geaccepteerd.");
  }
  tokenCache = {
    token: result.access_token,
    expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000,
  };
  return tokenCache.token;
}

async function googleJson<T>(url: string) {
  const token = await googleAccessToken();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const result = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || `Google API-fout (${response.status})`);
  return result;
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
