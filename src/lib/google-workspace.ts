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
  if (!response.ok) throw new Error(result.error?.message || `Google API-fout (${response.status})`);
  return result;
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

export async function ensureGoogleDriveModuleFolder(module: GoogleDriveModule) {
  const config = googleWorkspaceConfiguration();
  if (!config.configured) throw new Error(`Ontbrekende variabelen: ${config.missing.join(", ")}`);
  const name = googleDriveModuleFolders[module];
  const query = [
    `'${driveQueryValue(config.rootFolderId)}' in parents`,
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
    return { ...existing, driveId: existing.driveId ?? config.sharedDriveId, parents: existing.parents ?? [config.rootFolderId] };
  }
  return createGoogleDriveFolder(name, config.rootFolderId);
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
    throw new Error("De projectmap kon niet onder de modulemap Projecten worden geplaatst.");
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
