import Link from "next/link";
import { Mail, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FormModal } from "@/components/form-modal";
import { requireActiveMembership } from "@/lib/auth-context";
import { googleGmailConfiguration } from "@/lib/google-gmail";
import { CommunicationComposer } from "@/components/communication-composer";
import { saveEmailCommunication } from "./actions";

const statusLabels: Record<string, string> = {
  draft: "Concept", pending_approval: "Wacht op goedkeuring", changes_requested: "Wijzigingen gevraagd",
  approved: "Goedgekeurd", sent: "Verzonden", rejected: "Geweigerd", failed: "Gmail-fout",
};
const typeLabels: Record<string, string> = {
  sponsor_follow_up: "Sponsoropvolging", event_communication: "Eventcommunicatie", invitation: "Uitnodiging", project_update: "Projectcommunicatie", campaign_update: "Campagnecommunicatie",
};

export default async function CommunicationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const { supabase, membership, user } = await requireActiveMembership();
  const org = membership.organization_id;
  const [communications, partners, events, meetings, projects, campaigns, contacts, templates, organization, profile] = await Promise.all([
    supabase.from("email_communications").select("id,title,entity_type,entity_id,communication_type,status,to_addresses,subject,updated_at,sent_at,creator:profiles!email_communications_created_by_fkey(display_name)").eq("organization_id", org).order("updated_at", { ascending: false }),
    supabase.from("partners").select("id,name,email,next_follow_up").eq("organization_id", org).is("deleted_at", null).not("status", "eq", "archived").order("name"),
    supabase.from("events").select("id,title,start_at,location,is_online").eq("organization_id", org).is("deleted_at", null).not("status", "eq", "archived").order("title"),
    supabase.from("meetings").select("id,title,meeting_at,attendees").eq("organization_id", org).is("deleted_at", null).not("status", "eq", "archived").order("title"),
    supabase.from("projects").select("id,title").eq("organization_id", org).is("deleted_at", null).not("status", "eq", "archived").order("title"),
    supabase.from("campaigns").select("id,title").eq("organization_id", org).is("deleted_at", null).not("status", "eq", "archived").order("title"),
    supabase.from("partner_contacts").select("partner_id,name,email,is_primary").eq("organization_id", org).eq("is_primary", true),
    supabase.from("email_templates").select("id,name,category,entity_type,subject_template,body_template").eq("organization_id", org).eq("is_active", true).order("name"),
    supabase.from("organizations").select("name").eq("id", org).maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  const rows = communications.data ?? [];
  const gmail = googleGmailConfiguration();
  const selectedType = ["partner", "event", "meeting", "project", "campaign"].includes(query.type ?? "") ? query.type! : "partner";
  const selectedId = query.id ?? "";
  const organizationName = organization.data?.name || "BESC vzw";
  const senderName = profile.data?.display_name || "BESC";
  const showForm = query.nieuw === "1";

  return (
    <AppShell active="Communicatie">
      <header className="topbar module-top">
        <div><p>GMAIL & DOSSIERS</p><h1>E-mailcommunicatie</h1></div>
        <div className="project-actions"><Link href="/app/communicatie/sjablonen">Sjablonen beheren</Link><Link className="primary" href="/app/communicatie?nieuw=1"><Plus size={16}/>Nieuw Gmail-concept</Link></div>
      </header>
      <div className="module-body communication-module">
        <p className="lead">Maak Gmail-concepten vanuit een BESC-dossier. Een tweede bevoegde persoon keurt de e-mail goed voordat het bestuur ze kan verzenden.</p>
        {!gmail.configured && <div className="error-note">Gmail is nog niet geconfigureerd. Voeg GOOGLE_GMAIL_SENDER toe en autoriseer Gmail Compose via Google OAuth.</div>}
        {query.fout && <div className="error-note">De actie is mislukt ({query.fout}).</div>}
        {query.succes && <div className="success">De e-mailactie is verwerkt.</div>}

        {showForm && (
          <FormModal title="Communicatie voorbereiden" closeHref="/app/communicatie">
          <div>
            <div className="form-heading"><div><span className="eyebrow">NIEUW CONCEPT</span><h2>Communicatie voorbereiden</h2></div><Link href="/app/communicatie">Sluiten</Link></div>
            <CommunicationComposer
              action={saveEmailCommunication}
              gmailConfigured={gmail.configured}
              templates={(templates.data ?? [])}
              partners={(partners.data ?? []).map((item) => ({ id: item.id, title: item.name, email: contacts.data?.find((contact) => contact.partner_id === item.id)?.email || item.email || "", contactName: contacts.data?.find((contact) => contact.partner_id === item.id)?.name || "", followUpDate: item.next_follow_up }))}
              events={(events.data ?? []).map((item) => ({ id: item.id, title: item.title, date: item.start_at, location: item.location, isOnline: item.is_online }))}
              meetings={(meetings.data ?? []).map((item) => ({ id: item.id, title: item.title, date: item.meeting_at }))}
              projects={(projects.data ?? []).map((item) => ({ id: item.id, title: item.title }))}
              campaigns={(campaigns.data ?? []).map((item) => ({ id: item.id, title: item.title }))}
              organizationName={organizationName}
              senderName={senderName}
              initialType={selectedType}
              initialId={selectedId}
            />
          </div>
          </FormModal>
        )}

        <section className="form-card">
          <div className="form-heading"><div><span className="eyebrow">REGISTER</span><h2>Communicatiegeschiedenis</h2></div><span>{rows.length} items</span></div>
          <div className="communication-list">
            {rows.map((item) => {
              const sourceHref = item.entity_type === "partner" ? `/app/sponsors/${item.entity_id}` : item.entity_type === "event" ? `/app/events/${item.entity_id}` : item.entity_type === "meeting" ? `/app/vergaderingen/${item.entity_id}` : item.entity_type === "project" ? `/app/projecten/${item.entity_id}` : `/app/campagnes/${item.entity_id}`;
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
