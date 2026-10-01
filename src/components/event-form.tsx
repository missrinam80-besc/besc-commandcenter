import { MarkdownField } from "@/components/markdown-field";
import { formatDateTimeLocal } from "@/lib/format";

const types = { community: "Community-event", workshop: "Workshop", livestream: "Livestream", podcast: "Podcast", lan: "LAN", meetup: "Meetup", tournament: "Toernooi", partner: "Partnerevent", charity: "Charity", other: "Overige" };
const statuses = { idea: "Idee", planning: "Planning", confirmed: "Bevestigd", production: "Productie", live: "Live", aftercare: "Nazorg", completed: "Afgerond", cancelled: "Geannuleerd", archived: "Gearchiveerd" };
export { types as eventTypes, statuses as eventStatuses };

export function EventForm({ action, event = {}, projects = [] }: {
  action: (formData: FormData) => void | Promise<void>;
  event?: Record<string, unknown>;
  projects?: { id: string; title: string }[];
}) {
  const value = (key: string) => (event[key] as string | null) ?? "";
  return <form action={action}>
    {value("id") && <input type="hidden" name="id" value={value("id")}/>} 
    {value("drive_url") && <input type="hidden" name="drive_url" value={value("drive_url")}/>} 
    <label>Naam<input name="title" defaultValue={value("title")}/></label>
    <MarkdownField label="Beschrijving" name="description" rows={5} defaultValue={value("description")}/>
    <div className="form-row">
      <label>Type<select name="event_type" defaultValue={value("event_type") || "community"}>{Object.entries(types).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={value("status") || "idea"}>{Object.entries(statuses).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label>Bij annulering in Google Calendar<select name="cancelled_calendar_action" defaultValue={event.calendar_removed ? "remove" : "keep"}><option value="keep">Zichtbaar als geannuleerd</option><option value="remove">Afspraak verwijderen</option></select></label>
      <label>Start<input type="datetime-local" name="start_at" defaultValue={formatDateTimeLocal(value("start_at"))}/></label>
      <label>Einde<input type="datetime-local" name="end_at" defaultValue={formatDateTimeLocal(value("end_at"))}/></label>
      <label>Project<select name="project_id" defaultValue={value("project_id")}><option value="">Geen project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label>
      <label>Prioriteit<select name="priority" defaultValue={value("priority") || "normal"}><option value="low">Laag</option><option value="normal">Normaal</option><option value="high">Hoog</option><option value="urgent">Urgent</option></select></label>
      <label>Rol BESC<select name="role_besc" defaultValue={value("role_besc") || "organizer"}><option value="organizer">Organisator</option><option value="partner">Partner</option><option value="promoter">Promotor</option><option value="participant">Deelnemer</option></select></label>
      <label>Verwachte deelnemers<input type="number" min="0" name="expected_attendees" defaultValue={value("expected_attendees")}/></label>
    </div>
    <p className="form-hint">Deze keuze wordt alleen toegepast wanneer je de status op Geannuleerd zet. De BESC-historiek blijft altijd bewaard.</p>
    <label className="online-check"><input type="checkbox" name="is_online" defaultChecked={Boolean(event.is_online)}/>Online event</label>
    <label>Locatie<input name="location" defaultValue={value("location")}/></label>
    <label>Eventbrite<input type="url" name="eventbrite_url" defaultValue={value("eventbrite_url")}/></label>
    <label>Streamlink<input type="url" name="stream_url" defaultValue={value("stream_url")}/></label>
    <div className="form-actions"><button className="primary">Opslaan</button></div>
  </form>;
}
