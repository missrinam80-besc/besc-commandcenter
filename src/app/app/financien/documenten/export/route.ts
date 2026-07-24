import { requireActiveMembership } from "@/lib/auth-context";

const cell = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedYear = url.searchParams.get("jaar") ?? "";
  const year = /^20\d{2}$/.test(requestedYear)
    ? requestedYear
    : String(new Date().getFullYear());
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const { supabase, membership } = await requireActiveMembership();
  const mayExport =
    ["admin", "board"].includes(membership.role) ||
    ["approver", "treasurer"].includes(membership.finance_role);
  if (!mayExport) return new Response("Geen toegang", { status: 403 });

  const organizationId = membership.organization_id;
  const [expensesResult, incomeResult, documentsResult] = await Promise.all([
    supabase
      .from("expenses")
      .select("id,expense_date,paid_at,title,category,status,amount,supplier,invoice_number,proof_url,claimant_name,payment_reference,declaration_url")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date"),
    supabase
      .from("income_entries")
      .select("id,expected_date,received_at,title,income_type,status,amount,payer,invoice_number,proof_url")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or(`and(expected_date.gte.${from},expected_date.lte.${to}),and(received_at.gte.${from},received_at.lte.${to})`)
      .order("expected_date"),
    supabase
      .from("financial_documents")
      .select("id,document_date,title,document_type,status,amount,counterparty,document_number,drive_url,expense_id,income_id,budget_id")
      .eq("organization_id", organizationId)
      .eq("fiscal_year", Number(year))
      .is("deleted_at", null)
      .order("document_date"),
  ]);

  const error =
    expensesResult.error ?? incomeResult.error ?? documentsResult.error;
  if (error) {
    console.error("Boekhoudersexport mislukt", error);
    return new Response("De boekhoudersexport kon niet worden aangemaakt.", {
      status: 500,
    });
  }

  const rows = [
    [
      "Recordtype",
      "Datum",
      "Betaald/ontvangen",
      "Titel",
      "Categorie/type",
      "Status",
      "Bedrag",
      "Tegenpartij/indiener",
      "Documentnummer",
      "Bewijsstuk",
      "Declaratie",
      "Betalingsreferentie",
      "Gekoppeld record",
    ],
    ...(expensesResult.data ?? []).map((record) => [
      "Kost",
      record.expense_date,
      record.paid_at,
      record.title,
      record.category,
      record.status,
      record.amount,
      record.claimant_name || record.supplier,
      record.invoice_number,
      record.proof_url,
      record.declaration_url,
      record.payment_reference,
      record.id,
    ]),
    ...(incomeResult.data ?? []).map((record) => [
      "Inkomst",
      record.expected_date,
      record.received_at,
      record.title,
      record.income_type,
      record.status,
      record.amount,
      record.payer,
      record.invoice_number,
      record.proof_url,
      "",
      "",
      record.id,
    ]),
    ...(documentsResult.data ?? []).map((record) => [
      "Document",
      record.document_date,
      "",
      record.title,
      record.document_type,
      record.status,
      record.amount,
      record.counterparty,
      record.document_number,
      record.drive_url,
      "",
      "",
      record.expense_id || record.income_id || record.budget_id || record.id,
    ]),
  ];

  return new Response(
    `\uFEFF${rows.map((row) => row.map(cell).join(";")).join("\r\n")}`,
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="besc-boekhouder-${year}.csv"`,
        "X-Export-Row-Count": String(rows.length - 1),
      },
    },
  );
}
