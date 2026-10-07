import { EventTimeGrid } from "@/components/event-timegrid";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { requireActiveMembership } from "@/lib/auth-context";
import { hasPermission } from "@/lib/permissions";
import { scheduleKinds, scheduleConflicts, type EventScheduleItem } from "@/lib/event-schedule";
import { EventScheduleForm } from "@/components/event-schedule-form";
import { FormModal } from "@/components/form-modal";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { deleteEventSchedule } from "@/app/app/events/[id]/schedule-actions";

export async function EventSchedulePanel({ eventId, selected, people, peopleError = false, kind }: {
  eventId: string; selected?: string; people: { id: string; label: string }[]; peopleError?: boolean; kind?: string;
}) {
  const { supabase, membership } = await requireActiveMembership();
  const result = await supabase.from("event_schedule_items").select("id,title,kind,status,starts_at,ends_at,person_id,location,notes")
    .eq("organization_id", membership.organization_id).eq("event_id", eventId).order("starts_at", { ascending: true, nullsFirst: false }).order("created_at");
  const rows = (result.data ?? []) as EventScheduleItem[];
  const current = rows.find(row => row.id === selected);
  const conflicts = scheduleConflicts(rows);
  const filter = kind && Object.hasOwn(scheduleKinds, kind) ? kind : "";
  const visible = filter ? rows.filter(row => row.kind === filter) : rows;
  const canEdit = hasPermission(membership, "manageEvents") && !result.error && !peopleError;
  return <section className="form-card event-schedule-panel">
    <div className="form-heading"><div><span className="eyebrow">PROGRAMMA EN INZET</span><h2>Eventagenda</h2></div>
      {canEdit && <Link className="row-action" href="?tab=planning&schema=nieuw"><Plus size={14}/>Onderdeel toevoegen</Link>}
    </div>
    <nav className="event-schedule-filters" aria-label="Schema filteren">
      <Link href="?tab=planning" scroll={false} aria-current={!filter ? "page" : undefined}>Alles</Link>
      {Object.entries(scheduleKinds).map(([value, label]) => <Link key={value} data-kind={value} href={`?tab=planning&schema_type=${value}`} scroll={false} aria-current={filter === value ? "page" : undefined}><span className="event-agenda-dot" aria-hidden="true"/>{label}</Link>)}
    </nav>
    {result.error ? <p className="error-note" role="alert">Het schema kon niet worden geladen. Probeer opnieuw; controleer bij ingebruikname of de inrichting is afgerond.</p> : <>
      {peopleError && <p className="error-note" role="alert">De personenlijst kon niet worden geladen. Wijzigen is tijdelijk niet beschikbaar.</p>}
      {conflicts.size > 0 && <p className="error-note" role="status">Er zijn overlappende toewijzingen in dit event. Controleer de gemarkeerde onderdelen.</p>}
      {visible.length > 0 && <EventTimeGrid rows={visible} people={people} canEdit={canEdit} conflictIds={[...conflicts]}/>}
      {!visible.length && <p className="empty-inline">{rows.length ? "Geen onderdelen voor dit filter." : "Nog geen schema of shifts toegevoegd."}</p>}
      {selected && selected !== "nieuw" && !current && <p className="error-note">Dit onderdeel staat niet meer in het schema.</p>}
    </>}
    {canEdit && (selected === "nieuw" || current) && <FormModal title={current ? "Schemaonderdeel bewerken" : "Schemaonderdeel toevoegen"} closeHref="?tab=planning">
      <EventScheduleForm eventId={eventId} record={current} people={people}/>
      {current && <form className="modal-danger-zone" action={deleteEventSchedule}><input type="hidden" name="event_id" value={eventId}/><input type="hidden" name="id" value={current.id}/><ConfirmSubmitButton className="danger-button" message="Dit onderdeel uit het eventschema verwijderen? De persoon en bestaande dossierrollen blijven behouden."><Trash2 size={14}/>Onderdeel verwijderen</ConfirmSubmitButton></form>}
    </FormModal>}
  </section>;
}
