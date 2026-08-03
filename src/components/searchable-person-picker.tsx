"use client";

import { useMemo, useState } from "react";

export type PersonPickerOption = { id: string; label: string; roles?: string[] };

export function SearchablePersonPicker({ options }: { options: PersonPickerOption[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PersonPickerOption | null>(null);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("nl-BE");
    return options.filter((option) => !normalized || `${option.label} ${(option.roles ?? []).join(" ")}`.toLocaleLowerCase("nl-BE").includes(normalized)).slice(0, 30);
  }, [options, query]);

  return <div className="searchable-picker">
    <input type="hidden" name="person_id" value={selected?.id ?? ""}/>
    <label>Persoon zoeken<input aria-label="Persoon zoeken" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Typ een naam of rol…"/></label>
    {selected ? <div className="searchable-picker-selected"><span>Gekozen</span><strong>{selected.label}</strong><small>{selected.roles?.join(", ") || "Geen rol geregistreerd"}</small><button type="button" onClick={() => setSelected(null)}>Wijzigen</button></div> : <div className="searchable-picker-results" role="listbox" aria-label="Personen">
      {filtered.map((option) => <button type="button" role="option" aria-selected="false" key={option.id} onClick={() => { setSelected(option); setQuery(option.label); }}><strong>{option.label}</strong><span>{option.roles?.join(", ") || "Persoon"}</span></button>)}
      {!filtered.length && <p>Geen passende persoon gevonden.</p>}
    </div>}
  </div>;
}
