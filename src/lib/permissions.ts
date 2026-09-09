export const organizationRoles = ["admin", "board", "member", "volunteer"] as const;
export const financeRoles = ["none", "submitter", "approver", "treasurer"] as const;

export type OrganizationRole = (typeof organizationRoles)[number];
export type FinanceRole = (typeof financeRoles)[number];

export type MembershipAccess = {
  role: string;
  finance_role: string;
  capabilities?: string[] | null;
};

export const capabilities = [
  "manageUsers",
  "manageOrganization",
  "manageInbox",
  "manageProjects",
  "manageContent",
  "manageEvents",
  "manageFinance",
  "submitExpenses",
  "viewFinance",
  "manageIntegrations",
  "manageKpis",
  "manageAiTemplates",
  "useAi",
] as const;

export type Capability = (typeof capabilities)[number];

export const organizationRoleLabels: Record<OrganizationRole, string> = {
  admin: "Beheerder",
  board: "Bestuur",
  member: "Teamlid",
  volunteer: "Vrijwilliger",
};

export const financeRoleLabels: Record<FinanceRole, string> = {
  none: "Geen financiële rol",
  submitter: "Kostenindiener",
  approver: "Goedkeurder",
  treasurer: "Penningmeester",
};

export function isAdmin(membership: MembershipAccess) {
  return membership.role === "admin";
}

export function isManager(membership: MembershipAccess) {
  return membership.role === "admin" || membership.role === "board";
}

export function isTeamMember(membership: MembershipAccess) {
  return membership.role === "admin" || membership.role === "board" || membership.role === "member";
}

export function hasPermission(membership: MembershipAccess, capability: Capability) {
  if (membership.capabilities?.includes(capability)) return true;
  switch (capability) {
    case "manageUsers":
      return isAdmin(membership);
    case "manageOrganization":
    case "manageInbox":
    case "manageIntegrations":
    case "manageKpis":
    case "manageAiTemplates":
      return isManager(membership);
    case "manageProjects":
    case "manageContent":
    case "manageEvents":
      return isTeamMember(membership);
    case "manageFinance":
      return isManager(membership) || membership.finance_role === "approver" || membership.finance_role === "treasurer";
    case "viewFinance":
      return isManager(membership) || membership.finance_role !== "none";
    case "submitExpenses":
    case "useAi":
      return true;
  }
}
