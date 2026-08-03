import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const threadsScopes = ["threads_basic", "threads_manage_insights"];

export function threadsConfiguration() {
  const appId = (process.env.THREADS_APP_ID ?? "").trim();
  const appSecret = (process.env.THREADS_APP_SECRET ?? "").trim();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  const supabaseSecret = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  const missing = [
    !appId && "THREADS_APP_ID",
    !appSecret && "THREADS_APP_SECRET",
    !siteUrl && "NEXT_PUBLIC_SITE_URL",
    !supabaseSecret && "SUPABASE_SECRET_KEY",
  ].filter(Boolean) as string[];
  return { configured: missing.length === 0, appId, appSecret, siteUrl, callbackUrl: `${siteUrl}/app/integraties/social/threads/callback`, missing };
}

type ThreadsToken = { access_token?: string; user_id?: string; expires_in?: number; error_message?: string; error?: { message?: string } };

async function threadsJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const body = await response.json() as T & ThreadsToken;
  if (!response.ok || body.error) throw new Error(body.error?.message || body.error_message || `Threads API-fout (${response.status}).`);
  return body;
}

export async function exchangeThreadsCode(code: string) {
  const config = threadsConfiguration();
  if (!config.configured) throw new Error(`Threads-configuratie ontbreekt: ${config.missing.join(", ")}`);
  const shortParameters = new URLSearchParams({
    client_id: config.appId, client_secret: config.appSecret, code,
    grant_type: "authorization_code", redirect_uri: config.callbackUrl,
  });
  const short = await threadsJson<ThreadsToken>(`https://graph.threads.net/oauth/access_token?${shortParameters.toString()}`, { method: "POST" });
  if (!short.access_token) throw new Error("Threads gaf geen toegangstoken terug.");
  const longParameters = new URLSearchParams({ grant_type: "th_exchange_token", client_secret: config.appSecret, access_token: short.access_token });
  const long = await threadsJson<ThreadsToken>(`https://graph.threads.net/access_token?${longParameters.toString()}`);
  if (!long.access_token) throw new Error("Het Threads-token kon niet worden verlengd.");
  return { ...long, user_id: short.user_id };
}

export async function refreshThreadsToken(accessToken: string) {
  const parameters = new URLSearchParams({ grant_type: "th_refresh_token", access_token: accessToken });
  const refreshed = await threadsJson<ThreadsToken>(`https://graph.threads.net/refresh_access_token?${parameters.toString()}`);
  if (!refreshed.access_token) throw new Error("Threads gaf bij vernieuwing geen toegangstoken terug.");
  return refreshed;
}

export async function fetchThreadsProfile(accessToken: string) {
  const fields = "id,username,name,threads_profile_picture_url,threads_biography";
  return threadsJson<{ id: string; username?: string; name?: string }>(`https://graph.threads.net/me?fields=${fields}`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

export async function fetchThreadsInsights(accessToken: string, since: number, until: number) {
  const parameters = new URLSearchParams({
    metric: "views,likes,replies,reposts,quotes,clicks,followers_count",
    since: String(since), until: String(until),
  });
  return threadsJson<{ data?: Array<{ name: string; period?: string; values?: Array<{ value?: number; end_time?: string }>; total_value?: { value?: number } }> }>(
    `https://graph.threads.net/me/threads_insights?${parameters.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

type StoredCredentials = { access_token: string; refresh_token: string | null; expires_at: string | null };

export async function usableThreadsCredentials(accountId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("read_social_account_credentials", { p_account_id: accountId });
  if (error) throw error;
  const credentials = (Array.isArray(data) ? data[0] : data) as StoredCredentials | null;
  if (!credentials?.access_token) throw new Error("Voor dit Threads-account zijn geen OAuth-gegevens gevonden.");
  const refreshNeeded = !credentials.expires_at || new Date(credentials.expires_at).valueOf() < Date.now() + 7 * 24 * 60 * 60 * 1000;
  if (!refreshNeeded) return credentials;
  const refreshed = await refreshThreadsToken(credentials.access_token);
  const expiresAt = new Date(Date.now() + (refreshed.expires_in ?? 5_184_000) * 1000).toISOString();
  const { error: storeError } = await admin.rpc("store_social_account_credentials", {
    p_account_id: accountId, p_access_token: refreshed.access_token, p_refresh_token: null, p_expires_at: expiresAt,
  });
  if (storeError) throw storeError;
  return { access_token: refreshed.access_token!, refresh_token: null, expires_at: expiresAt };
}
