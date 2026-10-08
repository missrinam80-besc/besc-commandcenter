import { saveEventGiveaway } from "@/app/app/events/[id]/giveaway-actions";
import { giveawaySources, giveawayStatuses, type EventGiveaway } from "@/lib/event-giveaways";
import { SearchablePersonPicker, type PersonPickerOption } from "@/components/searchable-person-picker";

export function EventGiveawayForm({ eventId, record, people }: {
  eventId: string; record?: EventGiveaway; people: PersonPickerOption[];
}) {
  const options = record?.responsible_person_id && !people.some(person => person.id === record.responsible_person_id)
    ? [...people, { id: record.responsible_person_id, label: "Eerder toegewezen persoon (niet meer beschikbaar)" }] : people;
  return <form action={saveEventGiveaway}>
    <input type="hidden" name="event_id" value={eventId}/>
    {record && <input type="hidden" name="id" value={record.id}/>}
    <label>Item<input name="name" required minLength={2} maxLength={180} defaultValue={record?.name ?? ""}/></label>
    <div className="form-row">
      <label>Gepland aantal<input name="quantity_planned" type="number" required min={1} max={100000} step={1} defaultValue={record?.quantity_planned ?? 1}/></label>
      <label>Ontvangen aantal<input name="quantity_received" type="number" min={0} max={100000} step={1} placeholder="Onbekend" defaultValue={record?.quantity_received ?? ""}/></label>
      <label>Uitgedeeld aantal<input name="quantity_distributed" type="number" min={0} max={100000} step={1} placeholder="Onbekend" defaultValue={record?.quantity_distributed ?? ""}/></label>
    </div>
    <p className="form-hint">Laat onbekende aantallen leeg. Vul 0 in als bevestigd is dat niets ontvangen of uitgedeeld is. Uitgedeeld mag niet hoger zijn dan ontvangen.</p>
    <div className="form-row">
      <label>Herkomst<select name="source" defaultValue={record?.source ?? "own"}>{Object.entries(giveawaySources).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Sponsor / leverancier<input name="provider" maxLength={300} defaultValue={record?.provider ?? ""}/></label>
      <label>Opvolging<select name="status" defaultValue={record?.status ?? "needed"}>{Object.entries(giveawayStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <SearchablePersonPicker options={options} defaultValue={record?.responsible_person_id ?? ""} required={false}/>
    <label>Uitdeelafspraken / voorwaarden<textarea name="notes" rows={4} maxLength={4000} defaultValue={record?.notes ?? ""}/></label>
    <div className="form-actions"><button className="primary">Opslaan</button></div>
  </form>;
}
