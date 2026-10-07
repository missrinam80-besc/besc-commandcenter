"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { filterPeople, type PersonPickerOption } from "@/lib/person-picker";

export type { PersonPickerOption } from "@/lib/person-picker";

export function SearchablePersonPicker({ options, defaultValue = "", required = true }: { options: PersonPickerOption[]; defaultValue?: string; required?: boolean }) {
  const initial = options.find(option => option.id === defaultValue) ?? null;
  const [query, setQuery] = useState(initial?.label ?? "");
  const [selected, setSelected] = useState<PersonPickerOption | null>(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.setCustomValidity(selected || (!required && !query.trim()) ? "" : "Kies een persoon uit de zoekresultaten.");
  }, [selected, required, query]);
  const matches = useMemo(() => filterPeople(options, query), [options, query]);
  const filtered = matches.slice(0, 30);

  return <div className="searchable-picker">
    <input type="hidden" name="person_id" value={selected?.id ?? ""}/>
    <label>Persoon zoeken{!required && " (optioneel)"}<input ref={input} required={required} aria-label="Persoon zoeken" autoComplete="off" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder="Naam, handle, Discord of rol…"/></label>
    <p className="form-help" aria-live="polite">{selected ? "Persoon geselecteerd." : `${matches.length} personen gevonden${matches.length > 30 ? "; verfijn je zoekopdracht om de overige personen te vinden" : ""}.`}</p>
    {selected ? <div className="searchable-picker-selected"><span>Gekozen</span><strong>{selected.label}</strong><small>{selected.roles?.join(", ") || "Geen rol geregistreerd"}</small><button type="button" onClick={() => { setSelected(null); setQuery(""); }}>Wijzigen</button></div> : <div className="searchable-picker-results" role="listbox" aria-label="Personen">
      {filtered.map((option) => <button type="button" role="option" aria-selected="false" key={option.id} onClick={() => { setSelected(option); setQuery(option.label); }}><strong>{option.label}</strong><span>{[...(option.aliases ?? []), ...(option.roles ?? [])].join(" · ") || "Persoon"}</span></button>)}
      {!filtered.length && <p>Geen passende persoon gevonden.</p>}
    </div>}
  </div>;
}
