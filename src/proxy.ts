import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasPermission } from "@/lib/permissions";
import { canViewInternalPath, requiredCapabilityForQuery } from "@/lib/route-permissions";
import { isSupabaseConfigured } from "@/lib/supabase/configured";
import { getSupabaseServerUrl } from "@/lib/supabase/url";
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
  const supabase = createServerClient(getSupabaseServerUrl(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: items => { items.forEach(({name,value}) => request.cookies.set(name,value)); response = NextResponse.next({request}); items.forEach(({name,value,options}) => response.cookies.set(name,value,options)); } } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && request.nextUrl.pathname.startsWith("/app")) return redirectWithCookies(new URL("/login", request.url), response);
  if (user && request.nextUrl.pathname === "/login") return redirectWithCookies(new URL(await resolveAuthenticatedHome(supabase, user.id), request.url), response);

  const shouldCheckAppAccess = Boolean(user && request.nextUrl.pathname.startsWith("/app"));
  const capability = shouldCheckAppAccess
    ? requiredCapabilityForQuery(request.nextUrl.pathname, request.nextUrl.searchParams)
    : null;
  if (user && shouldCheckAppAccess) {
    const enriched = await supabase
      .from("organization_members")
      .select("organization_id,role,finance_role,status,organization_access_roles(organization_id,deleted_at,capabilities)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    const { data: membership } = enriched.error
      ? await supabase
        .from("organization_members")
        .select("organization_id,role,finance_role,status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle()
      : enriched;
    if (!membership) {
      return redirectWithCookies(new URL("/wachten-op-goedkeuring", request.url), response);
    }
    const customRole = (membership as { organization_access_roles?: { organization_id: string; deleted_at: string | null; capabilities?: string[] | null } | null }).organization_access_roles;
    const access = { ...membership, capabilities: customRole && customRole.organization_id === membership.organization_id && customRole.deleted_at === null ? customRole.capabilities ?? null : null };
    if (!canViewInternalPath(request.nextUrl.pathname, access, request.nextUrl.searchParams)) {
      return redirectWithCookies(new URL("/app?fout=geen-toegang", request.url), response);
    }
    if (capability && !hasPermission(access, capability)) {
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
