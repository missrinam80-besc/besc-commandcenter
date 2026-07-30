import { NextResponse } from "next/server";
import { discordIdentityDetails, findIdentity } from "@/lib/profile-identities";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next")?.startsWith("/") ? searchParams.get("next")! : "/";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
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
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=callback", origin));
}
