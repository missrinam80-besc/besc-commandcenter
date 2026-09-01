import { Archive, ChevronDown, Trash2 } from "lucide-react";
import { changeRecordLifecycle } from "@/app/app/lifecycle-actions";
import type { LifecycleEntity } from "@/lib/record-lifecycle";

export function RecordLifecyclePanel({
  entity,
  id,
  label,
  isArchived = false,
  canManage = true,
}: {
  entity: LifecycleEntity;
  id: string;
  label: string;
  isArchived?: boolean;
  canManage?: boolean;
}) {
  if (!canManage) return null;

  return (
    <section className="form-card lifecycle-panel lifecycle-panel-compact">
      <div className="lifecycle-compact">
        <div>
          <span className="eyebrow">DOSSIERBEHEER</span>
          <h2>{isArchived ? `${label} is gearchiveerd` : `${label} beheren`}</h2>
        </div>
        <div className="lifecycle-compact-actions">
          {!isArchived ? (
            <form action={changeRecordLifecycle}>
              <input type="hidden" name="entity" value={entity}/>
              <input type="hidden" name="id" value={id}/>
              <input type="hidden" name="action" value="archive"/>
              <button className="archive-action"><Archive size={15}/>Archiveren</button>
            </form>
          ) : (
            <span className="lifecycle-state"><Archive size={15}/>Bewaard in archief</span>
          )}
          <details className="lifecycle-delete">
            <summary><Trash2 size={15}/>Verwijderen<ChevronDown size={14}/></summary>
            <form action={changeRecordLifecycle}>
              <p>Het dossier verdwijnt uit de werkweergaven. Google-bestanden blijven bewaard.</p>
              <input type="hidden" name="entity" value={entity}/>
              <input type="hidden" name="id" value={id}/>
              <input type="hidden" name="action" value="delete"/>
              <label>
                Typ <b>VERWIJDER</b>
                <input name="confirmation" autoComplete="off" required pattern="VERWIJDER"/>
              </label>
              <button className="danger-button">Definitief uit werkweergaven verwijderen</button>
            </form>
          </details>
        </div>
      </div>
    </section>
  );
}
