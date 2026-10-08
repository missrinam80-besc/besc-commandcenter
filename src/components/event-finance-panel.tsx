import Link from "next/link";
import { requireActiveMembership } from "@/lib/auth-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format";
import { eventFinancialTotals, financialStatusLabels } from "@/lib/event-finance";
import { BudgetForm, ExpenseForm, IncomeForm } from "@/components/finance-forms";
import { FormModal } from "@/components/form-modal";

export async function EventFinancePanel({ eventId, eventTitle, projectId, selected }: { eventId: string; eventTitle: string; projectId?: string; selected?: string }) {
  const { supabase, membership } = await requireActiveMembership();
  const canView = hasPermission(membership, "viewFinance"), canManage = hasPermission(membership, "manageFinance");
  if (!canView) return <section className="form-card"><h2>Financiën</h2><p>Het financiële overzicht is beschikbaar voor financieel bevoegde accounts.</p><Link className="row-action" href={`/app/financien?nieuw=kost&event=${eventId}`}>Eigen kost indienen voor dit event</Link></section>;
  const org = membership.organization_id;
  const [b, e, i] = await Promise.all([
    supabase.from("budget_envelopes").select("id,name,planned_amount,status").eq("organization_id", org).eq("event_id", eventId).is("deleted_at", null).order("created_at"),
    supabase.from("expenses").select("id,title,amount,status").eq("organization_id", org).eq("event_id", eventId).is("deleted_at", null).order("created_at"),
    supabase.from("income_entries").select("id,title,amount,status").eq("organization_id", org).eq("event_id", eventId).is("deleted_at", null).order("created_at"),
  ]);
  if (b.error || e.error || i.error) return <section className="form-card"><h2>Financiën</h2><p className="error-note" role="alert">De financiële gegevens konden niet worden geladen. Er worden geen bedragen of lege lijsten afgeleid.</p></section>;
  const budgets = b.data ?? [], expenses = e.data ?? [], income = i.data ?? [], totals = eventFinancialTotals(budgets, expenses, income);
  const options = { budgets, projects: [], events: [{ id: eventId, title: eventTitle }], campaigns: [], partners: [], launches: [] };
  let optionsError = false;
  if (selected && ["budget", "kost", "inkomst"].includes(selected) && (canManage || selected === "kost")) {
    const results = await Promise.all([supabase.from("projects").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"), supabase.from("campaigns").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"), supabase.from("partners").select("id,name").eq("organization_id", org).is("deleted_at", null).order("name"), supabase.from("merch_launches").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title")]);
    optionsError = results.some(result => result.error);
    Object.assign(options, { projects: results[0].data ?? [], campaigns: results[1].data ?? [], partners: results[2].data ?? [], launches: results[3].data ?? [] });
  }
  return <section className="form-card event-finance-panel"><div className="form-heading"><h2>Eventfinanciën</h2><Link className="row-action" href="/app/financien">Alle financiën</Link></div>
    <div className="event-tab-actions">{canManage && <><Link href="?tab=financien&financieel=budget">Budget toevoegen</Link><Link href="?tab=financien&financieel=inkomst">Inkomst toevoegen</Link></>}<Link href="?tab=financien&financieel=kost">Kost toevoegen</Link></div>
    {!budgets.length && !expenses.length && !income.length ? <p className="empty-inline">Nog geen financiële registraties gekoppeld.</p> : <>
      <dl className="event-finance-totals">{[["Gepland budget", totals.planned], ["Vastgelegde kosten", totals.committed], ["Betaald / terugbetaald", totals.paid], ["Nog verwachte inkomsten", totals.expected], ["Ontvangen inkomsten", totals.received], ["Budgetruimte", totals.available], ["Actueel resultaat", totals.result]].map(([label, amount]) => <div key={String(label)}><dt>{label}</dt><dd>{amount === null ? "Geen budget gekoppeld" : formatCurrency(Number(amount))}</dd></div>)}</dl>
      <div className="financial-related-lists">{[{ label: "Budgetten", kind: "budgetten", rows: budgets.map(row => ({ ...row, title: row.name, amount: row.planned_amount })) }, { label: "Kosten", kind: "kosten", rows: expenses }, { label: "Inkomsten", kind: "inkomsten", rows: income }].map(group => <div key={group.kind}><h3>{group.label}</h3>{group.rows.map(row => <article key={row.id}><Link href={`/app/financien/${group.kind}/${row.id}`}>{row.title}</Link><span>{formatCurrency(Number(row.amount))} · {financialStatusLabels[row.status] || row.status}</span></article>)}{!group.rows.length && <p className="form-hint">Geen {group.label.toLowerCase()} gekoppeld.</p>}</div>)}</div>
    </>}
    {optionsError && <p className="error-note">De keuzelijsten konden niet worden geladen. Probeer opnieuw.</p>}
    {!optionsError && selected && ["budget", "kost", "inkomst"].includes(selected) && (canManage || selected === "kost") && <FormModal title={selected === "budget" ? "Eventbudget toevoegen" : selected === "inkomst" ? "Eventinkomst toevoegen" : "Eventkost toevoegen"} closeHref="?tab=financien">
      {selected === "budget" ? <BudgetForm record={{ event_id: eventId, project_id: projectId, category: "event" }} options={options} eventContext={eventId}/> : selected === "inkomst" ? <IncomeForm record={{ event_id: eventId, project_id: projectId }} options={options} eventContext={eventId}/> : <ExpenseForm record={{ event_id: eventId, project_id: projectId, category: "event" }} options={options} canManage={canManage} eventContext={eventId}/>}
    </FormModal>}
  </section>;
}
