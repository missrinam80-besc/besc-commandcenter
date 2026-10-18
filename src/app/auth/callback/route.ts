import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { discordIdentityDetails, findIdentity } from "@/lib/profile-identities";
import { createClient } from "@/lib/supabase/server";
import { resolveAuthenticatedHome } from "@/lib/auth-destination";
import { internalAuthDestination } from "@/lib/auth-redirect";

const emailOtpTypes = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const type = rawType && emailOtpTypes.has(rawType as EmailOtpType)
    ? rawType as EmailOtpType
    : null;
  const requestedNext = searchParams.get("next");
  const fallbackNext = type === "recovery"
    ? "/wachtwoord-instellen"
    : type === "email_change"
      ? "/app/account?succes=email-bevestigd"
      : "/app";
  const next = internalAuthDestination(requestedNext, fallbackNext);

  if (code || (tokenHash && type)) {
    const supabase = await createClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const discord = discordIdentityDetails(findIdentity(user.identities, "discord"));
        if (discord) {
          await supabase.from("profiles").update({
            discord_user_id: discord.userId,
            discord_username: discord.username,
            discord_avatar_url: discord.avatarUrl,
            updated_at: new Date().toISOString(),
          }).eq("id", user.id);
        }
      }
      const destination = user && next === "/app" ? await resolveAuthenticatedHome(supabase, user.id) : next;
      return NextResponse.redirect(new URL(destination, siteUrl));
    }
  }
  const failurePath = type === "recovery"
    ? "/login?error=recovery-sessie"
    : type === "email_change"
      ? "/app/account?fout=email-bevestigen"
      : "/login?error=callback";
  return NextResponse.redirect(new URL(failurePath, siteUrl));
}
