import Link from "next/link";
import { decideApproval, submitForApproval } from "@/app/app/goedkeuringen/actions";
import { requireActiveMembership } from "@/lib/auth-context";
import { approvalStatusLabels, canReviewApproval, type ApprovalStatus } from "@/lib/approvals";
import { hasPermission } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";

type SnapshotRecord = Record<string, unknown>;
type Review = {
  id: string; status: ApprovalStatus; requested_by: string;
  request_note: string | null; decision_note: string | null;
  requested_at: string; decided_at: string | null;
  requester: { display_name: string | null } | null;
  reviewer: { display_name: string | null } | null;
  source_snapshot: { post: SnapshotRecord; variants: SnapshotRecord[] };
};

function SubmittedVersion({ record }: { record: SnapshotRecord }) {
  return <div className="record-notes">
    <p><strong>{String(record.platform ?? "Bundel")}</strong>{record.title ? ` · ${String(record.title)}` : ""}</p>
    <p style={{ whiteSpace: "pre-wrap" }}>{String(record.copy ?? "Geen tekst ingevuld")}</p>
    {record.hashtags ? <p>{String(record.hashtags)}</p> : null}
    {record.call_to_action ? <p>{String(record.call_to_action)}</p> : null}
    {record.scheduled_at ? <p>Gepland: {formatDateTime(String(record.scheduled_at))}</p> : null}
    {record.instagram_image_url ? <p>Instagram-afbeelding: {String(record.instagram_image_url)}</p> : null}
    {record.instagram_target && typeof record.instagram_target === 'object' ? <p>Instagram-account: {String((record.instagram_target as SnapshotRecord).name)} · {String((record.instagram_target as SnapshotRecord).external_id)}</p> : null}
    {record.canva_url ? <p>Ontwerp: {String(record.canva_url)}</p> : null}
    {record.notes ? <p style={{ whiteSpace: "pre-wrap" }}>{String(record.notes)}</p> : null}
  </div>;
}

export async function SocialApprovalPanel({ id, status, deleted }: { id: string; status: string; deleted: boolean }) {
  const { supabase, user, membership } = await requireActiveMembership();
  const href = `/app/social/${id}`;
  const { data, error } = await supabase.from("approval_requests")
    .select("id,status,requested_by,request_note,decision_note,requested_at,decided_at,source_snapshot,requester:profiles!approval_requests_requested_by_fkey(display_name),reviewer:profiles!approval_requests_decided_by_fkey(display_name)")
    .eq("organization_id", membership.organization_id).eq("entity_type", "social").eq("entity_id", id)
    .order("requested_at", { ascending: false }).order("id", { ascending: false });
  if (error) return <section className="form-card"><h2>Interne beoordeling</h2><p className="error-note">De beoordelingshistorie kon niet worden geladen. Probeer opnieuw.</p></section>;
  const reviews = (data ?? []) as unknown as Review[];
  const latest = reviews[0];
  const available = !deleted && status !== "archived";
  const canSubmit = available && hasPermission(membership, "manageOrganization") && latest?.status !== "pending";
  const canReview = available && latest?.status === "pending" && latest.requested_by !== user.id && canReviewApproval(membership, "social");
  const changedAfterApproval = latest?.status === "approved" && !["approved", "scheduled", "published"].includes(status);
  return <section className="form-card approval-panel">
    <div className="form-heading"><h2>Interne beoordeling</h2><Link href="/app/goedkeuringen?module=social">Open werkvoorraad</Link></div>
    <p className="form-hint">Goedkeuring geldt voor de ingediende versie, inclusief kanaalvarianten. Tijdens de beoordeling staat de inhoud vast. Een andere bevoegde goedkeurder beslist. Er wordt niets gepubliceerd.</p>
    {latest ? <p><strong>Laatste ronde: {approvalStatusLabels[latest.status]}</strong></p> : <p>Nog niet ter beoordeling voorgelegd.</p>}
    {changedAfterApproval && <p className="error-note">De eerdere goedkeuring geldt voor een vorige versie. Leg de huidige versie opnieuw voor.</p>}
    {latest?.status === "pending" && !canReview && <p className="form-hint">Deze aanvraag wacht op een andere bevoegde goedkeurder.</p>}
    {canSubmit && <form action={submitForApproval} className="approval-submit">
      <input type="hidden" name="entity_type" value="social"/><input type="hidden" name="entity_id" value={id}/><input type="hidden" name="source_href" value={href}/>
      <label>Toelichting voor de beoordelaar<textarea name="request_note" rows={3} maxLength={4000}/></label>
      <button className="primary">{latest ? "Opnieuw ter beoordeling voorleggen" : "Ter beoordeling voorleggen"}</button>
    </form>}
    {reviews.length > 0 && <details open={latest?.status === "pending"}><summary>Beoordelingshistorie ({reviews.length} rondes)</summary>
      {reviews.map((review) => <article key={review.id}>
        <h3>{approvalStatusLabels[review.status]}</h3>
        <p>Aangevraagd door {review.requester?.display_name || "onbekend"} op {formatDateTime(review.requested_at)}</p>
        {review.request_note && <p>{review.request_note}</p>}
        {review.decided_at && <p>Beslist door {review.reviewer?.display_name || "onbekend"} op {formatDateTime(review.decided_at)}</p>}
        {review.decision_note && <p><strong>Toelichting:</strong> {review.decision_note}</p>}
        <details open={review.id === latest?.id && latest.status === "pending"}><summary>Ingediende versie</summary>
          {review.source_snapshot?.post && <SubmittedVersion record={review.source_snapshot.post}/>}
          {review.source_snapshot?.variants?.map((variant) => <SubmittedVersion key={String(variant.id)} record={variant}/>)}
        </details>
      </article>)}
    </details>}
    {canReview && <form action={decideApproval} className="approval-decision">
      <input type="hidden" name="id" value={latest.id}/><input type="hidden" name="return_to" value={href}/>
      <label>Toelichting bij de beslissing<textarea name="decision_note" rows={3} maxLength={4000} placeholder="Verplicht bij wijzigingen of weigering"/></label>
      <div><button className="approval-approve" name="decision" value="approved">Goedkeuren</button><button name="decision" value="changes_requested">Wijzigingen vragen</button><button className="approval-reject" name="decision" value="rejected">Weigeren</button></div>
    </form>}
  </section>;
}
