import type { UserIdentity } from "@supabase/supabase-js";

type IdentityData = Record<string, unknown>;

function textValue(data: IdentityData, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function findIdentity(identities: UserIdentity[] | undefined, provider: string) {
  return identities?.find((identity) => identity.provider === provider) ?? null;
}

export function discordIdentityDetails(identity: UserIdentity | null) {
  if (!identity) return null;
  const data = (identity.identity_data ?? {}) as IdentityData;
  return {
    userId: textValue(data, ["provider_id", "sub"]) || identity.id,
    username: textValue(data, ["user_name", "preferred_username", "full_name", "name", "email"]),
    avatarUrl: textValue(data, ["avatar_url", "picture"]),
  };
}

/** Only use identities returned by Auth.getUser/getUserIdentities, never user_metadata. */
export function twitchIdentityDetails(identity: UserIdentity | null) {
  if (!identity || identity.provider !== "twitch") return null;
  const data = (identity.identity_data ?? {}) as IdentityData;
  const ids = [data.sub, data.provider_id].filter((value) => value !== undefined && value !== null);
  if (!ids.length || ids.some((value) => typeof value !== "string" || !/^[1-9]\d{0,19}$/.test(value))) return null;
  if (new Set(ids).size !== 1) return null;
  return {
    userId: ids[0] as string,
    username: textValue(data, ["preferred_username", "user_name", "name"]),
  };
}
