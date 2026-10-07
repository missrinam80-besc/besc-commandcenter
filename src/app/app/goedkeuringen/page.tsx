import Link from "next/link";
import { CheckCircle2, Clock3, Filter, RotateCcw, UserRound, XCircle } from "lucide-react";
import { decideApproval } from "./actions";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";
import { currentApprovalRequests } from "@/lib/approval-work-queue";
import {
  approvalCounts,
  approvalEntityLabels,
  approvalModuleLabels,
  approvalStatusLabels,
  canReviewApproval,
  type ApprovalEntityType,
  type ApprovalStatus,
} from "@/lib/approvals";

type ApprovalRow = {
  id: string;
  entity_type: ApprovalEntityType;
  entity_id: string;
  title: string;
  module: keyof typeof approvalModuleLabels;
  source_href: string;
  status: ApprovalStatus;
  requested_by: string;
  request_note: string | null;
  decision_note: string | null;
  requested_at: string;
  decided_at: string | null;
  requester: { display_name: string | null } | null;
  reviewer: { display_name: string | null } | null;
};

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const { supabase, user, membership } = await requireActiveMembership();
  const isManager = ["admin", "board"].includes(membership.role) || ["approver", "treasurer", "approver_treasurer"].includes(membership.finance_role);
  const status = query.status && query.status in approvalStatusLabels ? query.status : isManager ? "pending" : "all";
  const moduleFilter = query.module && query.module in approvalModuleLabels ? query.module : "all";
  const scope = query.scope === "mine" ? "mine" : query.scope === "all" ? "all" : isManager ? "all" : "mine";

  const { data } = await supabase
    .from("approval_requests")
    .select("id,entity_type,entity_id,title,module,source_href,status,requested_by,request_note,decision_note,requested_at,decided_at,requester:profiles!approval_requests_requested_by_fkey(display_name),reviewer:profiles!approval_requests_decided_by_fkey(display_name)")
    .eq("organization_id", membership.organization_id)
    .order("requested_at", { ascending: false });
  const allRows = await currentApprovalRequests(supabase, membership.organization_id, (data ?? []) as unknown as ApprovalRow[]);
  const counts = approvalCounts(allRows, user.id);
  const rows = allRows
    .filter((row) => status === "all" || row.status === status)
    .filter((row) => moduleFilter === "all" || row.module === moduleFilter)
    .filter((row) => scope === "all" || row.requested_by === user.id);

  return (
    <AppShell active="Goedkeuringen">
      <header className="topbar module-top">
        <div><p>WERKVOORRAAD</p><h1>Goedkeuringen</h1></div>
      </header>
      <div className="module-body">
        <p className="lead">Eén werkvoorraad voor content, kosten, sponsorafspraken, documenten, e-mails en nieuwsbrieven die een formele beslissing nodig hebben.</p>
        {query.succes && <div className="success">De beslissing is geregistreerd en de bronstatus is bijgewerkt.</div>}
        {query.fout && <div className="error-note">De goedkeuringsactie is mislukt ({query.fout}).</div>}
        <section className="approval-stats">
          <article><Clock3/><div><span>Te beoordelen</span><strong>{counts.pending}</strong></div></article>
          <article><RotateCcw/><div><span>Wijzigingen gevraagd</span><strong>{counts.changesRequested}</strong></div></article>
          <article><UserRound/><div><span>Mijn open aanvragen</span><strong>{counts.mine}</strong></div></article>
          <article><CheckCircle2/><div><span>Afgehandeld</span><strong>{counts.completed}</strong></div></article>
        </section>
        <form className="approval-filters">
          <Filter size={16}/>
          <label>Status<select name="status" defaultValue={status}><option value="all">Alle statussen</option>{Object.entries(approvalStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Module<select name="module" defaultValue={moduleFilter}><option value="all">Alle modules</option>{Object.entries(approvalModuleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Werkvoorraad<select name="scope" defaultValue={scope}><option value="all">Hele organisatie</option><option value="mine">Mijn aanvragen</option></select></label>
          <button>Toepassen</button>
        </form>
        <section className="approval-queue">
          {rows.map((row) => {
            const canReview = row.status === "pending" &&
              canReviewApproval(membership, row.entity_type) &&
              !((row.entity_type === "email" || row.entity_type === "newsletter") && row.requested_by === user.id);
            return (
              <article key={row.id}>
                <div className={`approval-icon ${row.status}`}>{row.status === "approved" ? <CheckCircle2/> : row.status === "rejected" ? <XCircle/> : row.status === "changes_requested" ? <RotateCcw/> : <Clock3/>}</div>
                <div className="approval-main">
                  <div><span>{approvalModuleLabels[row.module]} · {approvalEntityLabels[row.entity_type]}</span><b className={`approval-badge ${row.status}`}>{approvalStatusLabels[row.status]}</b></div>
                  <Link href={row.source_href}>{row.title}</Link>
                  <small>Aangevraagd door {row.requester?.display_name || "onbekend"} · {formatDateTime(row.requested_at)}</small>
                  {row.request_note && <p>{row.request_note}</p>}
                  {row.decision_note && <p><strong>Beslissing:</strong> {row.decision_note}</p>}
                </div>
                <div className="approval-queue-actions">
                  <Link className="row-action" href={row.source_href}>Bekijken</Link>
                  {canReview ? (
                  <form className="approval-queue-actions" action={decideApproval}>
                    <input type="hidden" name="id" value={row.id}/>
                    <input type="hidden" name="return_to" value="/app/goedkeuringen"/>
                    <textarea name="decision_note" rows={2} placeholder="Toelichting bij wijzigingen/weigering"/>
                    <div>
                      <button className="approval-approve" name="decision" value="approved">Goedkeuren</button>
                      <button name="decision" value="changes_requested">Wijzigingen</button>
                      <button className="approval-reject" name="decision" value="rejected">Weigeren</button>
                    </div>
                  </form>
                  ) : row.status === "pending" ? <span className="form-hint">Alleen bestuur of beheer kan deze aanvraag beoordelen.</span> : null}
                </div>
              </article>
            );
          })}
          {!rows.length && <div className="empty">Geen goedkeuringsaanvragen in deze selectie.</div>}
        </section>
      </div>
    </AppShell>
  );
}
