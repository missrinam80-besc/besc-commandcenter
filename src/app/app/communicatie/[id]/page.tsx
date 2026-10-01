import Link from "next/link";
import { Mail, Send } from "lucide-react";
import { notFound } from "next/navigation";
import { ApprovalPanel } from "@/components/approval-panel";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { googleGmailConfiguration } from "@/lib/google-gmail";
import { isManager } from "@/lib/permissions";
import { saveEmailCommunication, sendApprovedEmail } from "../actions";

const statusLabels: Record<string, string> = {
  draft: "Concept", pending_approval: "Wacht op goedkeuring", changes_requested: "Wijzigingen gevraagd",
  approved: "Goedgekeurd voor verzending", sent: "Verzonden", rejected: "Geweigerd", failed: "Gmail-fout",
};

export default async function EmailDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string,string|undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { supabase, user, membership } = await requireActiveMembership();
  const { data: item } = await supabase.from("email_communications").select("*").eq("organization_id", membership.organization_id).eq("id", id).is("deleted_at", null).maybeSingle();
  if (!item) notFound();
  const canEdit = (item.created_by === user.id || isManager(membership)) && ["draft", "changes_requested", "failed"].includes(item.status);
  const canSend = isManager(membership) && item.status === "approved" && Boolean(item.gmail_draft_id);
  const sourceHref = item.entity_type === "partner" ? `/app/sponsors/${item.entity_id}` : item.entity_type === "event" ? `/app/events/${item.entity_id}` : item.entity_type === "meeting" ? `/app/vergaderingen/${item.entity_id}` : item.entity_type === "project" ? `/app/projecten/${item.entity_id}` : `/app/campagnes/${item.entity_id}`;
  const gmail = googleGmailConfiguration();

  return (
    <AppShell active="Communicatie">
      <header className="topbar module-top"><div><p>E-MAILDOSSIER</p><h1>{item.title}</h1></div><Link href="/app/communicatie">Terug naar register</Link></header>
      <div className="module-body communication-module">
        {query.succes === "concept" && <div className="success">Het Gmail-concept is opgeslagen. Leg het nu ter goedkeuring voor.</div>}
        {query.succes === "verzonden" && <div className="success">De e-mail is verzonden en bij het gekoppelde dossier geregistreerd.</div>}
        {query.succes === "goedkeuring-aangevraagd" && <div className="success">De e-mail wacht op beoordeling door een andere bevoegde gebruiker.</div>}
        {query.succes === "beslissing" && <div className="success">De beslissing is geregistreerd.</div>}
        {query.fout && <div className="error-note">De actie is mislukt ({query.fout}).{item.last_error ? ` ${item.last_error}` : ""}</div>}
        <section className="email-detail-head form-card">
          <div><Mail/><div><span>Status</span><strong>{statusLabels[item.status]}</strong></div></div>
          <div><span>Gekoppeld dossier</span><Link href={sourceHref}>Open dossier</Link></div>
          <div><span>Gmail-afzender</span><strong>{gmail.sender || "Niet geconfigureerd"}</strong></div>
          {item.sent_at && <div><span>Verzonden</span><strong>{new Date(item.sent_at).toLocaleString("nl-BE")}</strong></div>}
        </section>

        {canEdit ? (
          <section className="form-card">
            <div className="form-heading"><div><span className="eyebrow">CONCEPT</span><h2>Bericht bewerken</h2></div></div>
            <form action={saveEmailCommunication}>
              <input type="hidden" name="id" value={item.id}/><input type="hidden" name="entity_type" value={item.entity_type}/><input type="hidden" name="entity_id" value={item.entity_id}/><input type="hidden" name="email_template_id" value={item.email_template_id || ""}/>
              <div className="form-row">
                <label>Soort<select name="communication_type" defaultValue={item.communication_type}><option value="sponsor_follow_up">Sponsoropvolging</option><option value="event_communication">Eventcommunicatie</option><option value="invitation">Uitnodiging</option><option value="project_update">Projectcommunicatie</option><option value="campaign_update">Campagnecommunicatie</option></select></label>
                <label>Interne titel<input name="title" required defaultValue={item.title}/></label>
                <label>Aan<input name="to_addresses" required defaultValue={item.to_addresses.join("; ")}/></label>
                <label>CC<input name="cc_addresses" defaultValue={item.cc_addresses.join("; ")}/></label>
                <label>BCC<input name="bcc_addresses" defaultValue={(item.bcc_addresses ?? []).join("; ")}/></label>
                <label>Onderwerp<input name="subject" required defaultValue={item.subject}/></label>
                <label>Opvolgdatum<input name="follow_up_date" type="date" defaultValue={item.follow_up_date || ""}/></label>
              </div>
              <label>Bericht<textarea name="body_text" rows={14} required defaultValue={item.body_text}/></label>
              <div className="form-actions"><button className="primary"><Mail size={15}/>Gmail-concept bijwerken</button></div>
            </form>
          </section>
        ) : (
          <section className="form-card email-preview">
            <div className="form-heading"><div><span className="eyebrow">BERICHT</span><h2>{item.subject}</h2></div></div>
            <dl><div><dt>Aan</dt><dd>{item.to_addresses.join(", ")}</dd></div>{item.cc_addresses.length > 0 && <div><dt>CC</dt><dd>{item.cc_addresses.join(", ")}</dd></div>}{(item.bcc_addresses ?? []).length > 0 && <div><dt>BCC</dt><dd>{item.bcc_addresses.join(", ")}</dd></div>}</dl>
            <pre>{item.body_text}</pre>
          </section>
        )}

        {!["sent", "failed"].includes(item.status) && <div id="goedkeuring"><ApprovalPanel entityType="email" entityId={item.id} sourceHref={`/app/communicatie/${item.id}`} title="Menselijke goedkeuring"/></div>}
        {canSend && <section className="form-card email-send-card"><div><span className="eyebrow">VERZENDING</span><h2>Klaar om te verzenden</h2><p>Het concept is door een andere bevoegde gebruiker goedgekeurd. Controleer het bericht nog één keer voor verzending.</p></div><form action={sendApprovedEmail}><input type="hidden" name="id" value={item.id}/><button className="primary"><Send size={16}/>Nu via Gmail verzenden</button></form></section>}
      </div>
    </AppShell>
  );
}
