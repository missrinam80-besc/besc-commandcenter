"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth-context";
import { discordIdentityDetails, findIdentity } from "@/lib/profile-identities";

async function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${protocol}://${host}` : "http://localhost:3000";
}

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional();

export async function saveProfile(formData: FormData) {
  const parsed = z.object({
    display_name: z.string().trim().min(2).max(180),
    first_name: optionalText(100),
    last_name: optionalText(100),
    pronouns: optionalText(80),
    bio: optionalText(1200),
    location: optionalText(180),
    preferred_language: z.enum(["nl", "fr", "en"]),
    timezone: z.string().trim().min(1).max(100),
    website_url: z.union([z.string().trim().url().max(500), z.literal("")]).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/account?fout=profiel-velden");

  const { supabase, user } = await requireActiveMembership();
  const values = {
    display_name: parsed.data.display_name,
    first_name: parsed.data.first_name || null,
    last_name: parsed.data.last_name || null,
    pronouns: parsed.data.pronouns || null,
    bio: parsed.data.bio || null,
    location: parsed.data.location || null,
    preferred_language: parsed.data.preferred_language,
    timezone: parsed.data.timezone,
    website_url: parsed.data.website_url || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("profiles").update(values).eq("id", user.id);
  if (error) redirect("/app/account?fout=profiel-opslaan");
  await supabase.auth.updateUser({
    data: {
      display_name: parsed.data.display_name,
      full_name: [parsed.data.first_name, parsed.data.last_name].filter(Boolean).join(" ") || parsed.data.display_name,
    },
  });
  revalidatePath("/app/account");
  revalidatePath("/app");
  redirect("/app/account?succes=profiel");
}

export async function updateAccountEmail(formData: FormData) {
  const parsed = z.object({ email: z.string().trim().email().max(320) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/account?fout=email-ongeldig");
  const { supabase, user } = await requireActiveMembership();
  if (user.email?.toLowerCase() === parsed.data.email.toLowerCase()) redirect("/app/account?fout=email-ongewijzigd");
  const siteUrl = await getSiteUrl();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.email },
    { emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent("/app/account?succes=email-bevestigd")}` },
  );
  if (error) redirect("/app/account?fout=email-wijzigen");
  redirect("/app/account?succes=email-verstuurd");
}

export async function updateAccountPassword(formData: FormData) {
  const parsed = z.object({
    password: z.string().min(8).max(200),
    confirm_password: z.string().min(8).max(200),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/account?fout=wachtwoord-eisen");
  if (parsed.data.password !== parsed.data.confirm_password) redirect("/app/account?fout=wachtwoorden-verschillen");
  const { supabase } = await requireActiveMembership();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) redirect("/app/account?fout=wachtwoord-wijzigen");
  redirect("/app/account?succes=wachtwoord");
}

export async function linkDiscordIdentity() {
  const { supabase } = await requireActiveMembership();
  const siteUrl = await getSiteUrl();
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "discord",
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent("/app/account?succes=discord")}`,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) redirect("/app/account?fout=discord-link");
  redirect(data.url);
}

export async function unlinkDiscordIdentity() {
  const { supabase, user } = await requireActiveMembership();
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) redirect("/app/account?fout=identiteiten-ophalen");
  const discord = findIdentity(data.identities, "discord");
  if (!discord) redirect("/app/account?fout=discord-niet-gekoppeld");
  if (data.identities.length < 2) redirect("/app/account?fout=laatste-inlogmethode");
  const result = await supabase.auth.unlinkIdentity(discord);
  if (result.error) redirect("/app/account?fout=discord-ontkoppelen");
  await supabase.from("profiles").update({
    discord_user_id: null,
    discord_username: null,
    discord_avatar_url: null,
    updated_at: new Date().toISOString(),
  }).eq("id", user.id);
  revalidatePath("/app/account");
  redirect("/app/account?succes=discord-ontkoppeld");
}

export async function useDiscordProfile() {
  const { supabase, user } = await requireActiveMembership();
  const discord = discordIdentityDetails(findIdentity(user.identities, "discord"));
  if (!discord) redirect("/app/account?fout=discord-niet-gekoppeld");
  const { error } = await supabase.from("profiles").update({
    display_name: discord.username,
    avatar_url: discord.avatarUrl,
    discord_user_id: discord.userId,
    discord_username: discord.username,
    discord_avatar_url: discord.avatarUrl,
    updated_at: new Date().toISOString(),
  }).eq("id", user.id);
  if (error) redirect("/app/account?fout=discord-profiel");
  revalidatePath("/app/account");
  redirect("/app/account?succes=discord-profiel");
}
