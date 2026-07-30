import Link from "next/link";
import { Mail, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { googleGmailConfiguration } from "@/lib/google-gmail";
import { saveEmailCommunication } from "./actions";

const statusLabels: Record<string, string> = {
  draft: "Concept", pending_approval: "Wacht op goedkeuring", changes_requested: "Wijzigingen gevraagd",
  approved: "Goedgekeurd", sent: "Verzonden", rejected: "Geweigerd", failed: "Gmail-fout",
};
const typeLabels: Record<string, string> = {
  sponsor_follow_up: "Sponsoropvolging", event_communication: "Eventcommunicatie", invitation: "Uitnodiging",
};

export default async function CommunicationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  const org = membership.organization_id;
  const [communications, partners, events, meetings, contacts] = await Promise.all([
    supabase.from("email_communications").select("id,title,entity_type,entity_id,communication_type,status,to_addresses,subject,updated_at,sent_at,creator:profiles!email_communications_created_by_fkey(display_name)").eq("organization_id", org).order("updated_at", { ascending: false }),
    supabase.from("partners").select("id,name,email").eq("organization_id", org).is("deleted_at", null).not("status", "eq", "archived").order("name"),
    supabase.from("events").select("id,title").eq("organization_id", org).is("deleted_at", null).not("status", "eq", "archived").order("title"),
    supabase.from("meetings").select("id,title,attendees").eq("organization_id", org).is("deleted_at", null).not("status", "eq", "archived").order("title"),
    supabase.from("partner_contacts").select("partner_id,email,is_primary").eq("organization_id", org).eq("is_primary", true),
  ]);
  const rows = communications.data ?? [];
  const gmail = googleGmailConfiguration();
  const selectedType = ["partner", "event", "meeting"].includes(query.type ?? "") ? query.type! : "partner";
  const selectedId = query.id ?? "";
  const selectedPartner = (partners.data ?? []).find((item) => item.id === selectedId);
  const primary = (contacts.data ?? []).find((item) => item.partner_id === selectedId)?.email;
  const defaultTo = selectedType === "partner" ? (primary || selectedPartner?.email || "") : "";
  const selectedTitle = selectedType === "partner"
    ? selectedPartner?.name
    : selectedType === "event"
      ? (events.data ?? []).find((item) => item.id === selectedId)?.title
      : (meetings.data ?? []).find((item) => item.id === selectedId)?.title;
  const showForm = query.nieuw === "1";

  return (
    <AppShell active="Communicatie">
      <header className="topbar module-top">
        <div><p>GMAIL & DOSSIERS</p><h1>E-mailcommunicatie</h1></div>
        <Link className="primary" href="/app/communicatie?nieuw=1"><Plus size={16}/>Nieuw Gmail-concept</Link>
      </header>
      <div className="module-body communication-module">
        <p className="lead">Maak Gmail-concepten vanuit een BESC-dossier. Een tweede bevoegde persoon keurt de e-mail goed voordat het bestuur ze kan verzenden.</p>
        {!gmail.configured && <div className="error-note">Gmail is nog niet geconfigureerd. Voeg GOOGLE_GMAIL_SENDER toe en autoriseer gmail.compose via Google Workspace-domeindelegatie.</div>}
        {query.fout && <div className="error-note">De actie is mislukt ({query.fout}).</div>}
        {query.succes && <div className="success">De e-mailactie is verwerkt.</div>}

        {showForm && (
          <section className="form-card">
            <div className="form-heading"><div><span className="eyebrow">NIEUW CONCEPT</span><h2>Communicatie voorbereiden</h2></div><Link href="/app/communicatie">Sluiten</Link></div>
            <form action={saveEmailCommunication}>
              <div className="form-row">
                <label>Soort communicatie<select name="communication_type" defaultValue={selectedType === "partner" ? "sponsor_follow_up" : selectedType === "event" ? "event_communication" : "invitation"}>{Object.entries(typeLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label>Dossiertype<select name="entity_type" defaultValue={selectedType}><option value="partner">Sponsor</option><option value="event">Event</option><option value="meeting">Vergadering</option></select></label>
                <label>Dossier<select name="entity_id" defaultValue={selectedId} required><option value="">Kies een dossier</option><optgroup label="Sponsors">{(partners.data ?? []).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</optgroup><optgroup label="Events">{(events.data ?? []).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</optgroup><optgroup label="Vergaderingen">{(meetings.data ?? []).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</optgroup></select></label>
                <label>Interne titel<input name="title" required defaultValue={selectedTitle ? `E-mail - ${selectedTitle}` : ""} placeholder="Bijv. opvolging sponsordossier"/></label>
                <label>Aan<input name="to_addresses" type="text" required defaultValue={defaultTo} placeholder="naam@organisatie.be; tweede@organisatie.be"/></label>
                <label>CC<input name="cc_addresses" type="text" placeholder="Optioneel, gescheiden door ;"/></label>
                <label>Onderwerp<input name="subject" required placeholder="Onderwerp van de e-mail"/></label>
                <label>Opvolgdatum<input name="follow_up_date" type="date"/></label>
              </div>
              <label>Bericht<textarea name="body_text" required rows={12} placeholder={"Beste,\n\n...\n\nMet vriendelijke groeten,\nBESC vzw"}/></label>
              <div className="form-actions"><button className="primary" disabled={!gmail.configured}><Mail size={15}/>Opslaan als Gmail-concept</button></div>
            </form>
          </section>
        )}

        <section className="form-card">
          <div className="form-heading"><div><span className="eyebrow">REGISTER</span><h2>Communicatiegeschiedenis</h2></div><span>{rows.length} items</span></div>
          <div className="communication-list">
            {rows.map((item) => {
              const sourceHref = item.entity_type === "partner" ? `/app/sponsors/${item.entity_id}` : item.entity_type === "event" ? `/app/events/${item.entity_id}` : `/app/vergaderingen/${item.entity_id}`;
              return <article key={item.id}>
                <Mail size={18}/>
                <div><Link href={`/app/communicatie/${item.id}`}>{item.title}</Link><span>{item.subject} · {item.to_addresses.join(", ")}</span></div>
                <span>{typeLabels[item.communication_type]}</span>
                <b className={`email-status ${item.status}`}>{statusLabels[item.status]}</b>
                <Link className="row-action" href={sourceHref}>Dossier</Link>
              </article>;
            })}
            {!rows.length && <div className="empty">Nog geen Gmail-concepten of verzonden communicatie.</div>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
