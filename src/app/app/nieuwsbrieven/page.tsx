import Link from "next/link";
import { ListPlus, MailPlus, Newspaper, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { renderEmailTemplate } from "@/lib/email-templates";
import { googleGmailConfiguration } from "@/lib/google-gmail";
import { requireActiveMembership } from "@/lib/auth-context";
import { isManager } from "@/lib/permissions";
import { saveMailingList, saveNewsletter } from "./actions";

const newsletterStatuses: Record<string,string> = {
  draft: "Concept", pending_approval: "Ter goedkeuring", changes_requested: "Wijzigingen",
  approved: "Goedgekeurd", sent: "Verzonden", rejected: "Geweigerd", failed: "Gmail-fout",
};

export default async function NewsletterPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const query = await searchParams;
  const { supabase, membership, user } = await requireActiveMembership();
  const org = membership.organization_id;
  if (!isManager(membership)) return <AppShell active="Nieuwsbrieven"><div className="module-body"><div className="permission-note">Alleen bestuur en beheerders kunnen mailinglijsten en nieuwsbrieven beheren.</div></div></AppShell>;
  const [lists, subscribers, newsletters, templates, organization, profile] = await Promise.all([
    supabase.from("mailing_lists").select("*").eq("organization_id", org).order("name"),
    supabase.from("mailing_subscribers").select("mailing_list_id,status").eq("organization_id", org),
    supabase.from("newsletters").select("id,title,subject,status,recipient_count,sent_at,mailing_list_id,updated_at,list:mailing_lists(name)").eq("organization_id", org).order("updated_at", { ascending: false }),
    supabase.from("email_templates").select("*").eq("organization_id", org).eq("category", "newsletter").eq("is_active", true).order("name"),
    supabase.from("organizations").select("name").eq("id", org).maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  const activeLists = (lists.data ?? []).filter((item) => item.status === "active");
  const selectedTemplate = (templates.data ?? []).find((item) => item.id === query.template) ?? templates.data?.[0];
  const selectedList = query.lijst ?? activeLists[0]?.id ?? "";
  const title = query.titel ?? "";
  const templateContext = {
    organisatie: organization.data?.name || "BESC vzw",
    afzender: profile.data?.display_name || "BESC",
    contact_naam: "",
    nieuwsbrief_titel: title || "Nieuws van BESC",
    nieuwsbrief_inhoud: "[Schrijf hier de inhoud van de nieuwsbrief]",
  };
  const subject = selectedTemplate ? renderEmailTemplate(selectedTemplate.subject_template, templateContext) : "";
  const body = selectedTemplate ? renderEmailTemplate(selectedTemplate.body_template, templateContext) : "";
  const gmail = googleGmailConfiguration();
  return <AppShell active="Nieuwsbrieven">
    <header className="topbar module-top"><div><p>MAILINGLIJSTEN & GMAIL</p><h1>Nieuwsbrieven</h1></div><div className="project-actions"><Link href="?nieuwe_lijst=1"><ListPlus size={16}/>Nieuwe lijst</Link><Link className="primary" href="?nieuw=1"><MailPlus size={16}/>Nieuwe nieuwsbrief</Link></div></header>
    <div className="module-body newsletter-module">
      <p className="lead">Beheer toestemming en ontvangers, maak een Gmail-concept met alle ontvangers in BCC en laat een tweede bestuurder de verzending goedkeuren.</p>
      {query.fout && <div className="error-note">De actie is mislukt ({query.fout}).</div>}
      {query.succes && <div className="success">De wijziging is opgeslagen.</div>}
      {!gmail.configured && <div className="error-note">Gmail is niet geconfigureerd; nieuwsbrieven kunnen nog niet als concept worden aangemaakt.</div>}
      {query.nieuwe_lijst && <section className="form-card"><div className="form-heading"><h2>Nieuwe mailinglijst</h2><Link href="/app/nieuwsbrieven">Sluiten</Link></div><form action={saveMailingList}><div className="form-row"><label>Naam<input name="name" required/></label><label>Status<select name="status"><option value="active">Actief</option><option value="paused">Gepauzeerd</option><option value="archived">Gearchiveerd</option></select></label></div><label>Beschrijving<textarea name="description" rows={3}/></label><div className="form-actions"><button className="primary">Lijst opslaan</button></div></form></section>}
      {query.nieuw && <section className="form-card">
        <div className="form-heading"><div><span className="eyebrow">NIEUWSBRIEF</span><h2>Nieuw Gmail-concept</h2></div><Link href="/app/nieuwsbrieven">Sluiten</Link></div>
        <form className="template-picker" method="get"><input type="hidden" name="nieuw" value="1"/><label>Sjabloon<select name="template" defaultValue={selectedTemplate?.id ?? ""}>{(templates.data ?? []).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Titel voor variabelen<input name="titel" defaultValue={title}/></label><input type="hidden" name="lijst" value={selectedList}/><button>Automatisch invullen</button></form>
        <form action={saveNewsletter}>
          <input type="hidden" name="email_template_id" value={selectedTemplate?.id ?? ""}/>
          <div className="form-row">
            <label>Mailinglijst<select name="mailing_list_id" defaultValue={selectedList} required><option value="">Kies een lijst</option>{activeLists.map((item) => <option value={item.id} key={item.id}>{item.name} ({(subscribers.data ?? []).filter((subscriber) => subscriber.mailing_list_id === item.id && subscriber.status === "subscribed").length})</option>)}</select></label>
            <label>Interne titel<input name="title" required defaultValue={title}/></label>
            <label>Onderwerp<input name="subject" required defaultValue={subject}/></label>
          </div>
          <label>Nieuwsbrieftekst<textarea name="body_text" rows={16} required defaultValue={body}/></label>
          <p className="form-hint">De uitschrijfinstructie wordt automatisch toegevoegd. Maximaal 100 actieve ontvangers per Gmail-verzending.</p>
          <div className="form-actions"><button className="primary" disabled={!gmail.configured || !activeLists.length}><Newspaper size={16}/>Gmail-concept aanmaken</button></div>
        </form>
      </section>}
      <section className="newsletter-stats">
        <article><Users/><div><span>Mailinglijsten</span><strong>{(lists.data ?? []).filter((item) => item.status !== "archived").length}</strong></div></article>
        <article><Users/><div><span>Actieve inschrijvingen</span><strong>{(subscribers.data ?? []).filter((item) => item.status === "subscribed").length}</strong></div></article>
        <article><Newspaper/><div><span>Nieuwsbrieven</span><strong>{newsletters.data?.length ?? 0}</strong></div></article>
        <article><MailPlus/><div><span>Wacht op goedkeuring</span><strong>{(newsletters.data ?? []).filter((item) => item.status === "pending_approval").length}</strong></div></article>
      </section>
      <div className="newsletter-grid">
        <section className="form-card"><div className="form-heading"><div><span className="eyebrow">LIJSTEN</span><h2>Mailinglijsten</h2></div></div><div className="mailing-list-register">{(lists.data ?? []).map((item) => {
          const all = (subscribers.data ?? []).filter((subscriber) => subscriber.mailing_list_id === item.id);
          return <Link href={`/app/nieuwsbrieven/lijsten/${item.id}`} key={item.id}><Users/><div><strong>{item.name}</strong><span>{all.filter((subscriber) => subscriber.status === "subscribed").length} actief · {all.filter((subscriber) => subscriber.status === "unsubscribed").length} uitgeschreven</span></div><b>{item.status}</b></Link>;
        })}{!lists.data?.length && <div className="empty">Maak eerst een mailinglijst.</div>}</div></section>
        <section className="form-card"><div className="form-heading"><div><span className="eyebrow">VERZENDINGEN</span><h2>Nieuwsbriefregister</h2></div></div><div className="newsletter-register">{(newsletters.data ?? []).map((item) => <Link href={`/app/nieuwsbrieven/${item.id}`} key={item.id}><Newspaper/><div><strong>{item.title}</strong><span>{item.subject} · {item.recipient_count} ontvangers</span></div><b className={`email-status ${item.status}`}>{newsletterStatuses[item.status]}</b></Link>)}{!newsletters.data?.length && <div className="empty">Nog geen nieuwsbrieven.</div>}</div></section>
      </div>
    </div>
  </AppShell>;
}
