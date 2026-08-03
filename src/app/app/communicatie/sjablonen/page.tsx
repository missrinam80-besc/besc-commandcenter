import Link from "next/link";
import { Braces, MailPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { emailTemplateVariables } from "@/lib/email-templates";
import { requireActiveMembership } from "@/lib/auth-context";
import { isManager } from "@/lib/permissions";
import { saveEmailTemplate, toggleEmailTemplate } from "./actions";
import { newsletterVariantLabels } from "@/lib/newsletter-html";

const categoryLabels: Record<string, string> = {
  sponsor_follow_up: "Sponsoropvolging", event_communication: "Eventcommunicatie",
  invitation: "Uitnodiging", newsletter: "Nieuwsbrief", general: "Algemeen",
};

export default async function TemplatePage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const query = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  const { data } = await supabase.from("email_templates").select("*")
    .eq("organization_id", membership.organization_id).order("category").order("name");
  const templates = data ?? [];
  const editing = query.bewerken ? templates.find((item) => item.id === query.bewerken) : null;
  const showForm = query.nieuw === "1" || Boolean(editing);
  return <AppShell active="Communicatie">
    <header className="topbar module-top"><div><p>AUTOMATISERING</p><h1>E-mailsjablonen</h1></div>{isManager(membership) && <Link className="primary" href="?nieuw=1"><MailPlus size={16}/>Nieuw sjabloon</Link>}</header>
    <div className="module-body communication-module">
      <p className="lead">Beheer herbruikbare teksten. Variabelen worden automatisch ingevuld vanuit het gekoppelde sponsor-, event- of vergaderdossier.</p>
      {query.succes && <div className="success">Het e-mailsjabloon is bijgewerkt.</div>}
      {query.fout && <div className="error-note">De actie is mislukt ({query.fout}).</div>}
      {showForm && isManager(membership) && <section className="form-card">
        <div className="form-heading"><div><span className="eyebrow">SJABLOON</span><h2>{editing ? "Sjabloon bewerken" : "Nieuw sjabloon"}</h2></div><Link href="/app/communicatie/sjablonen">Sluiten</Link></div>
        <form action={saveEmailTemplate}>
          <input type="hidden" name="id" value={editing?.id ?? ""}/>
          <div className="form-row">
            <label>Naam<input name="name" required defaultValue={editing?.name ?? ""}/></label>
            <label>Categorie<select name="category" defaultValue={editing?.category ?? "general"}>{Object.entries(categoryLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Dossiertype<select name="entity_type" defaultValue={editing?.entity_type ?? ""}><option value="">Niet dossiergebonden</option><option value="partner">Sponsor</option><option value="event">Event</option><option value="meeting">Vergadering</option></select></label>
            <label className="inline-check"><input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true}/>Actief</label>
          </div>
          <label>Onderwerp<input name="subject_template" required defaultValue={editing?.subject_template ?? ""}/></label>
          <label>Bericht<textarea name="body_template" rows={14} required defaultValue={editing?.body_template ?? ""}/></label>
          <div className="form-row">
            <label>Nieuwsbriefopmaak<select name="newsletter_variant" defaultValue={editing?.newsletter_variant ?? "besc"}>{Object.entries(newsletterVariantLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Standaardafbeelding (HTTPS)<input type="url" name="default_hero_image_url" defaultValue={editing?.default_hero_image_url ?? ""}/></label>
            <label>Beschrijving afbeelding<input name="default_hero_image_alt" maxLength={300} defaultValue={editing?.default_hero_image_alt ?? ""}/></label>
          </div>
          <p className="form-hint">Deze opmaakvelden worden alleen gebruikt wanneer het sjabloon voor een nieuwsbrief wordt gekozen.</p>
          <div className="form-actions"><button className="primary">Sjabloon opslaan</button></div>
        </form>
      </section>}
      <section className="template-layout">
        <div className="form-card">
          <div className="form-heading"><div><span className="eyebrow">BIBLIOTHEEK</span><h2>Beschikbare sjablonen</h2></div><span>{templates.length}</span></div>
          <div className="template-list">{templates.map((item) => <article key={item.id}>
            <Braces/><div><strong>{item.name}</strong><span>{categoryLabels[item.category]} · {item.entity_type || "algemeen"}{item.is_system ? " · standaardsjabloon" : ""}</span><small>{item.subject_template}</small></div>
            <b className={item.is_active ? "active" : "inactive"}>{item.is_active ? "Actief" : "Inactief"}</b>
            {isManager(membership) && <div className="template-actions"><Link href={`?bewerken=${item.id}`}>Bewerken</Link><form action={toggleEmailTemplate}><input type="hidden" name="id" value={item.id}/><input type="hidden" name="active" value={String(item.is_active)}/><button>{item.is_active ? "Pauzeren" : "Activeren"}</button></form></div>}
          </article>)}</div>
        </div>
        <aside className="form-card variable-card"><div className="form-heading"><h2>Beschikbare variabelen</h2></div>{emailTemplateVariables.map(([variable,label]) => <div key={variable}><code>{variable}</code><span>{label}</span></div>)}</aside>
      </section>
    </div>
  </AppShell>;
}
