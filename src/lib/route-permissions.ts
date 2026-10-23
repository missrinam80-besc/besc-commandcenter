import { hasPermission, type Capability, type MembershipAccess } from "./permissions.ts";

const adminOnlyPrefixes = [
  "/app/beheer",
  "/app/integraties",
];

const memberHiddenPrefixes = [
  "/app/administratie",
  "/app/integraties",
  "/app/beheer",
  "/app/rapportage/management",
  "/app/rapportage/events",
];

const volunteerExactPaths = [
  "/app",
  "/app/account",
  "/app/meldingen",
  "/app/taken",
  "/app/kalender",
  "/app/kennisbank",
];

const volunteerPrefixes = [
  "/app/account/",
  "/app/meldingen/",
  "/app/taken/",
  "/app/kalender/",
  "/app/kennisbank/",
];

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function canViewFinancePath(pathname: string, searchParams: URLSearchParams, membership: MembershipAccess) {
  if (membership.role === "admin" || membership.role === "board" || membership.finance_role !== "none") return true;
  return (pathname === "/app/financien" && searchParams.get("nieuw") === "kost") ||
    (/^\/app\/financien\/kosten\/[^/]+$/.test(pathname) && !searchParams.has("bewerken") && !searchParams.has("nieuw"));
}

export function canViewInternalPath(pathname: string, membership: MembershipAccess, searchParams = new URLSearchParams()) {
  if (pathname === "/app/campagnes/bijdragen") return ["admin", "board", "member", "volunteer"].includes(membership.role);
  // These entry points enforce current campaign roles/own participation in their
  // RPCs. Do not require general campaign-management access before that check.
  if (/^\/app\/campagnes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/proef(?:\/rapport(?:\/export)?)?$/.test(pathname)) {
    return ["admin", "board", "member", "volunteer"].includes(membership.role);
  }
  // The workbench checks its explicit workflow assignments in the database.
  if (pathname === "/app/administratie/werkstromen" || pathname === "/app/administratie/platform" || pathname === "/app/administratie/aanvragen" || pathname === "/app/administratie/partners-publicatie" || pathname === "/app/administratie/vacatures") return ["admin", "board", "member", "volunteer"].includes(membership.role);
  if (pathname === "/app/bucks" || pathname.startsWith("/app/bucks/")) return ["admin", "board", "member", "volunteer"].includes(membership.role);
  if (pathname === "/app/beheer/discordbot" || pathname.startsWith("/app/beheer/discordbot/")) return hasPermission(membership, "manageDiscordBot");
  if (pathname === "/app/tickets" || pathname.startsWith("/app/tickets/")) return hasPermission(membership, "manageTickets");
  if (membership.role === "admin") return true;
  if (startsWithAny(pathname, adminOnlyPrefixes)) return false;
  if (membership.role === "board") return true;
  if (membership.role === "volunteer") {
    if (pathname.startsWith("/app/financien")) return canViewFinancePath(pathname, searchParams, membership);
    return volunteerExactPaths.includes(pathname) || volunteerPrefixes.some((prefix) => pathname.startsWith(prefix));
  }
  if (membership.role === "member") {
    if (startsWithAny(pathname, memberHiddenPrefixes)) return false;
    if (pathname.startsWith("/app/financien")) return canViewFinancePath(pathname, searchParams, membership);
    return true;
  }
  return false;
}

export function requiredCapabilityForQuery(
  pathname: string,
  searchParams: URLSearchParams,
): Capability | null {
  if (pathname === "/app/bucks" && ["beheer", "regels", "historiek"].includes(searchParams.get("tab") ?? "")) return "manageRewards";
  if (pathname === "/app/beheer/discordbot" || pathname.startsWith("/app/beheer/discordbot/")) return "manageDiscordBot";
  const createMode = searchParams.get("nieuw");
  const editMode = searchParams.has("bewerken");
  if (pathname === "/app/tickets" || pathname.startsWith("/app/tickets/")) return "manageTickets";
  if (!createMode && !editMode) return null;

  if (pathname === "/app/taken") return null;
  if (/^\/app\/projecten\/[^/]+$/.test(pathname) && createMode === "taak") return null;

  if (pathname.startsWith("/app/financien")) {
    if (pathname.includes("/kosten/") && editMode) return null;
    if (pathname === "/app/financien" && createMode === "kost") return null;
    return "manageFinance";
  }

  if (pathname.startsWith("/app/beheer")) return "manageUsers";
  if (pathname.startsWith("/app/inbox")) return editMode ? "manageInbox" : null;
  if (pathname.startsWith("/app/projecten")) return "manageProjects";
  if (pathname.startsWith("/app/content")) return "manageContent";
  if (pathname.startsWith("/app/events")) return "manageEvents";
  if (pathname.startsWith("/app/rapportage")) return "manageKpis";
  if (pathname.startsWith("/app/ai-hub")) return "manageAiTemplates";
  if (pathname.startsWith("/app/integraties")) return "manageIntegrations";
  return "manageOrganization";
}
