import { hasPermission, type Capability, type FinanceRole, type MembershipAccess, type OrganizationRole } from "./permissions.ts";
import { canViewInternalPath } from "./route-permissions.ts";
import { canReviewApproval, type ApprovalEntityType } from "./approvals.ts";

export type AccessRoleKey =
  | "admin"
  | "board"
  | "volunteer"
  | "member"
  | "portal"
  | "streamteam"
  | "sponsor"
  | "expense_submitter"
  | "approver"
  | "treasurer";

export type AccessDecision = "yes" | "own" | "limited" | "no";

export type AccessArea = {
  key: string;
  label: string;
  view: AccessDecision;
  create: AccessDecision;
  edit: AccessDecision;
  archive: AccessDecision;
  delete: AccessDecision;
  export: AccessDecision;
  approve: AccessDecision;
  dataScope: string;
};

export const accessRoleLabels: Record<AccessRoleKey, string> = {
  admin: "Admin",
  board: "Bestuur",
  volunteer: "Vrijwilliger",
  member: "Crew",
  portal: "Portaalgebruiker",
  streamteam: "Streamteam",
  sponsor: "Sponsor",
  expense_submitter: "Kostenindiener",
  approver: "Goedkeurder",
  treasurer: "Boekhouder",
};

const roleMemberships: Partial<Record<AccessRoleKey, MembershipAccess>> = {
  admin: { role: "admin", finance_role: "none" },
  board: { role: "board", finance_role: "none" },
  volunteer: { role: "volunteer", finance_role: "none" },
  member: { role: "member", finance_role: "none" },
  expense_submitter: { role: "member", finance_role: "submitter" },
  approver: { role: "board", finance_role: "approver" },
  treasurer: { role: "board", finance_role: "treasurer" },
};

type AreaPolicy = {
  key: string;
  label: string;
  manageCapability?: Capability;
  viewCapability?: Capability;
  activeMemberView?: boolean;
  activeMemberCreate?: boolean;
  activeMemberEdit?: AccessDecision;
  managerExport?: boolean;
  financeExport?: boolean;
  approvalEntity?: ApprovalEntityType;
  dataScope?: string;
};

