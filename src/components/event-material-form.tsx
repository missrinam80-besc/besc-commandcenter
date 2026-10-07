"use client";

import { useState } from "react";
import { saveEventMaterial } from "@/app/app/events/[id]/material-actions";
import { materialSources, materialStatuses, type EventMaterial } from "@/lib/event-materials";
import { formatDateTimeLocal } from "@/lib/format";

export type MaterialAssetOption = { id: string; name: string; status: string; location: string | null };
export function EventMaterialForm({ eventId, record, assets, people }: {
  eventId: string; record?: EventMaterial; assets: MaterialAssetOption[]; people: { id: string; label: string }[];
}) {
  const [assetId, setAssetId] = useState(record?.asset_id ?? "");
  return <form action={saveEventMaterial}>
    <input type="hidden" name="event_id" value={eventId}/>
    {record && <input type="hidden" name="id" value={record.id}/>}
    <label>Item uit het materialenregister<select name="asset_id" value={assetId} onChange={event => setAssetId(event.target.value)}>
      <option value="">Ander materiaal — zelf omschrijven</option>
      {record?.asset_id && !assets.some(asset => asset.id === record.asset_id) && <option value={record.asset_id}>{record.name} (niet meer beschikbaar in het register)</option>}
      {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}{asset.location ? ` · ${asset.location}` : ""}</option>)}
    </select></label>
    {assetId ? <input type="hidden" name="name" value=""/> : <label>Naam van het materiaal<input name="name" required minLength={2} maxLength={180} defaultValue={record?.name ?? ""}/></label>}
    <div className="form-row">
      <label>Aantal<input name="quantity" type="number" required min={1} max={100000} step={1} defaultValue={record?.quantity ?? 1}/></label>
      <label>Herkomst<select name="source" defaultValue={record?.source ?? "own"}>{Object.entries(materialSources).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Opvolging<select name="status" defaultValue={record?.status ?? "needed"}>{Object.entries(materialStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <div className="form-row">
      <label>Van wie / leverancier<input name="provider" maxLength={300} defaultValue={record?.provider ?? ""}/></label>
      <label>Verantwoordelijke<select name="responsible_person_id" defaultValue={record?.responsible_person_id ?? ""}>
        <option value="">Nog niet toegewezen</option>
        {record?.responsible_person_id && !people.some(person => person.id === record.responsible_person_id) && <option value={record.responsible_person_id}>Eerder toegewezen persoon (niet meer beschikbaar)</option>}
        {people.map(person => <option key={person.id} value={person.id}>{person.label}</option>)}
      </select></label>
      <label>Ophaal- / retourlocatie<input name="location" maxLength={300} defaultValue={record?.location ?? ""}/></label>
    </div>
    <div className="form-row">
      <label>Ophalen gepland<input type="datetime-local" name="pickup_at" defaultValue={formatDateTimeLocal(record?.pickup_at)}/></label>
      <label>Terugbrengen gepland<input type="datetime-local" name="return_at" defaultValue={formatDateTimeLocal(record?.return_at)}/></label>
    </div>
    <label>Praktische afspraken<textarea name="notes" rows={3} maxLength={2000} defaultValue={record?.notes ?? ""}/></label>
    <div className="form-actions"><button className="primary">Opslaan</button></div>
  </form>;
}
