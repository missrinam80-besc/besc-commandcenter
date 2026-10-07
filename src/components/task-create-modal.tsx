import Link from "next/link";
import { createTask } from "@/app/app/actions";
import { FormModal } from "@/components/form-modal";
import { MarkdownField } from "@/components/markdown-field";
import type { DossierEntityType } from "@/lib/dossier-relations";

export function TaskCreateModal({ returnTo, projects, people, defaultProjectId, contextEntityType, contextEntityId, closeHref = "?" }: {
  returnTo: string;
  closeHref?: string;
  projects: { id: string; title: string }[];
  people: { id: string; label: string }[];
  defaultProjectId?: string | null;
  contextEntityType?: DossierEntityType;
  contextEntityId?: string;
}) {
  return <FormModal title="Nieuwe taak" closeHref={closeHref}>
    <form action={createTask}>
      <input type="hidden" name="return_to" value={returnTo}/>
      {contextEntityType ? <input type="hidden" name="context_entity_type" value={contextEntityType}/> : null}
      {contextEntityId ? <input type="hidden" name="context_entity_id" value={contextEntityId}/> : null}
      <label>Titel<input name="title"/></label>
      <MarkdownField name="description" label="Beschrijving" rows={4}/>
      <div className="form-row">
        <label>Project<select name="project_id" defaultValue={defaultProjectId ?? ""}><option value="">Geen project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
        <label>Verantwoordelijke<select name="assignee_id" defaultValue=""><option value="">Niet toegewezen</option>{people.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}</select></label>
        <label>Deadline<input type="datetime-local" name="due_at"/></label>
        <label>Prioriteit<select name="priority" defaultValue="normal"><option value="low">Laag</option><option value="normal">Normaal</option><option value="high">Hoog</option><option value="urgent">Urgent</option></select></label>
      </div>
      <label>Checklist (één punt per regel)<textarea name="checklist" rows={4}/></label>
      <div className="form-actions"><Link href={closeHref}>Annuleren</Link><button className="primary">Taak opslaan</button></div>
    </form>
  </FormModal>;
}
