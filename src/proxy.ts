import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasPermission } from "@/lib/permissions";
import { requiredCapabilityForQuery } from "@/lib/route-permissions";
import { isSupabaseConfigured } from "@/lib/supabase/configured";
import { resolveAuthenticatedHome } from "@/lib/auth-destination";

function redirectWithCookies(url: URL, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
  }
  return redirectResponse;
}

export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: items => { items.forEach(({name,value}) => request.cookies.set(name,value)); response = NextResponse.next({request}); items.forEach(({name,value,options}) => response.cookies.set(name,value,options)); } } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && request.nextUrl.pathname.startsWith("/app")) return redirectWithCookies(new URL("/login", request.url), response);
  if (user && request.nextUrl.pathname === "/login") return redirectWithCookies(new URL(await resolveAuthenticatedHome(supabase, user.id), request.url), response);

  const capability = user && request.nextUrl.pathname.startsWith("/app")
    ? requiredCapabilityForQuery(request.nextUrl.pathname, request.nextUrl.searchParams)
    : null;
  if (user && capability) {
    const enriched = await supabase
      .from("organization_members")
      .select("role,finance_role,status,organization_access_roles(capabilities)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    const { data: membership } = enriched.error
      ? await supabase
        .from("organization_members")
        .select("role,finance_role,status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle()
      : enriched;
    if (!membership) {
      return redirectWithCookies(new URL("/wachten-op-goedkeuring", request.url), response);
    }
    const customRole = (membership as { organization_access_roles?: { capabilities?: string[] | null } | null }).organization_access_roles;
    if (!hasPermission({ ...membership, capabilities: customRole?.capabilities ?? null }, capability)) {
      const destination = request.nextUrl.clone();
      destination.searchParams.delete("nieuw");
      destination.searchParams.delete("bewerken");
      destination.searchParams.set("fout", "geen-toegang");
      return redirectWithCookies(destination, response);
    }
  }
  return response;
}
export const config = { matcher: ["/app/:path*", "/login"] };
