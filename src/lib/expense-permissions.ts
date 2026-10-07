import type { MembershipAccess } from "./permissions";

// Match the existing database finance-manager policy.
export function canManageExpenses(membership: MembershipAccess) {
  return ["admin", "board"].includes(membership.role) ||
    ["approver", "treasurer"].includes(membership.finance_role);
}

export const expenseStatusOptions = [
  ["planned", "Gepland"], ["requested", "Aangevraagd"],
  ["approved", "Goedgekeurd"], ["paid", "Betaald"],
  ["reimbursement_due", "Terugbetaling nodig"], ["reimbursed", "Terugbetaald"],
  ["rejected", "Afgewezen"], ["cancelled", "Geannuleerd"], ["archived", "Gearchiveerd"],
] as const;

export function canSubmitExpense(values: {
  id?: string; status: string; paid_at?: string | null; payment_reference?: string | null;
}, canManage: boolean) {
  return canManage || (!values.id &&
    ["planned", "requested", "reimbursement_due"].includes(values.status) &&
    !values.paid_at && !values.payment_reference);
}

export function allowedExpenseStatuses(canManage: boolean) {
  return expenseStatusOptions.filter(([status]) => canSubmitExpense({ status }, canManage));
}
