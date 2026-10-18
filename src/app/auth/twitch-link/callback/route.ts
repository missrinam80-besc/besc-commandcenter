import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  completePersonalTwitchLink, personalTwitchLinkEnabled, personalTwitchOrigin,
} from "@/lib/personal-twitch-link";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = personalTwitchOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  const responseHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (!origin) return new NextResponse("Accountkoppeling is niet geconfigureerd.", { status: 503, headers: responseHeaders });
  const supabase = await createClient();
  const destination = await completePersonalTwitchLink(new URL(request.url).searchParams, personalTwitchLinkEnabled(), {
    async getUser() {
      const { data, error } = await supabase.auth.getUser();
      return { user: data.user, error };
    },
    async exchangeCode(code) { return supabase.auth.exchangeCodeForSession(code); },
    async isActiveMember(userId) {
      const { data, error } = await supabase.from("organization_members")
        .select("organization_id").eq("user_id", userId).eq("status", "active").limit(1);
      return !error && Boolean(data?.length);
    },
    async clearLocalSession() { await supabase.auth.signOut({ scope: "local" }); },
  });
  return NextResponse.redirect(new URL(destination, origin), { status: 303, headers: responseHeaders });
}
