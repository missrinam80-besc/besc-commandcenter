import Link from "next/link";
import { UserMinus, UserPlus, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { isManager } from "@/lib/permissions";
import { changeSubscriberStatus, saveMailingList, saveSubscriber } from "../../actions";

export default async function MailingListDetail({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<Record<string,string|undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { supabase, membership } = await requireActiveMembership();
  if (!isManager(membership)) return <AppShell active="Nieuwsbrieven"><div className="module-body"><div className="permission-note">Geen toegang tot persoonsgegevens van mailinglijsten.</div></div></AppShell>;
  const [listResult, subscriberResult] = await Promise.all([
    supabase.from("mailing_lists").select("*").eq("organization_id", membership.organization_id).eq("id", id).maybeSingle(),
    supabase.from("mailing_subscribers").select("*").eq("organization_id", membership.organization_id).eq("mailing_list_id", id).order("email"),
  ]);
  if (!listResult.data) notFound();
  const list = listResult.data;
  const subscribers = subscriberResult.data ?? [];
  const editing = query.bewerken ? subscribers.find((item) => item.id === query.bewerken) : null;
  return <AppShell active="Nieuwsbrieven">
    <header className="project-detail-head"><div><Link href="/app/nieuwsbrieven">← Terug naar nieuwsbrieven</Link><span className="eyebrow">MAILINGLIJST</span><h1>{list.name}</h1><p>{subscribers.filter((item) => item.status === "subscribed").length} actieve ontvangers</p></div><div className="project-actions"><Link href="?lijst_bewerken=1">Lijst bewerken</Link><Link className="primary" href="?nieuw=1"><UserPlus size={16}/>Ontvanger toevoegen</Link></div></header>
    <div className="project-detail-body">
      {query.succes && <div className="success">De mailinglijst is bijgewerkt.</div>}{query.fout && <div className="error-note">De actie is mislukt ({query.fout}).</div>}
      {query.lijst_bewerken && <section className="form-card"><div className="form-heading"><h2>Lijstinstellingen</h2><Link href="?">Sluiten</Link></div><form action={saveMailingList}><input type="hidden" name="id" value={list.id}/><div className="form-row"><label>Naam<input name="name" defaultValue={list.name} required/></label><label>Status<select name="status" defaultValue={list.status}><option value="active">Actief</option><option value="paused">Gepauzeerd</option><option value="archived">Gearchiveerd</option></select></label></div><label>Beschrijving<textarea name="description" rows={3} defaultValue={list.description || ""}/></label><div className="form-actions"><button className="primary">Opslaan</button></div></form></section>}
      {(query.nieuw || editing) && <section className="form-card"><div className="form-heading"><h2>{editing ? "Ontvanger bewerken" : "Ontvanger toevoegen"}</h2><Link href="?">Sluiten</Link></div><form action={saveSubscriber}><input type="hidden" name="id" value={editing?.id || ""}/><input type="hidden" name="mailing_list_id" value={id}/><div className="form-row"><label>E-mailadres<input type="email" name="email" required defaultValue={editing?.email || ""}/></label><label>Naam<input name="display_name" defaultValue={editing?.display_name || ""}/></label><label>Status<select name="status" defaultValue={editing?.status || "subscribed"}><option value="subscribed">Ingeschreven</option><option value="unsubscribed">Uitgeschreven</option><option value="bounced">Onbestelbaar</option></select></label><label>Bron<select name="source" defaultValue={editing?.source || "manual"}><option value="manual">Handmatig</option><option value="import">Import</option><option value="form">Formulier</option><option value="event">Event</option><option value="partner">Partner</option><option value="community">Community</option></select></label><label>Grondslag<select name="consent_basis" defaultValue={editing?.consent_basis || "consent"}><option value="consent">Toestemming</option><option value="existing_relationship">Bestaande relatie</option><option value="legitimate_interest">Gerechtvaardigd belang</option><option value="internal">Intern BESC</option></select></label></div><label>Notities<textarea name="notes" rows={3} defaultValue={editing?.notes || ""}/></label><div className="form-actions"><button className="primary">Ontvanger opslaan</button></div></form></section>}
      <section className="form-card"><div className="form-heading"><div><span className="eyebrow">ONTVANGERS</span><h2>Inschrijvingen</h2></div><span>{subscribers.length}</span></div><div className="subscriber-list">{subscribers.map((item) => <article key={item.id}><Users/><div><strong>{item.display_name || item.email}</strong><span>{item.email} · {item.source} · {item.consent_basis}</span></div><b className={`subscriber-status ${item.status}`}>{item.status}</b><Link href={`?bewerken=${item.id}`}>Bewerken</Link><form action={changeSubscriberStatus}><input type="hidden" name="id" value={item.id}/><input type="hidden" name="mailing_list_id" value={id}/><input type="hidden" name="status" value={item.status === "subscribed" ? "unsubscribed" : "subscribed"}/><button title={item.status === "subscribed" ? "Uitschrijven" : "Opnieuw inschrijven"}>{item.status === "subscribed" ? <UserMinus size={15}/> : <UserPlus size={15}/>}</button></form></article>)}{!subscribers.length && <div className="empty">Nog geen ontvangers in deze lijst.</div>}</div></section>
    </div>
  </AppShell>;
}
