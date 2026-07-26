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

export function googleWorkspaceConfiguration() {
  const missing = requiredVariables.filter((name) => !process.env[name]?.trim());
  return {
    configured: missing.length === 0,
    missing,
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "",
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID ?? "",
    projectNumber: process.env.GOOGLE_CLOUD_PROJECT_NUMBER ?? "",
    workloadIdentityPoolId: process.env.GOOGLE_WORKLOAD_IDENTITY_POOL_ID ?? "",
    workloadIdentityProviderId: process.env.GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID ?? "",
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
  const audience = `//iam.googleapis.com/projects/${config.projectNumber}/locations/global/workloadIdentityPools/${config.workloadIdentityPoolId}/providers/${config.workloadIdentityProviderId}`;
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
    throw new Error(sts.error_description || sts.error || "Google STS heeft het Vercel-token niet geaccepteerd.");
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
