import Link from "next/link";
import { CheckCircle2, Download, ExternalLink, FileWarning } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { saveFinancialDocument, verifyFinancialDocument } from "./actions";

const documentTypes: Record<string, string> = {
  invoice: "Factuur",
  receipt: "Kasticket / ontvangstbewijs",
  credit_note: "Creditnota",
  bank_statement: "Bankuittreksel",
  contract: "Contract",
  subsidy: "Subsidiedocument",
  declaration: "Declaratie",
  other: "Overige",
};

const statusLabels: Record<string, string> = {
  missing: "Ontbreekt",
  linked: "Gekoppeld",
  verified: "Gecontroleerd",
  archived: "Gearchiveerd",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = /^20\d{2}$/.test(query.jaar ?? "")
    ? Number(query.jaar)
    : currentYear;
  const status = Object.hasOwn(statusLabels, query.status ?? "")
    ? query.status!
    : "all";
  const type = Object.hasOwn(documentTypes, query.soort ?? "")
    ? query.soort!
    : "all";
  const { supabase, membership } = await requireActiveMembership();
  const mayManage =
    ["admin", "board"].includes(membership.role) ||
    ["approver", "treasurer"].includes(membership.finance_role);

  if (!mayManage) {
    return (
      <AppShell active="Boekhoudstukken">
        <header className="topbar module-top"><div><p>FINANCIËN</p><h1>Boekhoudstukken</h1></div></header>
        <div className="module-body"><div className="permission-note">Alleen bestuur, goedkeurders en de penningmeester hebben toegang tot boekhoudstukken.</div></div>
      </AppShell>
    );
  }

  const organizationId = membership.organization_id;
  const [documentsResult, expensesResult, incomeResult, budgetsResult] = await Promise.all([
    supabase
      .from("financial_documents")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("fiscal_year", year)
      .is("deleted_at", null)
      .order("document_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("expenses")
      .select("id,title,amount,expense_date,proof_url")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("expense_date", { ascending: false }),
    supabase
      .from("income_entries")
      .select("id,title,amount,expected_date,received_at,proof_url")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("expected_date", { ascending: false }),
    supabase
      .from("budget_envelopes")
      .select("id,name")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("name"),
  ]);

  const allDocuments = documentsResult.data ?? [];
  const documents = allDocuments.filter(
    (document) =>
      (status === "all" || document.status === status) &&
      (type === "all" || document.document_type === type),
  );
  const missingProofs = [
    ...(expensesResult.data ?? [])
      .filter((record) => !record.proof_url)
      .map((record) => ({ ...record, kind: "Kost", date: record.expense_date })),
    ...(incomeResult.data ?? [])
      .filter((record) => !record.proof_url)
      .map((record) => ({ ...record, kind: "Inkomst", date: record.received_at || record.expected_date })),
  ].filter((record) => !record.date || String(record.date).startsWith(String(year)));

  return (
    <AppShell active="Boekhoudstukken">
      <header className="topbar module-top">
        <div><p>DOCUMENTBEHEER</p><h1>Boekhoudstukken {year}</h1></div>
        <div className="project-actions">
          <Link href={`/app/financien/documenten/export?jaar=${year}`}><Download size={16}/>Boekhoudersexport</Link>
          <Link className="primary" href={`?jaar=${year}&nieuw=1`}>Nieuw document</Link>
        </div>
      </header>
      <div className="module-body">
        <p className="lead">Beheer facturen, bewijsstukken, declaraties en andere financiële documenten. De bestanden zelf blijven in Google Drive.</p>
        {query.fout && <div className="error-note">De actie is mislukt ({query.fout}).</div>}
        {query.succes && <div className="success">Het documentenregister is bijgewerkt.</div>}

        <div className="view-toolbar finance-report-toolbar">
          <form className="history-filters">
            <label>Boekjaar<select name="jaar" defaultValue={String(year)}>{Array.from({ length: 7 }, (_, offset) => currentYear - offset).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Soort<select name="soort" defaultValue={type}><option value="all">Alle soorten</option>{Object.entries(documentTypes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Status<select name="status" defaultValue={status}><option value="all">Alle statussen</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <button>Toon</button>
          </form>
          <Link className="row-action" href="/app/financien">Terug naar financiën</Link>
        </div>

        <section className="finance-summary">
          <article><span>Geregistreerd</span><strong>{allDocuments.length}</strong></article>
          <article><span>Gecontroleerd</span><strong>{allDocuments.filter((item) => item.status === "verified").length}</strong></article>
          <article><span>Expliciet ontbrekend</span><strong>{allDocuments.filter((item) => item.status === "missing").length}</strong></article>
          <article><span>Boekingen zonder link</span><strong>{missingProofs.length}</strong></article>
        </section>

        {query.nieuw && (
          <section className="form-card">
            <div className="form-heading"><h2>Document registreren</h2><Link href={`?jaar=${year}`}>Sluiten</Link></div>
            <form action={saveFinancialDocument}>
              <label>Titel<input name="title" required /></label>
              <div className="form-row">
                <label>Soort<select name="document_type">{Object.entries(documentTypes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label>Status<select name="status" defaultValue="linked"><option value="missing">Ontbreekt nog</option><option value="linked">Gekoppeld</option><option value="verified">Gecontroleerd</option><option value="archived">Gearchiveerd</option></select></label>
                <label>Documentdatum<input type="date" name="document_date" /></label>
                <label>Boekjaar<input type="number" name="fiscal_year" min="2000" max="2200" defaultValue={year} required /></label>
                <label>Documentnummer<input name="document_number" /></label>
                <label>Tegenpartij<input name="counterparty" /></label>
                <label>Bedrag<input type="number" min="0" step="0.01" name="amount" /></label>
                <label>Google Drive-link<input type="url" name="drive_url" placeholder="Niet verplicht bij status Ontbreekt" /></label>
                <label>Koppelen aan kost<select name="expense_id"><option value="">Geen kost</option>{(expensesResult.data ?? []).map((record) => <option value={record.id} key={record.id}>{record.title}</option>)}</select></label>
                <label>Koppelen aan inkomst<select name="income_id"><option value="">Geen inkomst</option>{(incomeResult.data ?? []).map((record) => <option value={record.id} key={record.id}>{record.title}</option>)}</select></label>
                <label>Koppelen aan budget<select name="budget_id"><option value="">Geen budget</option>{(budgetsResult.data ?? []).map((record) => <option value={record.id} key={record.id}>{record.name}</option>)}</select></label>
              </div>
              <label>Notities<textarea name="notes" rows={4} /></label>
              <div className="form-actions"><button className="primary">Registreren</button></div>
            </form>
          </section>
        )}

        {missingProofs.length > 0 && (
          <section className="finance-alert-section">
            <div className="section-heading"><div><span className="eyebrow">DOCUMENTCONTROLE</span><h2>Boekingen zonder bewijsstuklink</h2></div><span>{missingProofs.length}</span></div>
            <div className="finance-alert-list">
              {missingProofs.map((record) => <Link href={record.kind === "Kost" ? `/app/financien/kosten/${record.id}?bewerken=1` : `/app/financien/inkomsten/${record.id}?bewerken=1`} key={`${record.kind}-${record.id}`}><FileWarning size={18}/><div><strong>{record.title}</strong><span>{record.kind} · € {Number(record.amount).toFixed(2)}</span></div><b>Toevoegen</b></Link>)}
            </div>
          </section>
        )}

        <section className="project-task-section finance-relation-section">
          <div className="section-heading"><div><span className="eyebrow">REGISTER</span><h2>Financiële documenten</h2></div><span>{documents.length}</span></div>
          <div className="finance-document-list">
            {documents.map((document) => <article key={document.id}><div className="finance-document-icon">{document.status === "verified" ? <CheckCircle2 size={17}/> : <FileWarning size={17}/>}</div><div><strong>{document.title}</strong><span>{documentTypes[document.document_type]} · {document.document_date || "Geen datum"} · {document.counterparty || "Geen tegenpartij"}</span></div><span className={`badge ${document.status === "verified" ? "verified" : ""}`}>{statusLabels[document.status]}</span><b>{document.amount == null ? "—" : `€ ${Number(document.amount).toFixed(2)}`}</b>{document.drive_url ? <a className="row-action" href={document.drive_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/>Open</a> : <span className="missing-link">Geen link</span>}{document.status === "linked" && <form action={verifyFinancialDocument}><input type="hidden" name="id" value={document.id}/><input type="hidden" name="year" value={year}/><button>Controleer</button></form>}</article>)}
            {!documents.length && <p className="empty">Geen documenten in deze selectie.</p>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
