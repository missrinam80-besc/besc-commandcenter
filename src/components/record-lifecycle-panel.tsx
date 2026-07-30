import { Archive, Trash2 } from "lucide-react";
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
    <section className="form-card lifecycle-panel">
      <div className="form-heading">
        <div>
          <span className="eyebrow">DOSSIERBEHEER</span>
          <h2>Archiveren of verwijderen</h2>
        </div>
      </div>
      <div className="lifecycle-actions">
        <div>
          <Archive size={20}/>
          <div>
            <strong>{isArchived ? "Dit dossier is gearchiveerd" : `${label} archiveren`}</strong>
            <p>Een archiefitem blijft bewaard, vindbaar via de statusfilters en kan later opnieuw worden geactiveerd.</p>
          </div>
          {!isArchived && (
            <form action={changeRecordLifecycle}>
              <input type="hidden" name="entity" value={entity}/>
              <input type="hidden" name="id" value={id}/>
              <input type="hidden" name="action" value="archive"/>
              <button className="archive-action">Archiveren</button>
            </form>
          )}
        </div>
        <div className="lifecycle-danger">
          <Trash2 size={20}/>
          <div>
            <strong>{label} verwijderen</strong>
            <p>Het item verdwijnt uit de werkweergaven. Historiek, koppelingen en externe Google-bestanden blijven veilig bewaard.</p>
          </div>
          <form action={changeRecordLifecycle}>
            <input type="hidden" name="entity" value={entity}/>
            <input type="hidden" name="id" value={id}/>
            <input type="hidden" name="action" value="delete"/>
            <label>
              Typ <b>VERWIJDER</b>
              <input name="confirmation" autoComplete="off" required pattern="VERWIJDER"/>
            </label>
            <button className="danger-button">Verwijderen</button>
          </form>
        </div>
      </div>
    </section>
  );
}