export const accessPolicies: AreaPolicy[] = [
  { key: "tickets", label: "Discordtickets", manageCapability: "manageTickets", viewCapability: "manageTickets", dataScope: "Alleen bevoegde ticketmedewerkers binnen de organisatie; geen algemene crewtoegang." },
  { key: "home", label: "Home", activeMemberView: true, dataScope: "Eigen werkvoorraad en organisatiedata binnen BESC." },
  { key: "inbox", label: "Inbox", manageCapability: "manageInbox", activeMemberView: true, dataScope: "Alle inboxitems binnen de organisatie." },
  { key: "tasks", label: "Taken", activeMemberView: true, activeMemberCreate: true, activeMemberEdit: "own", dataScope: "Organisatietaken; focus op eigen of toegewezen taken." },
  { key: "projects", label: "Projecten", manageCapability: "manageProjects", activeMemberView: true, managerExport: true, dataScope: "Alle projecten binnen BESC." },
  { key: "events", label: "Events", manageCapability: "manageEvents", activeMemberView: true, managerExport: true, dataScope: "Alle events binnen BESC." },
  { key: "campaigns", label: "Campagnes", manageCapability: "manageOrganization", activeMemberView: true, managerExport: true, dataScope: "Alle campagnes en activaties binnen BESC." },
  { key: "social", label: "Social planning", manageCapability: "manageContent", activeMemberView: true, managerExport: true, dataScope: "Social planning en gekoppelde KPI-data." },
  { key: "community", label: "Community & vrijwilligers", manageCapability: "manageOrganization", activeMemberView: true, dataScope: "Communitypersonen en vrijwilligersinformatie." },
  { key: "sponsors", label: "Sponsors & CRM", manageCapability: "manageOrganization", activeMemberView: true, managerExport: true, dataScope: "Partner- en sponsordossiers." },
  { key: "communication", label: "Communicatie", manageCapability: "manageOrganization", activeMemberView: true, approvalEntity: "email", dataScope: "Dossiercommunicatie en Gmail-conceptstatussen." },
  { key: "content", label: "Content", manageCapability: "manageContent", activeMemberView: true, managerExport: true, approvalEntity: "content", dataScope: "Contentitems, publicatieplanning en gekoppelde dossiers." },
  { key: "shop", label: "Shop & merchandise", manageCapability: "manageOrganization", activeMemberView: true, dataScope: "Producten, lanceringen en merchandiseplanning." },
  { key: "newsletters", label: "Nieuwsbrieven", manageCapability: "manageOrganization", managerExport: true, approvalEntity: "newsletter", dataScope: "Mailinglijsten, abonnees en nieuwsbrieven; beperkt tot bestuur/beheer." },
  { key: "ai", label: "AI Hub", manageCapability: "manageAiTemplates", activeMemberView: true, activeMemberCreate: true, dataScope: "Promptbibliotheek en AI-output binnen BESC." },
  { key: "meetings", label: "Vergaderingen & besluiten", manageCapability: "manageOrganization", activeMemberView: true, approvalEntity: "document", dataScope: "Vergaderingen, besluiten, actiepunten en notulenlinks." },
  { key: "administration", label: "VZW-administratie", manageCapability: "manageOrganization", dataScope: "Formele VZW-administratie; beperkt tot bestuur/beheer." },
  { key: "finance", label: "Financiën", manageCapability: "manageFinance", viewCapability: "viewFinance", activeMemberCreate: true, financeExport: true, approvalEntity: "expense", dataScope: "Kosten, budgetten en inkomsten volgens finance-rol." },
  { key: "materials", label: "Materialen & resources", manageCapability: "manageOrganization", activeMemberView: true, dataScope: "Streammateriaal, eventresources, hardware, licenties, locaties, waarde en dossierkoppelingen." },
  { key: "knowledge", label: "Kennisbank", manageCapability: "manageOrganization", activeMemberView: true, dataScope: "Interne handleidingen en procedures." },
  { key: "reports", label: "Rapportage & KPI", manageCapability: "manageKpis", activeMemberView: true, managerExport: true, dataScope: "KPI’s en rapporten; managementrapporten beperkt tot bestuur/beheer." },
  { key: "documents", label: "Documenten & Drive", manageCapability: "manageOrganization", activeMemberView: true, approvalEntity: "document", dataScope: "Alleen links en metadata; rechten blijven in Google Workspace." },
  { key: "integrations", label: "Integraties", manageCapability: "manageIntegrations", dataScope: "Technische koppelingen en syncstatussen; alleen Admin." },
  { key: "rights", label: "Rechtencontrole", manageCapability: "manageUsers", dataScope: "Rollen en profielen; alleen Admin." },
  { key: "import", label: "CSV-import", manageCapability: "manageUsers", dataScope: "Gegevensimport; alleen Admin." },
  { key: "history", label: "Historiek, archief & activiteit", manageCapability: "manageOrganization", dataScope: "Migratiehistoriek, archief en auditlog; beperkt tot bestuur/beheer." },
  { key: "users", label: "Gebruikers & toegang", manageCapability: "manageUsers", dataScope: "Accounts, rollen en portaaltoegang; alleen admin." },
];

function membershipFor(role: AccessRoleKey) {
  return roleMemberships[role] ?? null;
}

function isManagerLike(membership: MembershipAccess) {
  return membership.role === "admin" || membership.role === "board";
}

function canView(policy: AreaPolicy, membership: MembershipAccess | null): AccessDecision {
  if (!membership) return policy.key === "home" ? "no" : "no";
  const paths: Record<string, string> = {
    home: "/app", inbox: "/app/inbox", tickets: "/app/tickets", tasks: "/app/taken", projects: "/app/projecten", events: "/app/events",
    campaigns: "/app/campagnes", social: "/app/social", community: "/app/community", sponsors: "/app/sponsors",
    communication: "/app/communicatie", content: "/app/content", shop: "/app/shop", newsletters: "/app/nieuwsbrieven",
    ai: "/app/ai-hub", meetings: "/app/vergaderingen", administration: "/app/administratie", finance: "/app/financien",
    materials: "/app/materialen", knowledge: "/app/kennisbank", reports: "/app/rapportage", documents: "/app/documenten",
    integrations: "/app/integraties", rights: "/app/beheer/rechten", import: "/app/beheer/import", history: "/app/historiek", users: "/app/beheer/gebruikers",
  };
  if (!canViewInternalPath(paths[policy.key] ?? "/app", membership)) return "no";
  if (policy.viewCapability) return hasPermission(membership, policy.viewCapability) ? "yes" : "no";
  if (policy.activeMemberView) return "yes";
  if (policy.manageCapability) return hasPermission(membership, policy.manageCapability) ? "yes" : "no";
  return "no";
}

function canCreate(policy: AreaPolicy, membership: MembershipAccess | null): AccessDecision {
  if (policy.key === "tickets") return "no"; // Intake belongs to the limited bot API.
  if (!membership) return "no";
  if (policy.key === "finance" && hasPermission(membership, "submitExpenses")) return policy.manageCapability && hasPermission(membership, policy.manageCapability) ? "yes" : "own";
  if (policy.activeMemberCreate) return "yes";
  if (policy.manageCapability && hasPermission(membership, policy.manageCapability)) return "yes";
  return "no";
}

