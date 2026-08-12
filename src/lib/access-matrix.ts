import { hasPermission, type Capability, type FinanceRole, type MembershipAccess, type OrganizationRole } from "./permissions";
import { canReviewApproval, type ApprovalEntityType } from "./approvals";

export type AccessRoleKey =
  | "admin"
  | "board"
  | "volunteer"
  | "member"
  | "portal"
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
  member: "Member",
  portal: "Portaalgebruiker",
  expense_submitter: "Expense submitter",
  approver: "Finance approver",
  treasurer: "Treasurer",
};

const roleMemberships: Partial<Record<AccessRoleKey, MembershipAccess>> = {
  admin: { role: "admin", finance_role: "none" },
  board: { role: "board", finance_role: "none" },
  volunteer: { role: "volunteer", finance_role: "none" },
  member: { role: "member", finance_role: "none" },
  expense_submitter: { role: "member", finance_role: "submitter" },
  approver: { role: "member", finance_role: "approver" },
  treasurer: { role: "member", finance_role: "treasurer" },
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
  { key: "shop", label: "Shop & merchandise", manageCapability: "manageOrganization", activeMemberView: true, dataScope: "Producten, lanceringen, activa en merchandiseplanning." },
  { key: "newsletters", label: "Nieuwsbrieven", manageCapability: "manageOrganization", managerExport: true, approvalEntity: "newsletter", dataScope: "Mailinglijsten, abonnees en nieuwsbrieven; beperkt tot bestuur/beheer." },
  { key: "ai", label: "AI Hub", manageCapability: "manageAiTemplates", activeMemberView: true, activeMemberCreate: true, dataScope: "Promptbibliotheek en AI-output binnen BESC." },
  { key: "meetings", label: "Vergaderingen & besluiten", manageCapability: "manageOrganization", activeMemberView: true, approvalEntity: "document", dataScope: "Vergaderingen, besluiten, actiepunten en notulenlinks." },
  { key: "administration", label: "VZW-administratie", manageCapability: "manageOrganization", dataScope: "Formele VZW-administratie; beperkt tot bestuur/beheer." },
  { key: "finance", label: "Financiën", manageCapability: "manageFinance", viewCapability: "viewFinance", activeMemberCreate: true, financeExport: true, approvalEntity: "expense", dataScope: "Kosten, budgetten en inkomsten volgens finance-rol." },
  { key: "knowledge", label: "Kennisbank", manageCapability: "manageOrganization", activeMemberView: true, dataScope: "Interne handleidingen en procedures." },
  { key: "reports", label: "Rapportage & KPI", manageCapability: "manageKpis", activeMemberView: true, managerExport: true, dataScope: "KPI’s en rapporten; managementrapporten beperkt tot bestuur/beheer." },
  { key: "documents", label: "Documenten & Drive", manageCapability: "manageOrganization", activeMemberView: true, approvalEntity: "document", dataScope: "Alleen links en metadata; rechten blijven in Google Workspace." },
  { key: "integrations", label: "Integraties", manageCapability: "manageIntegrations", dataScope: "Technische koppelingen en syncstatussen; beperkt tot bestuur/beheer." },
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
  if (policy.viewCapability) return hasPermission(membership, policy.viewCapability) ? "yes" : "no";
  if (policy.activeMemberView) return "yes";
  if (policy.manageCapability) return hasPermission(membership, policy.manageCapability) ? "yes" : "no";
  return "no";
}

function canCreate(policy: AreaPolicy, membership: MembershipAccess | null): AccessDecision {
  if (!membership) return "no";
  if (policy.key === "finance" && hasPermission(membership, "submitExpenses")) return policy.manageCapability && hasPermission(membership, policy.manageCapability) ? "yes" : "own";
  if (policy.activeMemberCreate) return "yes";
  if (policy.manageCapability && hasPermission(membership, policy.manageCapability)) return "yes";
  return "no";
}

function canMutate(policy: AreaPolicy, membership: MembershipAccess | null, archiveOrDelete = false): AccessDecision {
  if (!membership) return "no";
  if (policy.key === "tasks") return policy.activeMemberEdit ?? "own";
  if (policy.key === "finance" && !archiveOrDelete && hasPermission(membership, "submitExpenses")) return hasPermission(membership, "manageFinance") ? "yes" : "own";
  if (policy.manageCapability && hasPermission(membership, policy.manageCapability)) return "yes";
  return "no";
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
  if (role === "portal") {
    return [{
      key: "portal",
      label: "Extern portaal",
      view: "limited",
      create: "no",
      edit: "no",
      archive: "no",
      delete: "no",
      export: "no",
      approve: "no",
      dataScope: "Alleen eigen sponsor- of streamerportaal. Geen toegang tot /app.",
    }];
  }

  const membership = membershipFor(role);
  return accessPolicies.map((policy) => ({
    key: policy.key,
    label: policy.label,
    view: canView(policy, membership),
    create: canCreate(policy, membership),
    edit: canMutate(policy, membership),
    archive: canMutate(policy, membership, true),
    delete: canMutate(policy, membership, true),
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

export function roleKeyFromMembership(role: OrganizationRole, financeRole: FinanceRole): AccessRoleKey {
  if (financeRole === "submitter") return "expense_submitter";
  if (financeRole === "approver") return "approver";
  if (financeRole === "treasurer") return "treasurer";
  return role;
}
