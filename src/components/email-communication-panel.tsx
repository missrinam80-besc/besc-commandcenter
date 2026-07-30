import Link from "next/link";
import { Mail, Plus } from "lucide-react";
import { requireActiveMembership } from "@/lib/auth-context";

const labels: Record<string, string> = {
  draft: "Concept", pending_approval: "Ter goedkeuring", changes_requested: "Wijzigingen",
  approved: "Goedgekeurd", sent: "Verzonden", rejected: "Geweigerd", failed: "Fout",
};

export async function EmailCommunicationPanel({ entityType, entityId }: { entityType: "partner" | "event" | "meeting"; entityId: string }) {
  const { supabase, membership } = await requireActiveMembership();
  const { data } = await supabase.from("email_communications")
    .select("id,title,subject,status")
    .eq("organization_id", membership.organization_id)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("updated_at", { ascending: false })
    .limit(6);
  return <section className="form-card">
    <div className="form-heading"><div><span className="eyebrow">E-MAIL</span><h2>Communicatie</h2></div><Link className="row-action" href={`/app/communicatie?nieuw=1&type=${entityType}&id=${entityId}`}><Plus size={14}/>Nieuw Gmail-concept</Link></div>
    <div className="dossier-email-list">
      {(data ?? []).map((item) => <Link href={`/app/communicatie/${item.id}`} key={item.id}><Mail size={15}/><div><strong>{item.title}</strong><span>{item.subject}</span></div><b className={`email-status ${item.status}`}>{labels[item.status]}</b></Link>)}
      {!data?.length && <p className="empty-inline">Nog geen e-mailcommunicatie bij dit dossier.</p>}
    </div>
  </section>;
}
