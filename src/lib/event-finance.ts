export type EventBudget = { id: string; name: string; planned_amount: number | string; status: string };
export type EventMoney = { id: string; title: string; amount: number | string; status: string };
export const financialStatusLabels: Record<string, string> = {
  draft: "Concept", requested: "Aangevraagd", approved: "Goedgekeurd", active: "Actief", closed: "Afgesloten", rejected: "Afgewezen", archived: "Gearchiveerd",
  planned: "Gepland", paid: "Betaald", reimbursement_due: "Terugbetaling nodig", reimbursed: "Terugbetaald", cancelled: "Geannuleerd", expected: "Verwacht", invoiced: "Gefactureerd", received: "Ontvangen",
};
export function eventFinancialTotals(budgets: EventBudget[], expenses: EventMoney[], income: EventMoney[]) {
  const activeBudgets = budgets.filter(row => !["rejected", "archived"].includes(row.status));
  const planned = activeBudgets.reduce((sum, row) => sum + Number(row.planned_amount), 0);
  const committed = expenses.filter(row => !["rejected", "cancelled", "archived"].includes(row.status)).reduce((sum, row) => sum + Number(row.amount), 0);
  const paid = expenses.filter(row => ["paid", "reimbursed"].includes(row.status)).reduce((sum, row) => sum + Number(row.amount), 0);
  const expected = income.filter(row => ["expected", "invoiced"].includes(row.status)).reduce((sum, row) => sum + Number(row.amount), 0);
  const received = income.filter(row => row.status === "received").reduce((sum, row) => sum + Number(row.amount), 0);
  return { planned: activeBudgets.length ? planned : null, committed, paid, expected, received, available: activeBudgets.length ? planned - committed : null, result: received - paid };
}
