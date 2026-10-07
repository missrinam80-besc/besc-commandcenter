import { hasPermission } from "@/lib/permissions";
import { requireActiveMembership } from "@/lib/auth-context";

const cell = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

const categories = new Set([
  "event",
  "content",
  "equipment",
  "software",
  "marketing",
  "merchandise",
  "transport",
  "venue",
  "administration",
  "giveaway",
  "other",
]);

const statuses = new Set([
  "draft",
  "requested",
  "approved",
  "active",
  "closed",
  "planned",
  "paid",
  "reimbursement_due",
  "reimbursed",
  "expected",
  "invoiced",
  "received",
  "rejected",
  "cancelled",
  "archived",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedYear = url.searchParams.get("jaar") ?? "";
  const year = /^20\d{2}$/.test(requestedYear)
    ? requestedYear
    : String(new Date().getFullYear());
  const requestedType = url.searchParams.get("soort") ?? "all";
  const type = ["all", "budget", "expense", "income"].includes(requestedType)
    ? requestedType
    : "all";
  const requestedCategory = url.searchParams.get("categorie") ?? "all";
  const category = categories.has(requestedCategory)
    ? requestedCategory
    : "all";
  const requestedStatus = url.searchParams.get("status") ?? "all";
  const status = statuses.has(requestedStatus) ? requestedStatus : "all";
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const { supabase, membership } = await requireActiveMembership();

  const mayExport =
    hasPermission(membership, "manageFinance");

  if (!mayExport) {
    return new Response("Geen toegang", { status: 403 });
  }

  const [budgetsResult, expensesResult, incomeResult] = await Promise.all([
    supabase
      .from("budget_envelopes")
      .select("name,category,status,planned_amount,start_date,end_date,notes")
      .eq("organization_id", membership.organization_id)
      .is("deleted_at", null)
      .order("created_at"),
    supabase
      .from("expenses")
      .select(
        "expense_date,title,category,status,amount,supplier,invoice_number,proof_url",
      )
      .eq("organization_id", membership.organization_id)
      .is("deleted_at", null)
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date"),
    supabase
      .from("income_entries")
      .select(
        "expected_date,received_at,title,income_type,status,amount,payer,invoice_number,proof_url",
      )
      .eq("organization_id", membership.organization_id)
      .is("deleted_at", null)
      .or(`expected_date.gte.${from},received_at.gte.${from}`)
      .or(`expected_date.lte.${to},received_at.lte.${to}`),
  ]);

  const queryError =
    budgetsResult.error ?? expensesResult.error ?? incomeResult.error;

  if (queryError) {
    console.error("Financiële CSV-export mislukt", queryError);
    return new Response("De financiële export kon niet worden aangemaakt.", {
      status: 500,
    });
  }

  // Budgetten zonder periode horen bij het gekozen boekjaar. Budgetten met
  // datums worden meegenomen wanneer hun periode het boekjaar overlapt.
  const budgets = (budgetsResult.data ?? []).filter((budget) => {
    const overlapsYear =
      (!budget.start_date && !budget.end_date) ||
      ((!budget.start_date || budget.start_date <= to) &&
        (!budget.end_date || budget.end_date >= from));
    return (
      overlapsYear &&
      (type === "all" || type === "budget") &&
      (category === "all" || budget.category === category) &&
      (status === "all" || budget.status === status)
    );
  });
  const expenses = (expensesResult.data ?? []).filter(
    (expense) =>
      (type === "all" || type === "expense") &&
      (category === "all" || expense.category === category) &&
      (status === "all" || expense.status === status),
  );
  const income = (incomeResult.data ?? []).filter(
    (entry) =>
      (type === "all" || type === "income") &&
      category === "all" &&
      (status === "all" || entry.status === status),
  );

  const rows = [
    [
      "Soort",
      "Datum",
      "Titel",
      "Categorie",
      "Status",
      "Bedrag",
      "Relatie / toelichting",
      "Factuurnummer",
      "Bewijsstuk",
    ],
    ...budgets.map((budget) => [
      "Budget",
      budget.start_date || year,
      budget.name,
      budget.category,
      budget.status,
      budget.planned_amount,
      budget.notes,
      "",
      "",
    ]),
    ...expenses.map((expense) => [
      "Kost",
      expense.expense_date,
      expense.title,
      expense.category,
      expense.status,
      expense.amount,
      expense.supplier,
      expense.invoice_number,
      expense.proof_url,
    ]),
    ...income.map((income) => [
      "Inkomst",
      income.received_at || income.expected_date,
      income.title,
      income.income_type,
      income.status,
      income.amount,
      income.payer,
      income.invoice_number,
      income.proof_url,
    ]),
  ];

  return new Response(
    `\uFEFF${rows.map((row) => row.map(cell).join(";")).join("\r\n")}`,
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="besc-financien-${year}.csv"`,
        "X-Export-Row-Count": String(rows.length - 1),
      },
    },
  );
}
