import type { MembershipAccess } from "@/lib/permissions";

export const approvalEntityLabels = {
  content: "Content",
  expense: "Kost",
  partner: "Sponsorafspraak",
  document: "Document",
} as const;

export const approvalModuleLabels = {
  content: "Content",
  finance: "Financiën",
  sponsors: "Sponsors",
  documents: "Documenten",
} as const;

export const approvalStatusLabels = {
  pending: "Te beoordelen",
  approved: "Goedgekeurd",
  changes_requested: "Wijzigingen gevraagd",
  rejected: "Geweigerd",
} as const;

export type ApprovalEntityType = keyof typeof approvalEntityLabels;
export type ApprovalStatus = keyof typeof approvalStatusLabels;

export function canReviewApproval(
  membership: MembershipAccess,
  entityType: ApprovalEntityType,
) {
  if (membership.role === "admin" || membership.role === "board") return true;
  return entityType === "expense" &&
    (membership.finance_role === "approver" || membership.finance_role === "treasurer");
}

export function approvalCounts(
  rows: { status: string; requested_by: string }[],
  userId: string,
) {
  return {
    pending: rows.filter((row) => row.status === "pending").length,
    changesRequested: rows.filter((row) => row.status === "changes_requested").length,
    mine: rows.filter((row) => row.requested_by === userId && row.status !== "approved").length,
    completed: rows.filter((row) => ["approved", "rejected"].includes(row.status)).length,
  };
}
