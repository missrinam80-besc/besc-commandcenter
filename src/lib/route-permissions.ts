import type { Capability } from "@/lib/permissions";

export function requiredCapabilityForQuery(
  pathname: string,
  searchParams: URLSearchParams,
): Capability | null {
  const createMode = searchParams.get("nieuw");
  const editMode = searchParams.has("bewerken");
  if (!createMode && !editMode) return null;

  if (pathname === "/app/taken") return null;
  if (/^\/app\/projecten\/[^/]+$/.test(pathname) && createMode === "taak") return null;

  if (pathname.startsWith("/app/financien")) {
    if (pathname.includes("/kosten/") && editMode) return null;
    if (pathname === "/app/financien" && createMode === "kost") return null;
    return "manageFinance";
  }

  if (pathname.startsWith("/app/inbox")) return "manageInbox";
  if (pathname.startsWith("/app/projecten")) return "manageProjects";
  if (pathname.startsWith("/app/content")) return "manageContent";
  if (pathname.startsWith("/app/events")) return "manageEvents";
  if (pathname.startsWith("/app/rapportage")) return "manageKpis";
  if (pathname.startsWith("/app/ai-hub")) return "manageAiTemplates";
  if (pathname.startsWith("/app/integraties")) return "manageIntegrations";
  return "manageOrganization";
}