function canMutate(policy: AreaPolicy, membership: MembershipAccess | null, archiveOrDelete = false): AccessDecision {
  if (policy.key === "tickets" && archiveOrDelete) return "no";
  if (!membership) return "no";
  if (policy.key === "tasks") return membership.role === "admin" ? "yes" : policy.activeMemberEdit ?? "own";
  if (policy.key === "finance" && !archiveOrDelete && hasPermission(membership, "submitExpenses")) return hasPermission(membership, "manageFinance") ? "yes" : "own";
  if (policy.manageCapability && hasPermission(membership, policy.manageCapability)) return "yes";
  return "no";
}

function canDelete(policy: AreaPolicy, membership: MembershipAccess | null): AccessDecision {
  if (policy.key === "tickets") return "no"; // Deletion belongs to the retention job.
  if (!membership || membership.role !== "admin") return "no";
  return canMutate(policy, membership, true);
}

function canExport(policy: AreaPolicy, membership: MembershipAccess | null): AccessDecision {
  if (!membership) return "no";
  if (policy.managerExport && isManagerLike(membership)) return "yes";
  if (policy.financeExport && hasPermission(membership, "viewFinance")) return hasPermission(membership, "manageFinance") || isManagerLike(membership) ? "yes" : "own";
  return "no";
}

function canApprove(policy: AreaPolicy, membership: MembershipAccess | null): AccessDecision {
  if (!membership || !policy.approvalEntity) return "no";
  return canReviewApproval(membership, policy.approvalEntity) ? "yes" : "no";
}

export function accessMatrixForRole(role: AccessRoleKey): AccessArea[] {
  if (["portal", "streamteam", "sponsor"].includes(role)) {
    return [{
      key: "portal",
      label: role === "streamteam" ? "Eigen Streamteam-profiel" : role === "sponsor" ? "Eigen sponsordossier" : "Eigen portaal",
      view: "limited",
      create: "no",
      edit: "no",
      archive: "no",
      delete: "no",
      export: "no",
      approve: "no",
      dataScope: "Alleen eigen sponsor- of streamerportaal. Geen toegang tot /app. De publieke websitekoppeling is nog afzonderlijk te realiseren.",
    }];
  }

  const membership = membershipFor(role);
  return accessPolicies.map((policy) => ({
    key: policy.key,
    label: policy.label,
    view: canView(policy, membership),
    create: policy.key === "finance" || canView(policy, membership) !== "no" ? canCreate(policy, membership) : "no",
    edit: canView(policy, membership) !== "no" ? canMutate(policy, membership) : "no",
    archive: canMutate(policy, membership, true),
    delete: canDelete(policy, membership),
    export: canExport(policy, membership),
    approve: canApprove(policy, membership),
    dataScope: policy.dataScope ?? "Organisatiedata binnen BESC.",
  }));
}

export function accessSummaryForRole(role: AccessRoleKey) {
  const rows = accessMatrixForRole(role);
  return {
    role,
    label: accessRoleLabels[role],
    canView: rows.filter((row) => row.view !== "no").length,
    canCreate: rows.filter((row) => row.create !== "no").length,
    canApprove: rows.filter((row) => row.approve !== "no").length,
    canExport: rows.filter((row) => row.export !== "no").length,
  };
}

export function accessMatrixForProfile(profile: MembershipAccess): AccessArea[] {
  const membership: MembershipAccess = {
    role: profile.role,
    finance_role: profile.finance_role,
    capabilities: profile.capabilities ?? [],
  };
  return accessPolicies.map((policy) => ({
    key: policy.key,
    label: policy.label,
    view: canView(policy, membership),
    create: policy.key === "finance" || canView(policy, membership) !== "no" ? canCreate(policy, membership) : "no",
    edit: canView(policy, membership) !== "no" ? canMutate(policy, membership) : "no",
    archive: canMutate(policy, membership, true),
    delete: canDelete(policy, membership),
    export: canExport(policy, membership),
    approve: canApprove(policy, membership),
    dataScope: policy.dataScope ?? "Organisatiedata binnen BESC.",
  }));
}

export function roleKeyFromMembership(role: OrganizationRole, financeRole: FinanceRole): AccessRoleKey {
  if (financeRole === "submitter") return "expense_submitter";
  if (financeRole === "approver") return "approver";
  if (financeRole === "treasurer") return "treasurer";
  return role;
}
