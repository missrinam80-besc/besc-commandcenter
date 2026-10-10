import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { discordIdentityDetails, findIdentity } from "@/lib/profile-identities";
import type { BotStore, BotMember, BotEvent } from "./bot-api";

// Admin key stays inside Command Center. Every read is narrowed by verified actor and server-selected organization.
export function createBotStore(admin = createAdminClient()): BotStore {
  return {
    async findAccount(discordId) {
      const profile = await admin.from("profiles").select("id").eq("discord_user_id", discordId).maybeSingle();
      if (profile.error) throw Error("store_unavailable");
      if (!profile.data) return null;
      const auth = await admin.auth.admin.getUserById(profile.data.id);
      if (auth.error) {
        if (auth.error.status === 404) return null;
        throw Error("store_unavailable");
      }
      if (!auth.data.user) return null;
      const bannedUntil = (auth.data.user as typeof auth.data.user & { banned_until?: string }).banned_until;
      return { userId: profile.data.id,
        verifiedDiscordId: discordIdentityDetails(findIdentity(auth.data.user.identities, "discord"))?.userId ?? null,
        banned: Boolean(bannedUntil && (!Number.isFinite(Date.parse(bannedUntil)) || Date.parse(bannedUntil) > Date.now())) };
    },
    async findMembership(userId, organizationId) {
      const result = await admin.from("organization_members")
        .select("organization_id,role,status,finance_role,organization_access_roles(organization_id,deleted_at,capabilities)")
        .eq("user_id", userId).eq("organization_id", organizationId).eq("status", "active").maybeSingle();
      if (result.error) throw Error("store_unavailable");
      if (!result.data) return null;
      const member = result.data as unknown as BotMember & {
        organization_access_roles: { organization_id: string; deleted_at: string | null; capabilities: string[] | null } | null;
      };
      const role = member.organization_access_roles;
      return { organization_id: member.organization_id, role: member.role, status: member.status,
        finance_role: member.finance_role,
        capabilities: role && role.organization_id === organizationId && role.deleted_at === null ? role.capabilities : null };
    },
    async listEvents(organizationId, offset, count) {
      const result = await admin.from("events")
        .select("id,title,status,event_type,start_at,start_date,location,is_online")
        .eq("organization_id", organizationId).is("deleted_at", null)
        .order("start_date", { ascending: true, nullsFirst: false }).order("id", { ascending: true })
        .range(offset, offset + count - 1);
      if (result.error) throw Error("store_unavailable");
      return (result.data ?? []) as BotEvent[];
    },
  };
}
