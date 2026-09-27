"use client";

import { useState } from "react";

type Option = { id: string; title: string };
type DossierType = "partner" | "event" | "meeting" | "project" | "campaign";

export function DossierPicker({ selectedType, selectedId, partners, events, meetings, projects, campaigns }: {
  selectedType: string;
  selectedId: string;
  partners: Option[];
  events: Option[];
  meetings: Option[];
  projects: Option[];
  campaigns: Option[];
}) {
  const [type, setType] = useState<DossierType>((["partner", "event", "meeting", "project", "campaign"] as string[]).includes(selectedType) ? selectedType as DossierType : "partner");
  const options = type === "partner" ? partners : type === "event" ? events : type === "meeting" ? meetings : type === "project" ? projects : campaigns;
  const labels: Record<DossierType, string> = { partner: "Sponsor", event: "Event", meeting: "Vergadering", project: "Project", campaign: "Campagne" };
  return <>
    <label>Dossiertype<select name="entity_type" value={type} onChange={(event) => setType(event.target.value as DossierType)}>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    <label>{labels[type]}<select name="entity_id" defaultValue={type === selectedType ? selectedId : ""} required><option value="">Kies een {labels[type].toLowerCase()}</option>{options.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
  </>;
}
