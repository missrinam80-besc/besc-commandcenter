"use client";

import { useMemo, useState } from "react";
import type { RelationOption } from "@/lib/dossier-relations";

export function SearchableRelationPicker({ options }: { options: RelationOption[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RelationOption | null>(null);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("nl-BE");
    if (!normalized) return options.slice(0, 30);
    return options.filter((option) => `${option.label} ${option.group}`.toLocaleLowerCase("nl-BE").includes(normalized)).slice(0, 30);
  }, [options, query]);

  return (
    <div className="searchable-picker">
      <input name="target" type="hidden" value={selected ? `${selected.entityType}:${selected.entityId}` : ""}/>
      <label>Zoek een dossier<input aria-label="Zoek een dossier" autoComplete="off" onChange={(event) => setQuery(event.target.value)} placeholder="Typ een naam of module…" value={query}/></label>
      {selected ? <div className="searchable-picker-selected"><span>Gekozen</span><strong>{selected.label}</strong><small>{selected.group}</small><button type="button" onClick={() => setSelected(null)}>Wijzigen</button></div> : (
        <div aria-label="Zoekresultaten" className="searchable-picker-results" role="listbox">
          {filtered.map((option) => <button aria-selected="false" key={`${option.entityType}:${option.entityId}`} onClick={() => { setSelected(option); setQuery(option.label); }} role="option" type="button"><strong>{option.label}</strong><span>{option.group}</span></button>)}
          {!filtered.length ? <p>Geen passende dossiers gevonden.</p> : null}
        </div>
      )}
    </div>
  );
}
