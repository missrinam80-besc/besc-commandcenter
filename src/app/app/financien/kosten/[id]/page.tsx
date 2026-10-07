import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { updateExpenseWorkflow } from "@/app/app/financien/actions";
import { AppShell } from "@/components/app-shell";
import { ApprovalPanel } from "@/components/approval-panel";
import { ExpenseForm } from "@/components/finance-forms";
import { hasPermission } from "@/lib/permissions";
import { requireActiveMembership } from "@/lib/auth-context";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, membership, user } = await requireActiveMembership();
  const organizationId = membership.organization_id;
  const canViewOverview = hasPermission(membership, "viewFinance");
  const expenseQuery = supabase.from("expenses").select("*,budget_envelopes(name),projects(title),events(title),campaigns(title),partners(name),merch_launches(title)").eq("organization_id", organizationId).eq("id", id).is("deleted_at", null);
  if (!canViewOverview) expenseQuery.eq("submitted_by", user.id);
  const [expenseResult, budgets, projects, events, campaigns, partners, launches, audit] = await Promise.all([
    expenseQuery.maybeSingle(),
    supabase.from("budget_envelopes").select("id,name").eq("organization_id", organizationId).is("deleted_at", null).order("name"),
    supabase.from("projects").select("id,title").eq("organization_id", organizationId).is("deleted_at", null).order("title"),
    supabase.from("events").select("id,title").eq("organization_id", organizationId).is("deleted_at", null).order("title"),
    supabase.from("campaigns").select("id,title").eq("organization_id", organizationId).is("deleted_at", null).order("title"),
    supabase.from("partners").select("id,name").eq("organization_id", organizationId).is("deleted_at", null).order("name"),
    supabase.from("merch_launches").select("id,title").eq("organization_id", organizationId).is("deleted_at", null).order("title"),
    supabase.from("financial_audit_log").select("id,action,previous_status,new_status,created_at,profiles(display_name)").eq("organization_id", organizationId).eq("entity_type", "expense").eq("entity_id", id).order("created_at", { ascending: false }),
  ]);
  if (!expenseResult.data) notFound();
  const expense = expenseResult.data;
  const options = {
    budgets: budgets.data ?? [],
    projects: projects.data ?? [],
    events: events.data ?? [],
    campaigns: campaigns.data ?? [],
    partners: partners.data ?? [],
    launches: launches.data ?? [],
  };
  const canManage = hasPermission(membership, "manageFinance");
  const transition = (value: string, label: string) => (
    <form action={updateExpenseWorkflow}>
      <input type="hidden" name="id" value={id}/>
      <input type="hidden" name="transition" value={value}/>
      <input type="hidden" name="return_to" value={`/app/financien/kosten/${id}`}/>
      <button>{label}</button>
    </form>
  );

  return (
    <AppShell active="Financiën">
      <header className="project-detail-head">
        <div>
          <Link href={canViewOverview ? "/app/financien" : "/app/financien?nieuw=kost"}>{canViewOverview ? "← Terug naar financiën" : "← Nieuwe kost indienen"}</Link>
          <span className="eyebrow">KOSTENREGISTRATIE</span>
          <h1>{expense.title}</h1>
          <p>{expense.category} · {expense.status}</p>
        </div>
        <div className="project-actions">
          {expense.proof_url && <a href={expense.proof_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Open bewijsstuk</a>}
          {canManage && expense.status === "approved" && transition("pay", "Markeer betaald")}
          {canManage && expense.status === "reimbursement_due" && transition("reimburse", "Markeer terugbetaald")}
          {canManage && !query.bewerken && <Link className="primary" href="?bewerken=1">Bewerken</Link>}
        </div>
      </header>
      <div className="project-detail-body">
        {query.succes && <div className="success">De financiële workflow is bijgewerkt.</div>}
        {query.fout && <div className="error-note">Actie mislukt: {query.fout}.</div>}
        {canManage && query.bewerken ? (
          <section className="form-card">
            <div className="form-heading"><h2>Kost bewerken</h2><Link href="?">Annuleren</Link></div>
            <ExpenseForm record={expense} options={options} canManage={canManage}/>
          </section>
        ) : (
          <>
            <section className="project-summary">
              <article><span>Bedrag</span><strong>€ {Number(expense.amount).toFixed(2)}</strong></article>
              <article><span>Status</span><strong>{expense.status}</strong></article>
              <article><span>Datum</span><strong>{expense.expense_date || "—"}</strong></article>
              <article><span>Budget</span><strong>{expense.budget_envelopes?.name || "—"}</strong></article>
            </section>
            {["paid", "reimbursed"].includes(expense.status) && !expense.proof_url && (
              <div className="attention-bar"><div><strong>Bewijsstuk ontbreekt</strong><span>Een betaalde kost hoort een factuur of betaalbewijs in Google Drive te hebben.</span></div></div>
            )}
            <section className="form-card record-notes">
              <div className="form-heading"><h2>Administratieve gegevens</h2></div>
              <dl className="social-fields">
                <div><dt>Leverancier</dt><dd>{expense.supplier || "—"}</dd></div>
                <div><dt>Factuurnummer</dt><dd>{expense.invoice_number || "—"}</dd></div>
                <div><dt>Betaaldatum</dt><dd>{expense.paid_at || "—"}</dd></div>
                <div><dt>Goedgekeurd</dt><dd>{expense.approved_at ? String(expense.approved_at).slice(0, 16).replace("T", " ") : "—"}</dd></div>
                <div><dt>Gerelateerd aan</dt><dd>{[expense.projects?.title, expense.events?.title, expense.campaigns?.title, expense.partners?.name, expense.merch_launches?.title].filter(Boolean).join(" · ") || "—"}</dd></div>
                <div><dt>Notities</dt><dd>{expense.notes || "—"}</dd></div>
              </dl>
            </section>
            <ApprovalPanel entityType="expense" entityId={id} sourceHref={`/app/financien/kosten/${id}`} title="Kost goedkeuren"/>
            {canManage && (
              <section className="activity-card">
                <div className="form-heading"><h2>Financiële auditlog</h2><span>{audit.data?.length ?? 0} wijzigingen</span></div>
                <div className="activity-list">
                  {(audit.data ?? []).map((row) => (
                    <article key={row.id}>
                      <span className="activity-dot"/>
                      <div>
                        <strong>{row.action}</strong>
                        {row.previous_status !== row.new_status && <span> {row.previous_status || "—"} → {row.new_status}</span>}
                        <time>{new Date(row.created_at).toLocaleString("nl-BE")}</time>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
