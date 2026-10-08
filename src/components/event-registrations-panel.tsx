import Link from "next/link";
import { requireActiveMembership } from "@/lib/auth-context";
import { hasPermission } from "@/lib/permissions";
import { registrationModes, registrationStatuses, registrationCounts, type EventRegistration } from "@/lib/event-registrations";
import { saveRegistrationSettings, saveEventRegistration, deleteEventRegistration } from "@/app/app/events/[id]/registration-actions";
import { FormModal } from "@/components/form-modal";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export async function EventRegistrationsPanel({ eventId, legacyUrl, selected }: { eventId: string; legacyUrl?: string; selected?: string }) {
  const { supabase, membership } = await requireActiveMembership();
  const canManage = hasPermission(membership, "manageEvents");
  const settings = await supabase.from("event_registration_settings").select("mode,capacity,external_url,notes").eq("organization_id", membership.organization_id).eq("event_id", eventId).maybeSingle();
  const entries = canManage ? await supabase.from("event_registrations").select("id,name,quantity,status,notes").eq("organization_id", membership.organization_id).eq("event_id", eventId).order("created_at") : { data: [], error: null };
  const rows = (entries.data ?? []) as EventRegistration[], current = rows.find(row => row.id === selected);
  const config = settings.data, counts = registrationCounts(rows), ready = !settings.error && !entries.error;
  return <section className="form-card event-registrations-panel">
    <div className="form-heading"><h2>Inschrijvingen</h2>{canManage && ready && <Link className="row-action" href="?tab=inschrijvingen&inschrijving=instellingen">Instellingen</Link>}</div>
    {!ready ? <p className="error-note" role="alert">Inschrijvingen konden niet worden geladen. Controleer de inrichting en probeer opnieuw.</p> : <>
      <p>{config ? registrationModes[config.mode as keyof typeof registrationModes] : "Werkwijze nog niet gekozen."}{config?.capacity ? ` · Capaciteit: ${config.capacity}` : ""}</p>
      {config?.notes && <p className="event-practical-notes">{config.notes}</p>}
      {(config?.mode === "external" ? config.external_url : !config ? legacyUrl : null) && <a className="row-action" href={config?.external_url || legacyUrl} target="_blank" rel="noreferrer">{config ? "Inschrijfpagina openen" : "Bestaande Eventbrite-link openen"}</a>}
      {config?.mode === "external" && <p className="form-hint">Deelnemers en beschikbare plaatsen worden op de externe pagina beheerd; er is geen automatische import.</p>}
      {canManage && (config?.mode === "internal" || rows.length > 0) && <>
        <div className="event-tab-actions">{config?.mode === "internal" && <Link href="?tab=inschrijvingen&inschrijving=nieuw">Deelnemer toevoegen</Link>}<span>{counts.reserved} plaatsen ingeschreven · {counts.waiting} wachtlijst · {counts.attended} aanwezig</span></div>
        {config?.capacity && counts.reserved > config.capacity && <p className="error-note">De inschrijvingen overschrijden de geplande capaciteit met {counts.reserved - config.capacity} plaatsen.</p>}
        {config?.mode !== "internal" && <p className="form-hint">Eerder geregistreerde deelnemers blijven bewaard. Kies Eigen deelnemerslijst om opnieuw deelnemers toe te voegen.</p>}
        <div className="event-registration-list">{rows.map(row => <article key={row.id}><div><strong>{row.name}</strong>{row.notes && <details><summary>Afspraken</summary><p>{row.notes}</p></details>}</div><span>{row.quantity} {row.quantity === 1 ? "plaats" : "plaatsen"}</span><span>{registrationStatuses[row.status]}</span><Link className="row-action" href={`?tab=inschrijvingen&inschrijving=${row.id}`}>Bewerken</Link></article>)}</div>
        {!rows.length && <p className="empty-inline">Nog geen deelnemers geregistreerd.</p>}
      </>}
      {!canManage && config?.mode === "internal" && <p className="form-hint">De deelnemerslijst wordt beheerd door de eventverantwoordelijken.</p>}
      {selected && !["nieuw", "instellingen"].includes(selected) && !current && canManage && <p className="error-note">Deze inschrijving is niet meer beschikbaar.</p>}
    </>}
    {canManage && ready && selected === "instellingen" && <FormModal title="Inschrijvingen instellen" closeHref="?tab=inschrijvingen"><form action={saveRegistrationSettings}>
      <input type="hidden" name="event_id" value={eventId}/><label>Werkwijze<select name="mode" required defaultValue={config?.mode || ""}><option value="" disabled>Kies een werkwijze</option>{Object.entries(registrationModes).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <div className="form-row"><label>Capaciteit (optioneel)<input name="capacity" type="number" min="1" max="100000" defaultValue={config?.capacity ?? ""}/></label><label>Externe inschrijflink<input name="external_url" type="url" defaultValue={config?.external_url || legacyUrl || ""}/></label></div><p className="form-hint">Capaciteit is een planningwaarde, geen automatische reserveringslimiet. Een externe werkwijze vereist een link.</p>
      <label>Afspraken<textarea name="notes" maxLength={4000} rows={3} defaultValue={config?.notes || ""}/></label><div className="form-actions"><button className="primary">Opslaan</button></div></form></FormModal>}
    {canManage && ready && (current || (selected === "nieuw" && config?.mode === "internal")) && <FormModal title={current ? "Inschrijving bewerken" : "Deelnemer toevoegen"} closeHref="?tab=inschrijvingen"><form action={saveEventRegistration}>
      <input type="hidden" name="event_id" value={eventId}/>{current && <input type="hidden" name="id" value={current.id}/>}
      <label>Naam of groepsnaam<input name="name" required minLength={2} maxLength={180} defaultValue={current?.name || ""}/></label><div className="form-row"><label>Plaatsen<input name="quantity" required type="number" min="1" max="1000" defaultValue={current?.quantity ?? 1}/></label><label>Status<select name="status" defaultValue={current?.status || "registered"}>{Object.entries(registrationStatuses).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label></div>
      <label>Afspraken<textarea name="notes" maxLength={4000} rows={3} defaultValue={current?.notes || ""}/></label><div className="form-actions"><button className="primary">Opslaan</button></div></form>
      {current && <form className="modal-danger-zone" action={deleteEventRegistration}><input type="hidden" name="event_id" value={eventId}/><input type="hidden" name="id" value={current.id}/><ConfirmSubmitButton className="danger-button" message="Deze inschrijving definitief uit de eventlijst verwijderen?">Verwijderen</ConfirmSubmitButton></form>}
    </FormModal>}
  </section>;
}
