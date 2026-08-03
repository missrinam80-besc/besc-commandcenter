import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const youtubeScopes = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

export function youtubeConfiguration() {
  const clientId = (process.env.GOOGLE_YOUTUBE_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_YOUTUBE_CLIENT_SECRET ?? "").trim();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  const supabaseSecret = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  const missing = [
    !clientId && "GOOGLE_YOUTUBE_CLIENT_ID",
    !clientSecret && "GOOGLE_YOUTUBE_CLIENT_SECRET",
    !siteUrl && "NEXT_PUBLIC_SITE_URL",
    !supabaseSecret && "SUPABASE_SECRET_KEY",
  ].filter(Boolean) as string[];
  return {
    configured: missing.length === 0,
    clientId,
    clientSecret,
    siteUrl,
    callbackUrl: `${siteUrl}/app/integraties/social/youtube/callback`,
    missing,
  };
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(parameters: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters,
    cache: "no-store",
  });
  const result = await response.json() as TokenResponse;
  if (!response.ok || !result.access_token) throw new Error(result.error_description || result.error || "Google gaf geen toegangstoken terug.");
  return result;
}

export async function exchangeYouTubeCode(code: string) {
  const config = youtubeConfiguration();
  if (!config.configured) throw new Error(`YouTube-configuratie ontbreekt: ${config.missing.join(", ")}`);
  return tokenRequest(new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.callbackUrl,
    grant_type: "authorization_code",
  }));
}

export async function refreshYouTubeToken(refreshToken: string) {
  const config = youtubeConfiguration();
  if (!config.configured) throw new Error(`YouTube-configuratie ontbreekt: ${config.missing.join(", ")}`);
  return tokenRequest(new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  }));
}

async function googleJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || `YouTube API-fout (${response.status}).`);
  return body;
}

export type YouTubeChannel = {
  id: string;
  snippet?: { title?: string };
  statistics?: { viewCount?: string; subscriberCount?: string; videoCount?: string };
};

export async function fetchYouTubeChannel(accessToken: string) {
  const result = await googleJson<{ items?: YouTubeChannel[] }>(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
    accessToken,
  );
  const channel = result.items?.[0];
  if (!channel?.id) throw new Error("Het gekozen Google-account heeft geen bereikbaar YouTube-kanaal.");
  return channel;
}

type StoredCredentials = { access_token: string; refresh_token: string | null; expires_at: string | null };

export async function usableYouTubeCredentials(accountId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("read_social_account_credentials", { p_account_id: accountId });
  if (error) throw error;
  const credentials = (Array.isArray(data) ? data[0] : data) as StoredCredentials | null;
  if (!credentials?.access_token) throw new Error("Voor dit account zijn geen OAuth-gegevens gevonden.");
  const expiresSoon = !credentials.expires_at || new Date(credentials.expires_at).valueOf() < Date.now() + 120_000;
  if (!expiresSoon) return credentials;
  if (!credentials.refresh_token) throw new Error("Het toegangstoken is verlopen en er is geen refresh-token. Koppel het kanaal opnieuw.");
  const refreshed = await refreshYouTubeToken(credentials.refresh_token);
  const expiresAt = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();
  const { error: storeError } = await admin.rpc("store_social_account_credentials", {
    p_account_id: accountId,
    p_access_token: refreshed.access_token,
    p_refresh_token: null,
    p_expires_at: expiresAt,
  });
  if (storeError) throw storeError;
  return { access_token: refreshed.access_token!, refresh_token: credentials.refresh_token, expires_at: expiresAt };
}

export async function fetchYouTubeAnalytics(accessToken: string, startDate: string, endDate: string) {
  const parameters = new URLSearchParams({
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares,subscribersGained,subscribersLost",
  });
  return googleJson<{ columnHeaders?: { name: string }[]; rows?: (string | number)[][] }>(
    `https://youtubeanalytics.googleapis.com/v2/reports?${parameters.toString()}`,
    accessToken,
  );
}
