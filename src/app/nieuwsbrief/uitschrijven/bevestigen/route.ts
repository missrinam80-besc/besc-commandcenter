import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  let confirmed = false;
  if (token.length >= 32 && token.length <= 200) {
    const supabase = await createClient();
    const result = await supabase.rpc("confirm_newsletter_unsubscription", {
      p_token_hash: createHash("sha256").update(token).digest("hex"),
    });
    confirmed = result.data === true && !result.error;
  }
  return NextResponse.redirect(new URL(`/nieuwsbrief/status?resultaat=${confirmed ? "uitgeschreven" : "ongeldig"}`, url.origin));
}
