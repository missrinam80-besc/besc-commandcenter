import Link from "next/link";
import { AlertTriangle, Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FinanceNavigation } from "@/components/finance-navigation";
import { requireActiveMembership } from "@/lib/auth-context";

export const dynamic = "force-dynamic";

const categoryLabels: Record<string, string> = {
  event: "Event",
  content: "Content",
  equipment: "Materiaal",
  software: "Software",
  marketing: "Marketing",
  merchandise: "Merchandise",
  transport: "Transport",
  venue: "Locatie",
  administration: "Administratie",
  giveaway: "Giveaway",
  other: "Overige",
};

const statusLabels: Record<string, string> = {
  draft: "Concept",
  requested: "Aangevraagd",
  approved: "Goedgekeurd",
  active: "Actief",
  closed: "Afgesloten",
  planned: "Gepland",
  paid: "Betaald",
  reimbursement_due: "Terugbetaling nodig",
  reimbursed: "Terugbetaald",
  expected: "Verwacht",
  invoiced: "Gefactureerd",
  received: "Ontvangen",
  rejected: "Afgewezen",
  cancelled: "Geannuleerd",
  archived: "Gearchiveerd",
};

const money = (value: number) =>
  new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
  }).format(value);

type RelationSummary = {
  key: string;
  type: string;
  name: string;
  expenses: number;
  income: number;
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = /^20\d{2}$/.test(query.jaar ?? "")
    ? query.jaar!
    : String(currentYear);
  const type = ["all", "budget", "expense", "income"].includes(
    query.soort ?? "",
  )
    ? query.soort!
    : "all";
  const category = Object.hasOwn(categoryLabels, query.categorie ?? "")
    ? query.categorie!
    : "all";
  const status = Object.hasOwn(statusLabels, query.status ?? "")
    ? query.status!
    : "all";
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const { supabase, membership } = await requireActiveMembership();
  const organizationId = membership.organization_id;

  const [expensesResult, incomeResult, budgetsResult, projects, events, campaigns, partners] =
    await Promise.all([
      supabase
        .from("expenses")
        .select(
          "id,title,category,status,amount,expense_date,budget_id,project_id,event_id,campaign_id,partner_id",
        )
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .gte("expense_date", from)
        .lte("expense_date", to),
      supabase
        .from("income_entries")
        .select(
          "id,title,income_type,status,amount,expected_date,received_at,budget_id,project_id,event_id,campaign_id,partner_id",
        )
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .or(
          `and(expected_date.gte.${from},expected_date.lte.${to}),and(received_at.gte.${from},received_at.lte.${to})`,
        ),
      supabase
        .from("budget_envelopes")
        .select("id,name,category,status,planned_amount,start_date,end_date")
        .eq("organization_id", organizationId)
        .is("deleted_at", null),
      supabase
        .from("projects")
        .select("id,title")
        .eq("organization_id", organizationId)
        .is("deleted_at", null),
      supabase
        .from("events")
        .select("id,title")
        .eq("organization_id", organizationId)
        .is("deleted_at", null),
      supabase
        .from("campaigns")
        .select("id,title")
        .eq("organization_id", organizationId)
        .is("deleted_at", null),
      supabase
        .from("partners")
        .select("id,name")
        .eq("organization_id", organizationId)
        .is("deleted_at", null),
    ]);

  const dataError =
    expensesResult.error ?? incomeResult.error ?? budgetsResult.error;

  const yearBudgets = (budgetsResult.data ?? []).filter((budget) => {
    if (!budget.start_date && !budget.end_date) return true;
    return (
      (!budget.start_date || budget.start_date <= to) &&
      (!budget.end_date || budget.end_date >= from)
    );
  });

  const budgets = yearBudgets.filter(
    (budget) =>
      (type === "all" || type === "budget") &&
      (category === "all" || budget.category === category) &&
      (status === "all" || budget.status === status),
  );
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

  const validExpense = (expense: (typeof expenses)[number]) =>
    !["rejected", "cancelled", "archived"].includes(expense.status);
  const paid = expenses
    .filter((expense) => ["paid", "reimbursed"].includes(expense.status))
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
  const committed = expenses
    .filter(validExpense)
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
  const received = income
    .filter((entry) => entry.status === "received")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const expectedIncome = income
    .filter((entry) => !["cancelled", "archived"].includes(entry.status))
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const planned = budgets
    .filter((budget) => !["rejected", "archived"].includes(budget.status))
    .reduce((sum, budget) => sum + Number(budget.planned_amount), 0);

  const categoryTotals = Object.entries(
    expenses.filter(validExpense).reduce<Record<string, number>>((totals, expense) => {
      totals[expense.category] =
        (totals[expense.category] ?? 0) + Number(expense.amount);
      return totals;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const budgetUsage = yearBudgets
    .filter((budget) => !["rejected", "archived"].includes(budget.status))
    .map((budget) => {
      const used = (expensesResult.data ?? [])
        .filter(
          (expense) => expense.budget_id === budget.id && validExpense(expense),
        )
        .reduce((sum, expense) => sum + Number(expense.amount), 0);
      const plannedAmount = Number(budget.planned_amount);
      return {
        ...budget,
        used,
        remaining: plannedAmount - used,
        percentage: plannedAmount ? (used / plannedAmount) * 100 : used ? 100 : 0,
      };
    })
    .sort((a, b) => b.percentage - a.percentage);
  const budgetWarnings = budgetUsage.filter(
    (budget) => budget.remaining < 0 || budget.percentage >= 80,
  );

  const relationMap = new Map<string, RelationSummary>();
  const relationSources = [
    [
      "Project",
      (projects.data ?? []).map((record) => ({ id: record.id, name: record.title })),
      "project_id",
    ],
    [
      "Event",
      (events.data ?? []).map((record) => ({ id: record.id, name: record.title })),
      "event_id",
    ],
    [
      "Campagne",
      (campaigns.data ?? []).map((record) => ({ id: record.id, name: record.title })),
      "campaign_id",
    ],
    [
      "Sponsor",
      (partners.data ?? []).map((record) => ({ id: record.id, name: record.name })),
      "partner_id",
    ],
  ] as const;

  for (const [relationType, records, idColumn] of relationSources) {
    for (const record of records) {
      const relatedExpenses = expenses
        .filter((expense) => expense[idColumn] === record.id && validExpense(expense))
        .reduce((sum, expense) => sum + Number(expense.amount), 0);
      const relatedIncome = income
        .filter(
          (entry) =>
            entry[idColumn] === record.id &&
            !["cancelled", "archived"].includes(entry.status),
        )
        .reduce((sum, entry) => sum + Number(entry.amount), 0);
      if (relatedExpenses || relatedIncome) {
        relationMap.set(`${relationType}-${record.id}`, {
          key: `${relationType}-${record.id}`,
          type: relationType,
          name: String(record.name),
          expenses: relatedExpenses,
          income: relatedIncome,
        });
      }
    }
  }
  const relationSummaries = Array.from(relationMap.values()).sort(
    (a, b) => b.expenses + b.income - (a.expenses + a.income),
  );

  const exportQuery = new URLSearchParams({ jaar: year });
  if (type !== "all") exportQuery.set("soort", type);
  if (category !== "all") exportQuery.set("categorie", category);
  if (status !== "all") exportQuery.set("status", status);

  return (
    <AppShell active="Financiën">
      <header className="topbar module-top">
        <div>
          <p>RAPPORTERING</p>
          <h1>Financieel jaaroverzicht {year}</h1>
        </div>
        <Link
          className="primary"
          href={`/app/financien/rapportage/export?${exportQuery.toString()}`}
        >
          <Download size={16} />
          CSV exporteren
        </Link>
      </header>
      <div className="module-body">
        <FinanceNavigation active="reporting" canManage />
        {dataError && (
          <div className="error-note">
            Niet alle financiële gegevens konden worden geladen. Probeer de pagina
            opnieuw.
          </div>
        )}
        <div className="view-toolbar finance-report-toolbar">
          <form className="history-filters">
            <label>
              Boekjaar
              <select name="jaar" defaultValue={year}>
                {Array.from({ length: 7 }, (_, offset) =>
                  String(currentYear - offset),
                ).map((optionYear) => (
                  <option key={optionYear}>{optionYear}</option>
                ))}
              </select>
            </label>
            <label>
              Soort
              <select name="soort" defaultValue={type}>
                <option value="all">Alles</option>
                <option value="budget">Budgetten</option>
                <option value="expense">Kosten</option>
                <option value="income">Inkomsten</option>
              </select>
            </label>
            <label>
              Categorie
              <select name="categorie" defaultValue={category}>
                <option value="all">Alle categorieën</option>
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue={status}>
                <option value="all">Alle statussen</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button>Toon</button>
            <Link className="row-action" href={`/app/financien/rapportage?jaar=${year}`}>
              Wis filters
            </Link>
          </form>
          <Link className="row-action" href="/app/financien">
            Terug naar financiën
          </Link>
        </div>

        <section className="finance-summary">
          <article>
            <span>Jaarbudget</span>
            <strong>{money(planned)}</strong>
          </article>
          <article>
            <span>Vastgelegde kosten</span>
            <strong>{money(committed)}</strong>
          </article>
          <article>
            <span>Ontvangen / verwacht</span>
            <strong>
              {money(received)} <small>van {money(expectedIncome)}</small>
            </strong>
          </article>
          <article>
            <span>Actueel resultaat</span>
            <strong className={received - paid < 0 ? "negative" : ""}>
              {money(received - paid)}
            </strong>
          </article>
        </section>

        {budgetWarnings.length > 0 && (
          <section className="finance-alert-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">AANDACHT NODIG</span>
                <h2>Budgetwaarschuwingen</h2>
              </div>
              <span>{budgetWarnings.length}</span>
            </div>
            <div className="finance-alert-list">
              {budgetWarnings.map((budget) => (
                <Link href={`/app/financien/budgetten/${budget.id}`} key={budget.id}>
                  <AlertTriangle size={18} />
                  <div>
                    <strong>{budget.name}</strong>
                    <span>
                      {budget.remaining < 0
                        ? `${money(Math.abs(budget.remaining))} overschreden`
                        : `${budget.percentage.toFixed(0)}% van het budget gebruikt`}
                    </span>
                  </div>
                  <b>{money(budget.used)}</b>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="finance-columns">
          <section className="project-task-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">REALISATIE</span>
                <h2>Budget tegenover kosten</h2>
              </div>
              <span>{budgetUsage.length} budgetten</span>
            </div>
            <div className="report-bars">
              {budgetUsage.map((budget) => (
                <article key={budget.id}>
                  <div>
                    <strong>{budget.name}</strong>
                    <span>
                      {money(budget.used)} van {money(Number(budget.planned_amount))}
                    </span>
                  </div>
                  <div className="budget-track">
                    <i
                      className={budget.remaining < 0 ? "over-budget" : ""}
                      style={{ width: `${Math.min(100, budget.percentage)}%` }}
                    />
                  </div>
                </article>
              ))}
              {!budgetUsage.length && (
                <p className="empty-inline">Geen budgetten in deze selectie.</p>
              )}
            </div>
          </section>

          <section className="project-task-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">VERDELING</span>
                <h2>Kosten per categorie</h2>
              </div>
              <span>{expenses.length} boekingen</span>
            </div>
            <div className="report-bars">
              {categoryTotals.map(([name, value]) => (
                <article key={name}>
                  <div>
                    <strong>{categoryLabels[name] ?? name}</strong>
                    <span>{money(value)}</span>
                  </div>
                  <div className="budget-track">
                    <i
                      style={{
                        width: `${committed ? Math.min(100, (value / committed) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </article>
              ))}
              {!categoryTotals.length && (
                <p className="empty-inline">Geen kosten in deze selectie.</p>
              )}
            </div>
          </section>
        </div>

        <section className="project-task-section finance-relation-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">TOEWIJZING</span>
              <h2>Resultaat per project, event, campagne en sponsor</h2>
            </div>
            <span>{relationSummaries.length} gekoppeld</span>
          </div>
          <div className="finance-report-table-wrap">
            <table className="finance-report-table">
              <thead>
                <tr>
                  <th>Soort</th>
                  <th>Naam</th>
                  <th>Inkomsten</th>
                  <th>Kosten</th>
                  <th>Resultaat</th>
                </tr>
              </thead>
              <tbody>
                {relationSummaries.map((relation) => (
                  <tr key={relation.key}>
                    <td>{relation.type}</td>
                    <td>{relation.name}</td>
                    <td>{money(relation.income)}</td>
                    <td>{money(relation.expenses)}</td>
                    <td className={relation.income - relation.expenses < 0 ? "negative" : ""}>
                      {money(relation.income - relation.expenses)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!relationSummaries.length && (
              <p className="empty">Nog geen financiële registraties gekoppeld.</p>
            )}
          </div>
        </section>

        <section className="project-task-section finance-actions-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">OPVOLGING</span>
              <h2>Openstaande acties</h2>
            </div>
          </div>
          <div className="finance-action-grid">
            <article>
              <strong>Te goedkeuren kosten</strong>
              <span>{(expensesResult.data ?? []).filter((item) => item.status === "requested").length}</span>
            </article>
            <article>
              <strong>Goedgekeurd, niet betaald</strong>
              <span>{(expensesResult.data ?? []).filter((item) => item.status === "approved").length}</span>
            </article>
            <article>
              <strong>Terugbetalingen nodig</strong>
              <span>{(expensesResult.data ?? []).filter((item) => item.status === "reimbursement_due").length}</span>
            </article>
            <article>
              <strong>Verwachte inkomsten</strong>
              <span>{(incomeResult.data ?? []).filter((item) => ["expected", "invoiced"].includes(item.status)).length}</span>
            </article>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
