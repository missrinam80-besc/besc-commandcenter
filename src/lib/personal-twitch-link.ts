import type { UserIdentity } from "@supabase/supabase-js";
import { findIdentity, twitchIdentityDetails } from "./profile-identities.ts";

export const twitchCallbackPath = "/auth/twitch-link/callback";
const account = "/app/account";
export const twitchLinkFailure = `${account}?fout=twitch-link`;

export function personalTwitchLinkEnabled() {
  return process.env.BESC_TWITCH_IDENTITY_LINKING_ENABLED === "true";
}

/** Never derive an OAuth redirect from forwarded/Host headers. */
export function personalTwitchOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    return url.origin;
  } catch { return null; }
}

type AuthUser = { id: string; identities?: UserIdentity[] };
type UserResult = { user: AuthUser | null; error: unknown };
export type TwitchCallbackPorts = {
  getUser: () => Promise<UserResult>;
  exchangeCode: (code: string) => Promise<{ error: unknown }>;
  isActiveMember: (userId: string) => Promise<boolean>;
  clearLocalSession: () => Promise<void>;
};

/** Supabase owns PKCE and OAuth state; CC also rejects a changed BESC session. */
export async function completePersonalTwitchLink(
  params: URLSearchParams,
  enabled: boolean,
  ports: TwitchCallbackPorts,
) {
  if (!enabled) return `${account}?fout=twitch-uitgeschakeld`;
  const codes = params.getAll("code");
  if (params.has("error")) return `${account}?fout=twitch-geannuleerd`;
  if (codes.length !== 1 || !codes[0] || codes[0].length > 2048) return twitchLinkFailure;
  try {
    const before = await ports.getUser();
    if (before.error || !before.user) return "/login?error=twitch-sessie";
    if (!await ports.isActiveMember(before.user.id)) return "/wachten-op-goedkeuring";
    const exchange = await ports.exchangeCode(codes[0]);
    if (exchange.error) return twitchLinkFailure;
    const after = await ports.getUser();
    if (after.error || !after.user || after.user.id !== before.user.id) {
      await ports.clearLocalSession();
      return "/login?error=twitch-sessie";
    }
    if (!await ports.isActiveMember(after.user.id)) return "/wachten-op-goedkeuring";
    const identity = twitchIdentityDetails(findIdentity(after.user.identities, "twitch"));
    return identity ? `${account}?succes=twitch` : twitchLinkFailure;
  } catch {
    // Never reflect OAuth codes, provider messages, tokens or identity details.
    return twitchLinkFailure;
  }
}

type IdentityList = { identities: UserIdentity[]; error: unknown };
export async function removePersonalTwitchLink(ports: {
  getIdentities: () => Promise<IdentityList>;
  unlink: (identity: UserIdentity) => Promise<{ error: unknown }>;
}) {
  try {
    const result = await ports.getIdentities();
    if (result.error) return `${account}?fout=identiteiten-ophalen`;
    const identity = findIdentity(result.identities, "twitch");
    if (!identity) return `${account}?fout=twitch-niet-gekoppeld`;
    if (result.identities.length < 2) return `${account}?fout=laatste-inlogmethode`;
    const unlinked = await ports.unlink(identity);
    return unlinked.error ? `${account}?fout=twitch-ontkoppelen` : `${account}?succes=twitch-ontkoppeld`;
  } catch { return `${account}?fout=twitch-ontkoppelen`; }
}
