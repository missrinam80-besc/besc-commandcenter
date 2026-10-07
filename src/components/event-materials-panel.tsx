import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { requireActiveMembership } from "@/lib/auth-context";
import { hasPermission } from "@/lib/permissions";
import { materialSources, materialStatuses, type EventMaterial } from "@/lib/event-materials";
import { formatDateTime } from "@/lib/format";
import { EventMaterialForm, type MaterialAssetOption } from "@/components/event-material-form";
import { FormModal } from "@/components/form-modal";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { deleteEventMaterial } from "@/app/app/events/[id]/material-actions";

export async function EventMaterialsPanel({ eventId, selected, people, peopleError = false }: {
  eventId: string; selected?: string; people: { id: string; label: string }[]; peopleError?: boolean;
}) {
  const { supabase, membership } = await requireActiveMembership();
  const canManage = hasPermission(membership, "manageEvents");
  const [itemsResult, assetsResult] = await Promise.all([
    supabase.from("event_materials").select("id,asset_id,name,quantity,source,provider,responsible_person_id,location,pickup_at,return_at,status,notes").eq("organization_id", membership.organization_id).eq("event_id", eventId).order("created_at"),
    supabase.from("assets").select("id,name,status,location").eq("organization_id", membership.organization_id).is("deleted_at", null).neq("status", "archived").order("name"),
  ]);
  const rows = (itemsResult.data ?? []) as EventMaterial[];
  const assets = (assetsResult.data ?? []) as MaterialAssetOption[];
  const current = rows.find(row => row.id === selected);
  const canEdit = canManage && !itemsResult.error && !assetsResult.error && !peopleError;
  return <section className="form-card event-materials-panel">
    <div className="form-heading"><div><span className="eyebrow">EVENTBENODIGDHEDEN</span><h2>Materialenlijst</h2></div><div className="event-tab-actions">
      <Link className="row-action" href="/app/materialen">Materialenregister</Link>
      {canEdit && <Link className="row-action" href="?tab=materialen&materiaal=nieuw"><Plus size={14}/>Materiaal toevoegen</Link>}
    </div></div>
    {itemsResult.error ? <p className="error-note" role="alert">De materialenlijst kon niet worden geladen. Probeer opnieuw. Als dit onderdeel nog niet is geactiveerd, moet de inrichting eerst worden afgerond.</p> : <>
      {(assetsResult.error || peopleError) && <p className="error-note" role="alert">Het register of de personenlijst kon niet worden geladen. Je kunt de eventlijst bekijken; probeer opnieuw om wijzigingen te doen.</p>}
      <div className="event-material-list">
        {rows.map(row => {
          const asset = assets.find(item => item.id === row.asset_id);
          const responsible = people.find(person => person.id === row.responsible_person_id);
          return <article key={row.id}>
            <div className="event-material-main"><strong>{row.quantity} × {asset?.name || row.name}</strong>
              <span>{materialSources[row.source]}{row.provider ? ` · ${row.provider}` : ""}</span>
              {asset && <Link href={`/app/materialen?bewerken=${asset.id}`}>Registeritem bekijken</Link>}
            </div>
            <div className="event-material-logistics"><span>{responsible?.label || (row.responsible_person_id ? "Eerder toegewezen persoon" : "Nog geen verantwoordelijke")}</span>
              {row.location && <span>{row.location}</span>}
              <span>Ophalen: {formatDateTime(row.pickup_at, "Niet gepland")}</span>
              <span>Retour: {formatDateTime(row.return_at, "Niet gepland")}</span>
              {row.notes && <p>{row.notes}</p>}
            </div>
            <span className="event-material-status">{materialStatuses[row.status]}</span>
            {canEdit && <Link className="row-action" aria-label={`${row.name} bewerken`} href={`?tab=materialen&materiaal=${row.id}`}><Pencil size={14}/></Link>}
          </article>;
        })}
        {!rows.length && <p className="empty-inline">Nog geen materialen aan dit event toegevoegd.</p>}
      </div>
      {selected && selected !== "nieuw" && !current && <p className="error-note">Dit materiaal staat niet meer op de eventlijst.</p>}
    </>}
    {canEdit && (selected === "nieuw" || current) && <FormModal title={current ? "Eventmateriaal bewerken" : "Materiaal aan event toevoegen"} closeHref="?tab=materialen">
      <EventMaterialForm eventId={eventId} record={current} assets={assets} people={people}/>
      {current && <form className="modal-danger-zone" action={deleteEventMaterial}><input type="hidden" name="event_id" value={eventId}/><input type="hidden" name="id" value={current.id}/><ConfirmSubmitButton className="danger-button" message="Dit item van de eventlijst verwijderen? Het materiaal blijft in het centrale register bewaard."><Trash2 size={14}/>Van eventlijst verwijderen</ConfirmSubmitButton></form>}
    </FormModal>}
  </section>;
}
