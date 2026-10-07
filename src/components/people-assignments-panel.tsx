import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createPersonAssignment, deletePersonAssignment, updatePersonAssignment } from "@/app/app/assignment-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { FormModal } from "@/components/form-modal";
import { MarkdownField } from "@/components/markdown-field";
import { SearchablePersonPicker, type PersonPickerOption } from "@/components/searchable-person-picker";
import { formatDateTime, formatDateTimeLocal } from "@/lib/format";

type Assignment = {
  id: string; person_id: string; role_name: string; status: string; starts_at: string | null; notes: string | null;
  community_people: { display_name: string } | null;
};

const statusLabels: Record<string, string> = { planned: "Gepland", confirmed: "Bevestigd", completed: "Afgerond", cancelled: "Geannuleerd" };

export function PeopleAssignmentsPanel({ entityType, entityId, assignments, people, canManage, selected, peopleError = false, closeHref = "?" }: {
  entityType: "project" | "event";
  entityId: string;
  assignments: Assignment[];
  people: PersonPickerOption[];
  canManage: boolean;
  selected?: string;
  peopleError?: boolean;
  closeHref?: string;
}) {
  const queryPrefix = closeHref === "?" ? "?" : `${closeHref}&`;
  const basePath = entityType === "project" ? `/app/projecten/${entityId}` : `/app/events/${entityId}`;
  const current = assignments.find((item) => item.id === selected);
  const form = (assignment?: Assignment) => <form action={assignment ? updatePersonAssignment : createPersonAssignment}>
    <input type="hidden" name="entity_type" value={entityType}/><input type="hidden" name="entity_id" value={entityId}/><input type="hidden" name="return_to" value={basePath}/>
    {assignment ? <><input type="hidden" name="id" value={assignment.id}/><input type="hidden" name="person_id" value={assignment.person_id}/><p className="form-help">Persoon: <strong>{assignment.community_people?.display_name || "Onbekende persoon"}</strong></p></> : peopleError ? <p className="error-note" role="alert">De personenlijst kon niet worden geladen. Sluit dit venster en probeer opnieuw.</p> : <SearchablePersonPicker options={people}/>}
    <div className="form-row"><label>Rol of verantwoordelijkheid<input name="role_name" defaultValue={assignment?.role_name ?? ""}/></label><label>Status<select name="status" defaultValue={assignment?.status ?? "planned"}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Startmoment<input type="datetime-local" name="starts_at" defaultValue={formatDateTimeLocal(assignment?.starts_at)}/></label></div>
    <MarkdownField label="Notities" name="notes" rows={4} defaultValue={assignment?.notes}/><div className="form-actions"><button className="primary" disabled={!assignment && peopleError}>Opslaan</button></div>
  </form>;

  return <section className="form-card relation-wide">
    <div className="form-heading"><div><span className="eyebrow">MENSEN</span><h2>Betrokkenen en rollen</h2></div>{canManage && <Link className="row-action" href={`${queryPrefix}betrokkene=nieuw`}><Plus size={14}/>Toevoegen</Link>}</div>
    <div className="relation-list">{assignments.map((assignment) => <article key={assignment.id}><div><Link href={`/app/community/${assignment.person_id}`}>{assignment.community_people?.display_name || "Onbekende persoon"}</Link><span>{assignment.role_name} · {statusLabels[assignment.status] ?? assignment.status}{assignment.starts_at ? ` · ${formatDateTime(assignment.starts_at)}` : ""}</span></div>{canManage && <Link className="row-action" aria-label={`${assignment.role_name} bewerken`} href={`${queryPrefix}betrokkene=${assignment.id}`}><Pencil size={14}/></Link>}</article>)}{!assignments.length && <div className="empty">Nog geen personen aan dit dossier gekoppeld.</div>}</div>
    {selected === "nieuw" && canManage ? <FormModal closeHref={closeHref} title="Persoon koppelen">{form()}</FormModal> : null}
    {current && canManage ? <FormModal closeHref={closeHref} title="Betrokkene bewerken">{form(current)}<form className="modal-danger-zone" action={deletePersonAssignment}><input type="hidden" name="id" value={current.id}/><input type="hidden" name="entity_type" value={entityType}/><input type="hidden" name="entity_id" value={entityId}/><input type="hidden" name="return_to" value={basePath}/><ConfirmSubmitButton className="danger-button" message="Deze persoon uit dit dossier verwijderen?"><Trash2 size={14}/>Koppeling verwijderen</ConfirmSubmitButton></form></FormModal> : null}
  </section>;
}
