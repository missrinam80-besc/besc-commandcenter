import Link from "next/link";
import { formatCurrency } from "@/lib/format";

type Budget = { id: string; name: string; planned_amount: number | string; status: string };
type Expense = { id: string; title: string; amount: number | string; status: string };
type Income = { id: string; title: string; amount: number | string; status: string };

const sum = (rows: { amount?: number | string; planned_amount?: number | string }[], field: "amount" | "planned_amount") => rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);

export function FinancialSummaryPanel({ budgets, expenses, income }: { budgets: Budget[]; expenses: Expense[]; income: Income[] }) {
  const planned = sum(budgets, "planned_amount");
  const activeExpenses = expenses.filter((item) => !["rejected", "cancelled", "archived"].includes(item.status));
  const receivedIncome = income.filter((item) => item.status === "received");
  const spent = sum(activeExpenses, "amount");
  const received = sum(receivedIncome, "amount");
  return <section className="form-card financial-summary-panel">
    <div className="form-heading"><div><span className="eyebrow">FINANCIËLE REALISATIE</span><h2>Budget, kosten en inkomsten</h2></div><Link className="row-action" href="/app/financien">Open financiën</Link></div>
    {!budgets.length && !expenses.length && !income.length && <p>Geen financiële gegevens gekoppeld.</p>}
    <div className="financial-summary-totals"><article><span>Gepland budget</span><strong>{budgets.length ? formatCurrency(planned) : "Geen budget gekoppeld"}</strong></article><article><span>Kosten</span><strong>{activeExpenses.length ? formatCurrency(spent) : expenses.length ? "Geen actieve kosten" : "Geen kosten gekoppeld"}</strong></article><article><span>Ontvangen inkomsten</span><strong>{receivedIncome.length ? formatCurrency(received) : income.length ? "Nog geen ontvangen inkomsten" : "Geen inkomsten gekoppeld"}</strong></article><article><span>Budgetruimte</span><strong>{budgets.length && activeExpenses.length ? formatCurrency(planned - spent) : "Niet te bepalen"}</strong></article></div>
    <div className="financial-related-lists">
      <div><h3>Budgetten</h3>{budgets.map((item) => <Link key={item.id} href={`/app/financien/budgetten/${item.id}`}><span>{item.name}</span><strong>{formatCurrency(item.planned_amount)}</strong></Link>)}{!budgets.length ? <p>Geen budget gekoppeld.</p> : null}</div>
      <div><h3>Kosten</h3>{expenses.map((item) => <Link key={item.id} href={`/app/financien/kosten/${item.id}`}><span>{item.title}</span><strong>{formatCurrency(item.amount)}</strong></Link>)}{!expenses.length ? <p>Geen kosten gekoppeld.</p> : null}</div>
      <div><h3>Inkomsten</h3>{income.map((item) => <Link key={item.id} href={`/app/financien/inkomsten/${item.id}`}><span>{item.title}</span><strong>{formatCurrency(item.amount)}</strong></Link>)}{!income.length ? <p>Geen inkomsten gekoppeld.</p> : null}</div>
    </div>
  </section>;
}
