import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const twitchScopes: string[] = [];

export function twitchConfiguration() {
  const clientId = (process.env.TWITCH_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.TWITCH_CLIENT_SECRET ?? "").trim();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  const supabaseSecret = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  const missing = [!clientId && "TWITCH_CLIENT_ID", !clientSecret && "TWITCH_CLIENT_SECRET", !siteUrl && "NEXT_PUBLIC_SITE_URL", !supabaseSecret && "SUPABASE_SECRET_KEY"].filter(Boolean) as string[];
  return { configured: missing.length === 0, clientId, clientSecret, siteUrl, callbackUrl: `${siteUrl}/app/integraties/social/twitch/callback`, missing };
}

type TwitchToken = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string[]; message?: string };

async function tokenRequest(parameters: URLSearchParams) {
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: parameters, cache: "no-store",
  });
  const body = await response.json() as TwitchToken;
  if (!response.ok || !body.access_token) throw new Error(body.message || `Twitch tokenfout (${response.status}).`);
  return body;
}

export async function exchangeTwitchCode(code: string) {
  const config = twitchConfiguration();
  if (!config.configured) throw new Error(`Twitch-configuratie ontbreekt: ${config.missing.join(", ")}`);
  return tokenRequest(new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, grant_type: "authorization_code", redirect_uri: config.callbackUrl }));
}

export async function refreshTwitchToken(refreshToken: string) {
  const config = twitchConfiguration();
  if (!config.configured) throw new Error(`Twitch-configuratie ontbreekt: ${config.missing.join(", ")}`);
  return tokenRequest(new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }));
}

export async function validateTwitchToken(accessToken: string) {
  const response = await fetch("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${accessToken}` }, cache: "no-store" });
  const body = await response.json() as { client_id?: string; user_id?: string; login?: string; scopes?: string[]; expires_in?: number; message?: string };
  if (!response.ok || !body.user_id) throw new Error(body.message || "Het Twitch-token is niet meer geldig.");
  return body;
}

async function helixJson<T>(path: string, accessToken: string): Promise<T> {
  const config = twitchConfiguration();
  const response = await fetch(`https://api.twitch.tv/helix/${path}`, { headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": config.clientId }, cache: "no-store" });
  const body = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(body.message || `Twitch API-fout (${response.status}).`);
  return body;
}

export async function fetchTwitchOperationalData(accessToken: string, userId: string) {
  const [users, channels, streams, schedule] = await Promise.all([
    helixJson<{ data?: Array<{ id: string; login: string; display_name: string; view_count?: number }> }>(`users?id=${encodeURIComponent(userId)}`, accessToken),
    helixJson<{ data?: Array<{ broadcaster_id: string; broadcaster_login: string; broadcaster_name: string; game_name?: string; title?: string }> }>(`channels?broadcaster_id=${encodeURIComponent(userId)}`, accessToken),
    helixJson<{ data?: Array<{ id: string; viewer_count?: number; started_at?: string; type?: string }> }>(`streams?user_id=${encodeURIComponent(userId)}`, accessToken),
    helixJson<{ data?: { segments?: Array<{ id: string; start_time: string; end_time: string; title: string }> } }>(`schedule?broadcaster_id=${encodeURIComponent(userId)}&first=25`, accessToken).catch(() => ({ data: { segments: [] } })),
  ]);
  const user = users.data?.[0];
  if (!user?.id) throw new Error("Het gekoppelde Twitch-account kon niet worden gelezen.");
  return { user, channel: channels.data?.[0] ?? null, stream: streams.data?.[0] ?? null, scheduleSegments: schedule.data?.segments ?? [] };
}

type StoredCredentials = { access_token: string; refresh_token: string | null; expires_at: string | null };

export async function usableTwitchCredentials(accountId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("read_social_account_credentials", { p_account_id: accountId });
  if (error) throw error;
  const credentials = (Array.isArray(data) ? data[0] : data) as StoredCredentials | null;
  if (!credentials?.access_token) throw new Error("Voor dit Twitch-account zijn geen OAuth-gegevens gevonden.");
  try {
    const validation = await validateTwitchToken(credentials.access_token);
    return { ...credentials, user_id: validation.user_id!, scopes: validation.scopes ?? [], expires_at: new Date(Date.now() + (validation.expires_in ?? 0) * 1000).toISOString() };
  } catch {
    if (!credentials.refresh_token) throw new Error("Het Twitch-token is verlopen en er is geen refresh-token. Koppel het kanaal opnieuw.");
    const refreshed = await refreshTwitchToken(credentials.refresh_token);
    const expiresAt = new Date(Date.now() + (refreshed.expires_in ?? 14_400) * 1000).toISOString();
    const { error: storeError } = await admin.rpc("store_social_account_credentials", { p_account_id: accountId, p_access_token: refreshed.access_token, p_refresh_token: refreshed.refresh_token ?? credentials.refresh_token, p_expires_at: expiresAt });
    if (storeError) throw storeError;
    const validation = await validateTwitchToken(refreshed.access_token!);
    return { access_token: refreshed.access_token!, refresh_token: refreshed.refresh_token ?? credentials.refresh_token, expires_at: expiresAt, user_id: validation.user_id!, scopes: validation.scopes ?? [] };
  }
}
