import { saveMeeting } from "@/app/app/vergaderingen/actions";

type Data = { id?: string; [key: string]: unknown };

export function MeetingForm({ record = {} }: { record?: Data }) {
  return (
    <form action={saveMeeting}>
      {record.id && <input type="hidden" name="id" value={record.id}/>}
      <label>Titel<input name="title" required defaultValue={String(record.title ?? "")}/></label>
      <div className="form-row">
        <label>Type
          <select name="meeting_type" defaultValue={String(record.meeting_type ?? "board")}>
            <option value="board">Bestuursvergadering</option>
            <option value="general_assembly">Algemene vergadering</option>
            <option value="workgroup">Werkgroep</option>
            <option value="project">Projectoverleg</option>
            <option value="partner">Partneroverleg</option>
            <option value="other">Overige</option>
          </select>
        </label>
        <label>Status
          <select name="status" defaultValue={String(record.status ?? "planned")}>
            <option value="planned">Gepland</option>
            <option value="confirmed">Bevestigd</option>
            <option value="completed">Afgerond</option>
            <option value="cancelled">Geannuleerd</option>
            <option value="archived">Gearchiveerd</option>
          </select>
        </label>
        <label>Starttijd<input type="datetime-local" name="meeting_at" defaultValue={String(record.meeting_at ?? "").slice(0, 16)}/></label>
        <label>Eindtijd<input type="datetime-local" name="ends_at" defaultValue={String(record.ends_at ?? "").slice(0, 16)}/></label>
        <label>Deelnemers (komma gescheiden)<input name="attendees" defaultValue={Array.isArray(record.attendees) ? record.attendees.join(", ") : ""}/></label>
      </div>
      <label>Notities / verslag<textarea name="notes" rows={6} defaultValue={String(record.notes ?? "")}/></label>
      <label>Besluiten<textarea name="decisions" rows={5} defaultValue={String(record.decisions ?? "")}/></label>
      <label>Actiepunten uit het verslag<textarea name="action_points" rows={5} defaultValue={String(record.action_points ?? "")}/></label>
      <label>Link naar notulen in Google Drive<input type="url" name="minutes_url" defaultValue={String(record.minutes_url ?? "")}/></label>
      <div className="form-actions"><button className="primary">Opslaan</button></div>
    </form>
  );
}
