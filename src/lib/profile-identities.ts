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
