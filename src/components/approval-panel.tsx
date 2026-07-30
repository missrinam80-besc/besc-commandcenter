import Link from "next/link";
import { CheckCircle2, Clock3, RotateCcw, Send, XCircle } from "lucide-react";
import { decideApproval, submitForApproval } from "@/app/app/goedkeuringen/actions";
import { requireActiveMembership } from "@/lib/auth-context";
import {
  approvalStatusLabels,
  canReviewApproval,
  type ApprovalEntityType,
  type ApprovalStatus,
} from "@/lib/approvals";

type ApprovalRow = {
  id: string;
  status: ApprovalStatus;
  request_note: string | null;
  decision_note: string | null;
  requested_at: string;
  decided_at: string | null;
  requested_by: string;
  requester: { display_name: string | null } | null;
  reviewer: { display_name: string | null } | null;
};

export async function ApprovalPanel({
  entityType,
  entityId,
  sourceHref,
  title = "Goedkeuring",
}: {
  entityType: ApprovalEntityType;
  entityId: string;
  sourceHref: string;
  title?: string;
}) {
  const { supabase, user, membership } = await requireActiveMembership();
  const { data } = await supabase
    .from("approval_requests")
    .select("id,status,request_note,decision_note,requested_at,decided_at,requested_by,requester:profiles!approval_requests_requested_by_fkey(display_name),reviewer:profiles!approval_requests_decided_by_fkey(display_name)")
    .eq("organization_id", membership.organization_id)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const request = data as unknown as ApprovalRow | null;
  const canReview = request?.status === "pending" &&
    canReviewApproval(membership, entityType) &&
    !(entityType === "email" && request.requested_by === user.id);
  const canSubmit = !request ||
    request.status === "changes_requested" ||
    (entityType !== "email" && request.status === "rejected");

  return (
    <section className="form-card approval-panel">
      <div className="form-heading">
        <div><span className="eyebrow">WORKFLOW</span><h2>{title}</h2></div>
        <Link href="/app/goedkeuringen">Open werkvoorraad</Link>
      </div>
      {request ? (
        <div className="approval-current">
          <div className={`approval-icon ${request.status}`}>
            {request.status === "approved" ? <CheckCircle2 size={18}/> : request.status === "rejected" ? <XCircle size={18}/> : request.status === "changes_requested" ? <RotateCcw size={18}/> : <Clock3 size={18}/>}
          </div>
          <div>
            <strong>{approvalStatusLabels[request.status]}</strong>
            <span>Aangevraagd door {request.requester?.display_name || "onbekend"} op {new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium" }).format(new Date(request.requested_at))}</span>
            {request.request_note && <p>{request.request_note}</p>}
            {request.decision_note && <p><b>Toelichting:</b> {request.decision_note}</p>}
          </div>
        </div>
      ) : <p className="empty-inline">Nog niet ter goedkeuring voorgelegd.</p>}
      {canSubmit && (
        <form className="approval-submit" action={submitForApproval}>
          <input type="hidden" name="entity_type" value={entityType}/>
          <input type="hidden" name="entity_id" value={entityId}/>
          <input type="hidden" name="source_href" value={sourceHref}/>
          <label>Toelichting voor de beoordelaar<textarea name="request_note" rows={3} placeholder="Wat moet nagekeken of beslist worden?"/></label>
          <button className="primary"><Send size={15}/>{request?.status === "changes_requested" ? "Opnieuw voorleggen" : "Ter goedkeuring voorleggen"}</button>
        </form>
      )}
      {canReview && (
        <form className="approval-decision" action={decideApproval}>
          <input type="hidden" name="id" value={request.id}/>
          <input type="hidden" name="return_to" value={sourceHref}/>
          <label>Toelichting bij de beslissing<textarea name="decision_note" rows={3} placeholder="Verplicht bij wijzigingen of weigering"/></label>
          <div>
            <button className="approval-approve" name="decision" value="approved">Goedkeuren</button>
            <button name="decision" value="changes_requested">Wijzigingen vragen</button>
            <button className="approval-reject" name="decision" value="rejected">Weigeren</button>
          </div>
        </form>
      )}
      {request?.status === "pending" && request.requested_by === user.id && !canReview && <p className="form-hint">Deze aanvraag wacht op beoordeling door een bevoegde goedkeurder.</p>}
    </section>
  );
}
