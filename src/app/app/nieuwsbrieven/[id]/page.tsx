import Link from "next/link";
import { Send, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { ApprovalPanel } from "@/components/approval-panel";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { isManager } from "@/lib/permissions";
import { saveNewsletter, sendApprovedNewsletter } from "../actions";

const labels: Record<string,string> = {
  draft: "Concept", pending_approval: "Wacht op goedkeuring", changes_requested: "Wijzigingen gevraagd",
  approved: "Goedgekeurd voor verzending", sent: "Verzonden", rejected: "Geweigerd", failed: "Gmail-fout",
};

export default async function NewsletterDetail({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<Record<string,string|undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { supabase, user, membership } = await requireActiveMembership();
  const [newsletterResult, listsResult] = await Promise.all([
    supabase.from("newsletters").select("*,list:mailing_lists(name)").eq("organization_id", membership.organization_id).eq("id", id).maybeSingle(),
    supabase.from("mailing_lists").select("id,name,status").eq("organization_id", membership.organization_id).order("name"),
  ]);
  if (!newsletterResult.data) notFound();
  const item = newsletterResult.data;
  const canEdit = isManager(membership) && (item.created_by === user.id || isManager(membership)) && ["draft","changes_requested","failed"].includes(item.status);
  const canSend = isManager(membership) && item.status === "approved" && Boolean(item.gmail_draft_id);
  return <AppShell active="Nieuwsbrieven">
    <header className="project-detail-head"><div><Link href="/app/nieuwsbrieven">← Terug naar nieuwsbrieven</Link><span className="eyebrow">NIEUWSBRIEF</span><h1>{item.title}</h1><p>{labels[item.status]} · {item.recipient_count} ontvangers</p></div></header>
    <div className="project-detail-body">
      {query.succes === "concept" && <div className="success">Het Gmail-concept is bijgewerkt. Leg het nu ter goedkeuring voor.</div>}
      {query.succes === "verzonden" && <div className="success">De nieuwsbrief is via Gmail verzonden en geregistreerd.</div>}
      {query.succes === "goedkeuring-aangevraagd" && <div className="success">De nieuwsbrief wacht op een tweede bestuurder.</div>}
      {query.succes === "beslissing" && <div className="success">De beslissing is geregistreerd.</div>}
      {query.fout && <div className="error-note">De actie is mislukt ({query.fout}). {item.last_error || ""}</div>}
      <section className="project-summary"><article><span>Status</span><strong>{labels[item.status]}</strong></article><article><span>Mailinglijst</span><strong>{item.list?.name || "Onbekend"}</strong></article><article><span>Ontvangersnapshot</span><strong>{item.recipient_count}</strong></article><article><span>Verzonden</span><strong>{item.sent_at ? new Date(item.sent_at).toLocaleString("nl-BE") : "Nog niet"}</strong></article></section>
      {canEdit ? <section className="form-card"><div className="form-heading"><div><span className="eyebrow">CONCEPT</span><h2>Nieuwsbrief bewerken</h2></div></div><form action={saveNewsletter}><input type="hidden" name="id" value={item.id}/><input type="hidden" name="email_template_id" value={item.email_template_id || ""}/><div className="form-row"><label>Mailinglijst<select name="mailing_list_id" defaultValue={item.mailing_list_id}>{(listsResult.data ?? []).filter((list) => list.status === "active" || list.id === item.mailing_list_id).map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}</select></label><label>Interne titel<input name="title" defaultValue={item.title} required/></label><label>Onderwerp<input name="subject" defaultValue={item.subject} required/></label></div><label>Inhoud<textarea name="body_text" rows={16} defaultValue={item.body_text} required/></label><div className="form-actions"><button className="primary">Gmail-concept bijwerken</button></div></form></section> : <section className="form-card email-preview"><div className="form-heading"><div><span className="eyebrow">BERICHT</span><h2>{item.subject}</h2></div><span><Users size={14}/> {item.recipient_count} BCC</span></div><pre>{item.body_text}</pre></section>}
      {!["sent", "failed"].includes(item.status) && <ApprovalPanel entityType="newsletter" entityId={item.id} sourceHref={`/app/nieuwsbrieven/${item.id}`} title="Nieuwsbrief goedkeuren"/>}
      {canSend && <section className="form-card email-send-card"><div><span className="eyebrow">VERZENDING</span><h2>Klaar voor Gmail</h2><p>De nieuwsbrief is door een andere bestuurder goedgekeurd. De vastgelegde ontvangers staan uitsluitend in BCC.</p></div><form action={sendApprovedNewsletter}><input type="hidden" name="id" value={item.id}/><button className="primary"><Send size={16}/>Nieuwsbrief verzenden</button></form></section>}
    </div>
  </AppShell>;
}
