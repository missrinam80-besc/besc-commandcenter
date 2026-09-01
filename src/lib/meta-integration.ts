import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type MetaPlatform = "facebook" | "instagram";

const facebookScopes = ["pages_show_list", "pages_read_engagement"];
const instagramScopes = [...facebookScopes, "instagram_basic", "instagram_manage_insights"];

export function metaScopes(platform: MetaPlatform) {
  return platform === "instagram" ? instagramScopes : facebookScopes;
}

export function metaConfiguration(platform: MetaPlatform = "facebook") {
  const appId = (process.env.META_APP_ID ?? "").trim();
  const appSecret = (process.env.META_APP_SECRET ?? "").trim();
  const apiVersion = (process.env.META_GRAPH_API_VERSION ?? "").trim().replace(/^\//, "");
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  const supabaseSecret = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  const missing = [
    !appId && "META_APP_ID",
    !appSecret && "META_APP_SECRET",
    !apiVersion && "META_GRAPH_API_VERSION",
    !siteUrl && "NEXT_PUBLIC_SITE_URL",
    !supabaseSecret && "SUPABASE_SECRET_KEY",
  ].filter(Boolean) as string[];
  return {
    configured: missing.length === 0,
    appId,
    appSecret,
    apiVersion,
    siteUrl,
    callbackUrl: `${siteUrl}/app/integraties/social/meta/callback`,
    platform,
    missing,
  };
}

type MetaError = { error?: { message?: string; type?: string; code?: number } };

async function metaJson<T>(url: string, accessToken?: string): Promise<T> {
  const response = await fetch(url, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    cache: "no-store",
  });
  const body = await response.json() as T & MetaError;
  if (!response.ok || body.error) throw new Error(body.error?.message || `Meta API-fout (${response.status}).`);
  return body;
}

export async function exchangeMetaCode(code: string) {
  const config = metaConfiguration();
  if (!config.configured) throw new Error(`Meta-configuratie ontbreekt: ${config.missing.join(", ")}`);
  const shortParameters = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.callbackUrl,
    code,
  });
  const shortToken = await metaJson<{ access_token?: string; token_type?: string; expires_in?: number }>(
    `https://graph.facebook.com/${config.apiVersion}/oauth/access_token?${shortParameters.toString()}`,
  );
  if (!shortToken.access_token) throw new Error("Meta gaf geen toegangstoken terug.");
  const longParameters = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: shortToken.access_token,
  });
  const longToken = await metaJson<{ access_token?: string; token_type?: string; expires_in?: number }>(
    `https://graph.facebook.com/${config.apiVersion}/oauth/access_token?${longParameters.toString()}`,
  );
  if (!longToken.access_token) throw new Error("Het Meta-token kon niet worden verlengd.");
  return longToken;
}

export type MetaManagedAsset = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string };
};

export async function fetchMetaManagedAssets(userAccessToken: string) {
  const config = metaConfiguration();
  const fields = "id,name,access_token,instagram_business_account{id,username}";
  const result = await metaJson<{ data?: MetaManagedAsset[] }>(
    `https://graph.facebook.com/${config.apiVersion}/me/accounts?fields=${encodeURIComponent(fields)}&limit=100`,
    userAccessToken,
  );
  return result.data ?? [];
}

export function selectMetaAsset(assets: MetaManagedAsset[], platform: MetaPlatform, preferredId?: string | null) {
  if (platform === "facebook") {
    const page = preferredId ? assets.find((item) => item.id === preferredId) : assets[0];
    if (!page?.id || !page.access_token) throw new Error("Geen beheerbare Facebook-pagina gevonden. Vul eventueel vooraf het pagina-ID in.");
    return { externalId: page.id, name: page.name || "BESC Facebook", accessToken: page.access_token, accountType: "page" };
  }
  const page = preferredId
    ? assets.find((item) => item.instagram_business_account?.id === preferredId || item.id === preferredId)
    : assets.find((item) => item.instagram_business_account?.id);
  const instagram = page?.instagram_business_account;
  if (!page?.access_token || !instagram?.id) throw new Error("Geen professioneel Instagram-account gevonden dat aan een beheerbare Facebook-pagina is gekoppeld.");
  return { externalId: instagram.id, name: instagram.username || page.name || "BESC Instagram", accessToken: page.access_token, accountType: "professional" };
}

type StoredCredentials = { access_token: string; refresh_token: string | null; expires_at: string | null };

export async function usableMetaCredentials(accountId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("read_social_account_credentials", { p_account_id: accountId });
  if (error) throw error;
  const credentials = (Array.isArray(data) ? data[0] : data) as StoredCredentials | null;
  if (!credentials?.access_token) throw new Error("Voor dit Meta-account zijn geen OAuth-gegevens gevonden.");
  if (credentials.expires_at && new Date(credentials.expires_at).valueOf() < Date.now() + 120_000) {
    throw new Error("Het Meta-toegangstoken is verlopen. Koppel het account opnieuw.");
  }
  return credentials;
}

export async function fetchFacebookMetrics(accessToken: string, pageId: string) {
  const config = metaConfiguration("facebook");
  const profile = await metaJson<{ id: string; name?: string; fan_count?: number; followers_count?: number; link?: string }>(
    `https://graph.facebook.com/${config.apiVersion}/${pageId}?fields=id,name,fan_count,followers_count,link`,
    accessToken,
  );
  let insights: { data?: Array<{ name: string; period?: string; values?: Array<{ value?: number; end_time?: string }> }> } = { data: [] };
  let insightError: string | null = null;
  try {
    insights = await metaJson(
      `https://graph.facebook.com/${config.apiVersion}/${pageId}/insights?metric=page_impressions_unique,page_post_engagements&period=days_28`,
      accessToken,
    );
  } catch (error) {
    insightError = error instanceof Error ? error.message : "Facebook Insights niet beschikbaar.";
  }
  return { profile, insights: insights.data ?? [], insightError };
}

export async function fetchInstagramMetrics(accessToken: string, instagramId: string, since: number, until: number) {
  const config = metaConfiguration("instagram");
  const profile = await metaJson<{ id: string; username?: string; followers_count?: number; follows_count?: number; media_count?: number }>(
    `https://graph.facebook.com/${config.apiVersion}/${instagramId}?fields=id,username,followers_count,follows_count,media_count`,
    accessToken,
  );
  const parameters = new URLSearchParams({ metric: "reach,profile_views", period: "day", since: String(since), until: String(until) });
  const insights = await metaJson<{ data?: Array<{ name: string; period?: string; values?: Array<{ value?: number; end_time?: string }> }> }>(
    `https://graph.facebook.com/${config.apiVersion}/${instagramId}/insights?${parameters.toString()}`,
    accessToken,
  );
  return { profile, insights: insights.data ?? [] };
}
