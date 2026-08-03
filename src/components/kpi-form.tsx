import { saveKpi, updateKpi } from "@/app/app/rapportage/actions";
import { MarkdownField } from "@/components/markdown-field";

type Option = { id: string; title?: string | null; name?: string | null };
export type KpiOptions = {
  projects: Option[];
  campaigns: Option[];
  events: Option[];
  content: Option[];
  partners: Option[];
  tasks: Option[];
  people: Option[];
  social: Option[];
};

const domains: Record<string, string> = {
  community: "Community",
  content: "Content",
  social: "Social media",
  events: "Events",
  campaigns: "Campagnes",
  sponsors: "Sponsors",
  website: "Website",
  finance: "Financiën",
  other: "Overige",
};

function RelationSelect({ name, label, value, options }: { name: string; label: string; value: unknown; options: Option[] }) {
  return <label>{label}<select name={name} defaultValue={String(value ?? "")}><option value="">Geen koppeling</option>{options.map((item) => <option key={item.id} value={item.id}>{item.title || item.name || "Naamloos dossier"}</option>)}</select></label>;
}

export function KpiForm({ record = {}, options }: { record?: Record<string, unknown>; options: KpiOptions }) {
  const editing = Boolean(record.id);
  return <form action={editing ? updateKpi : saveKpi}>
    {editing && <input type="hidden" name="id" value={String(record.id)}/>}
    <label>Naam<input name="name" required defaultValue={String(record.name ?? "")}/></label>
    <div className="form-row">
      <label>Domein<select name="domain" defaultValue={String(record.domain ?? "community")}>{Object.entries(domains).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Metric<input name="metric" required placeholder="Bereik, leden, views..." defaultValue={String(record.metric ?? "")}/></label>
      <label>Waarde<input type="number" step="0.0001" name="value" required defaultValue={String(record.value ?? "")}/></label>
      <label>Doel<input type="number" step="0.0001" name="target" defaultValue={record.target == null ? "" : String(record.target)}/></label>
      <label>Eenheid<select name="unit" defaultValue={String(record.unit ?? "number")}><option value="number">Aantal</option><option value="percent">Percentage</option><option value="currency">Euro</option><option value="minutes">Minuten</option><option value="hours">Uren</option><option value="days">Dagen</option></select></label>
      <label>Periode start<input type="date" name="period_start" defaultValue={record.period_start ? String(record.period_start) : ""}/></label>
      <label>Periode einde<input type="date" name="period_end" defaultValue={record.period_end ? String(record.period_end) : ""}/></label>
      <label>Bron<input name="source" required defaultValue={String(record.source ?? "Manueel")}/></label>
      <label>Verzamelmethode<select name="collection_method" defaultValue={String(record.collection_method ?? "manual")}><option value="manual">Handmatig ingevoerd</option><option value="imported">Geïmporteerd bestand</option><option value="api">Automatisch via API</option></select></label>
      <label>Bronlink<input type="url" name="source_url" defaultValue={String(record.source_url ?? "")}/></label>
    </div>
    <fieldset><legend>Koppelingen</legend><div className="form-row">
      <RelationSelect name="project_id" label="Project" value={record.project_id} options={options.projects}/>
      <RelationSelect name="campaign_id" label="Campagne" value={record.campaign_id} options={options.campaigns}/>
      <RelationSelect name="event_id" label="Event" value={record.event_id} options={options.events}/>
      <RelationSelect name="content_id" label="Content" value={record.content_id} options={options.content}/>
      <RelationSelect name="partner_id" label="Sponsor / partner" value={record.partner_id} options={options.partners}/>
      <RelationSelect name="task_id" label="Actie / taak" value={record.task_id} options={options.tasks}/>
      <RelationSelect name="community_person_id" label="Creator / streamer" value={record.community_person_id} options={options.people}/>
      <RelationSelect name="social_post_id" label="Social post" value={record.social_post_id} options={options.social}/>
    </div></fieldset>
    <MarkdownField label="Metricdefinitie" name="metric_definition" rows={3} defaultValue={String(record.metric_definition ?? "")} placeholder="Wat meet deze KPI precies en hoe wordt ze berekend?"/>
    <MarkdownField label="Notities" name="notes" rows={4} defaultValue={String(record.notes ?? "")}/>
    <div className="form-actions"><button className="primary">{editing ? "Wijzigingen opslaan" : "KPI opslaan"}</button></div>
  </form>;
}
