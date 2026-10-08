import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { requireActiveMembership } from "@/lib/auth-context";
import { hasPermission } from "@/lib/permissions";
import { giveawaySources, giveawayStatuses, giveawayRemaining, type EventGiveaway } from "@/lib/event-giveaways";
import { EventGiveawayForm } from "@/components/event-giveaway-form";
import { FormModal } from "@/components/form-modal";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { deleteEventGiveaway } from "@/app/app/events/[id]/giveaway-actions";
import type { PersonPickerOption } from "@/lib/person-picker";

export async function EventGiveawaysPanel({ eventId, selected, people, peopleError = false }: {
  eventId: string; selected?: string; people: PersonPickerOption[]; peopleError?: boolean;
}) {
  const { supabase, membership } = await requireActiveMembership();
  const result = await supabase.from("event_giveaways").select("id,name,quantity_planned,quantity_received,quantity_distributed,source,provider,responsible_person_id,status,notes")
    .eq("organization_id", membership.organization_id).eq("event_id", eventId).order("created_at");
  const rows = (result.data ?? []) as EventGiveaway[];
  const current = rows.find(row => row.id === selected);
  const canEdit = hasPermission(membership, "manageEvents") && !result.error && !peopleError;
  return <section className="form-card event-giveaways-panel">
    <div className="form-heading"><div><span className="eyebrow">ITEMS EN UITDELING</span><h2>Giveaway-items</h2></div>
      {canEdit && <Link className="row-action" href="?tab=giveaways&giveaway=nieuw"><Plus size={14}/>Item toevoegen</Link>}
    </div>
    {result.error ? <p className="error-note" role="alert">De giveawaylijst kon niet worden geladen. Probeer opnieuw; controleer bij ingebruikname of de inrichting is afgerond.</p> : <>
      {peopleError && <p className="error-note" role="alert">De personenlijst kon niet worden geladen. Je kunt de items bekijken; wijzigen is tijdelijk niet beschikbaar.</p>}
      <div className="event-giveaway-list">{rows.map(row => <article key={row.id}>
        <div className="event-giveaway-info"><strong>{row.name}</strong><span>{giveawaySources[row.source]}{row.provider ? ` · ${row.provider}` : ""}</span><span>{people.find(person => person.id === row.responsible_person_id)?.label || (row.responsible_person_id ? "Eerder toegewezen persoon" : "Nog geen verantwoordelijke")}</span>
          {row.notes && <details><summary>Uitdeelafspraken</summary><p>{row.notes}</p></details>}
        </div>
        <dl className="event-giveaway-counts"><div><dt>Gepland</dt><dd>{row.quantity_planned}</dd></div><div><dt>Ontvangen</dt><dd>{row.quantity_received ?? "Onbekend"}</dd></div><div><dt>Uitgedeeld</dt><dd>{row.quantity_distributed ?? "Onbekend"}</dd></div><div><dt>Over</dt><dd>{giveawayRemaining(row) ?? "Onbekend"}</dd></div></dl>
        <span className="event-material-status">{giveawayStatuses[row.status]}</span>
        {canEdit && <Link className="row-action" aria-label={`${row.name} bewerken`} href={`?tab=giveaways&giveaway=${row.id}`}><Pencil size={14}/></Link>}
      </article>)}</div>
      {!rows.length && <p className="empty-inline">Nog geen giveaway-items toegevoegd.</p>}
      {selected && selected !== "nieuw" && !current && <p className="error-note">Dit item staat niet meer op de giveawaylijst.</p>}
    </>}
    {canEdit && (selected === "nieuw" || current) && <FormModal title={current ? "Giveaway-item bewerken" : "Giveaway-item toevoegen"} closeHref="?tab=giveaways">
      <EventGiveawayForm eventId={eventId} record={current} people={people}/>
      {current && <form className="modal-danger-zone" action={deleteEventGiveaway}><input type="hidden" name="event_id" value={eventId}/><input type="hidden" name="id" value={current.id}/><ConfirmSubmitButton className="danger-button" message="Dit item en de geregistreerde uitdeelaantallen uit de eventlijst verwijderen? Er wordt geen voorraad of financieel dossier gewijzigd."><Trash2 size={14}/>Item verwijderen</ConfirmSubmitButton></form>}
    </FormModal>}
  </section>;
}
