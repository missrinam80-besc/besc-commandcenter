import { saveEventSchedule } from "@/app/app/events/[id]/schedule-actions";
import { scheduleKinds, scheduleStatuses, type EventScheduleItem } from "@/lib/event-schedule";
import { formatDateTimeLocal } from "@/lib/format";
import { SearchablePersonPicker } from "@/components/searchable-person-picker";

export function EventScheduleForm({ eventId, record, people, kinds=scheduleKinds }: {
  eventId: string; record?: EventScheduleItem; people: { id: string; label: string }[]; kinds?:Record<string,string>;
}) {
  const options = record?.person_id && !people.some(person => person.id === record.person_id)
    ? [...people, { id: record.person_id, label: "Eerder toegewezen persoon (niet meer beschikbaar)" }] : people;
  return <form action={saveEventSchedule}>
    <input type="hidden" name="event_id" value={eventId}/>
    {record && <input type="hidden" name="id" value={record.id}/>}
    <label>Titel<input name="title" required minLength={2} maxLength={180} defaultValue={record?.title ?? ""}/></label>
    <div className="form-row">
      <label>Onderdeel<select name="kind" required defaultValue={record?.kind ?? "program"}>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={record?.status ?? "draft"}>{Object.entries(scheduleStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <div className="form-row">
      <label>Start<input type="datetime-local" name="starts_at" defaultValue={formatDateTimeLocal(record?.starts_at)}/></label>
      <label>Einde<input type="datetime-local" name="ends_at" defaultValue={formatDateTimeLocal(record?.ends_at)}/></label>
    </div>
    <p className="form-hint">Tijden in België. Onbekende tijden mogen leeg blijven. Voor een eindtijd is een starttijd nodig.</p>
    <SearchablePersonPicker options={options} defaultValue={record?.person_id ?? ""} required={false}/>
    <label>Locatie / streamkanaal<input name="location" maxLength={300} defaultValue={record?.location ?? ""}/></label>
    <label>Praktische afspraken / draaiboek<textarea name="notes" rows={4} maxLength={4000} defaultValue={record?.notes ?? ""}/></label>
    <div className="form-actions"><button className="primary">Opslaan</button></div>
  </form>;
}
