import { operationalModules, type OperationalModule } from "@/app/app/operations/config";
import { MarkdownField } from "@/components/markdown-field";
import { communityRoleLabels } from "@/lib/community-people";

const platforms = ["Discord", "Twitch", "YouTube", "TikTok", "Instagram", "Facebook", "X", "Threads", "LinkedIn", "Blogger", "Website", "Nieuwsbrief"];
type RecordData = { id?: string; [key: string]: unknown };
type Option = { id: string; title: string };

export function OperationalRecordForm({
  action,
  module,
  record = {},
  projects = [],
  partners = [],
  content = [],
  campaigns = [],
  events = [],
  accountOptions = [],
  personRoles = [],
  returnTo,
}: {
  action: (formData: FormData) => void | Promise<void>;
  module: OperationalModule;
  record?: RecordData;
  projects?: Option[];
  partners?: { id: string; name: string }[];
  content?: Option[];
  campaigns?: Option[];
  events?: Option[];
  accountOptions?: { id: string; label: string }[];
  personRoles?: string[];
  returnTo?: string;
}) {
  const config = operationalModules[module];
  const dateValue = record[config.dateColumn ?? ""]
    ? String(record[config.dateColumn ?? ""]).slice(0, module === "social" ? 16 : 10)
    : "";

  return (
    <form action={action}>
      <input type="hidden" name="module" value={module}/>
      {returnTo && <input type="hidden" name="return_to" value={returnTo}/>}
      {record.id && <input type="hidden" name="id" value={record.id}/>}
      <label>Naam / titel<input name="title" defaultValue={String(record[config.titleColumn] ?? "")}/></label>
      <div className="form-row">
        <label>Type<select name="type" defaultValue={String(record[config.typeColumn] ?? Object.keys(config.types)[0])}>{Object.entries(config.types).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Status<select name="status" defaultValue={String(record.status ?? Object.keys(config.statuses)[0])}>{Object.entries(config.statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {module !== "community" && module !== "social" && <label>Prioriteit<select name="priority" defaultValue={String(record.priority ?? "normal")}><option value="low">Laag</option><option value="normal">Normaal</option><option value="high">Hoog</option><option value="urgent">Urgent</option></select></label>}
        {config.dateColumn && <label>{config.dateLabel}<input type={module === "social" ? "datetime-local" : "date"} name="date" defaultValue={dateValue}/></label>}
        {module === "campagnes" && <>
          {!record.id && <label className="inline-check campaign-template-toggle"><input type="checkbox" name="apply_template" defaultChecked/>Start met het standaardsjabloon voor dit campagnetype</label>}
          <label>Startdatum<input type="date" name="start_date" defaultValue={String(record.start_date ?? "").slice(0, 10)}/></label>
          <label>Project<select name="project_id" defaultValue={String(record.project_id ?? "")}><option value="">Geen project</option>{projects.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
          <label>Event<select name="event_id" defaultValue={String(record.event_id ?? "")}><option value="">Geen event</option>{events.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
          <label>Partner<select name="partner_id" defaultValue={String(record.partner_id ?? "")}><option value="">Geen partner</option>{partners.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Budget<input type="number" step="0.01" min="0" name="budget" defaultValue={String(record.budget ?? "")}/></label>
          <label>Waarde<input type="number" step="0.01" min="0" name="value" defaultValue={String(record.value ?? "")}/></label>
          <label>Rapportage<select name="reporting_status" defaultValue={String(record.reporting_status ?? "not_required")}><option value="not_required">Niet nodig</option><option value="todo">Te maken</option><option value="draft">In opmaak</option><option value="sent">Verstuurd</option><option value="approved">Goedgekeurd</option></select></label>
        </>}
        {module === "social" && <>
          <label>Platform<select name="platform" defaultValue={String(record.platform ?? "Discord")}>{platforms.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Content<select name="content_id" defaultValue={String(record.content_id ?? "")}><option value="">Geen contentitem</option>{content.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
          <label>Campagne<select name="campaign_id" defaultValue={String(record.campaign_id ?? "")}><option value="">Geen campagne</option>{campaigns.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
          <label>Event<select name="event_id" defaultValue={String(record.event_id ?? "")}><option value="">Geen event</option>{events.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
          <label>Partner<select name="partner_id" defaultValue={String(record.partner_id ?? "")}><option value="">Geen partner</option>{partners.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        </>}
      </div>
      {module === "sponsors" && <>
        <h3 className="form-subtitle">Relatiegegevens</h3>
        <div className="form-row">
          <label>Algemeen e-mailadres<input type="email" name="email" defaultValue={String(record.email ?? "")}/></label>
          <label>Website<input type="url" name="website" defaultValue={String(record.website ?? "")}/></label>
          <label>Sector<input name="sector" defaultValue={String(record.sector ?? "")}/></label>
          <label>Samenwerkingstype<input name="collaboration_type" defaultValue={String(record.collaboration_type ?? "")}/></label>
          <label>Geschatte waarde<input type="number" min="0" step="0.01" name="estimated_value" defaultValue={String(record.estimated_value ?? "")}/></label>
          <label>Contractlink<input type="url" name="contract_url" defaultValue={String(record.contract_url ?? "")}/></label>
        </div>
        <MarkdownField label="Afspraken en voorwaarden" name="agreement_summary" rows={4} defaultValue={String(record.agreement_summary ?? "")}/>
      </>}
      {module === "community" && <>
        <h3 className="form-subtitle">Profiel en inzetbaarheid</h3>
        <div className="form-row">
          <label>Command Center-account<select name="account_user_id" defaultValue={String(record.account_user_id ?? "")}><option value="">Geen account gekoppeld</option>{accountOptions.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}</select></label>
          <label>Handle<input name="handle" defaultValue={String(record.handle ?? "")}/></label>
          <label>Discord<input name="discord_handle" defaultValue={String(record.discord_handle ?? "")}/></label>
          <label>E-mail<input type="email" name="email" defaultValue={String(record.email ?? "")}/></label>
          <label>Taal<input name="language" defaultValue={String(record.language ?? "")}/></label>
          <label>Beschikbaarheid<input name="availability" defaultValue={String(record.availability ?? "")}/></label>
          <label>Streamteamniveau<input name="streamteam_level" defaultValue={String(record.streamteam_level ?? "")}/></label>
          <label>Onboarding<select name="onboarding_status" defaultValue={String(record.onboarding_status ?? "not_started")}><option value="not_started">Niet gestart</option><option value="in_progress">Bezig</option><option value="completed">Afgerond</option><option value="not_required">Niet nodig</option></select></label>
        </div>
        <fieldset className="role-picker"><legend>Rollen</legend>{Object.entries(communityRoleLabels).map(([role, label]) => <label className="inline-check" key={role}><input type="checkbox" name="roles" value={role} defaultChecked={personRoles.includes(role)}/>{label}</label>)}</fieldset>
        <label>Vaardigheden (komma gescheiden)<input name="skills" defaultValue={Array.isArray(record.skills) ? record.skills.join(", ") : ""}/></label>
        <label>Interesses (komma gescheiden)<input name="interests" defaultValue={Array.isArray(record.interests) ? record.interests.join(", ") : ""}/></label>
        <label>Platformen (komma gescheiden)<input name="platforms" defaultValue={Array.isArray(record.platforms) ? record.platforms.join(", ") : ""}/></label>
      </>}
      {module === "social" ? <>
        <MarkdownField label="Copy" name="notes" rows={7} defaultValue={String(record.copy ?? "")}/>
        <div className="form-row">
          <label>Hashtags<input name="hashtags" defaultValue={String(record.hashtags ?? "")}/></label>
          <label>Call-to-action<input name="call_to_action" defaultValue={String(record.call_to_action ?? "")}/></label>
          <label>Planninglink<input type="url" name="planning_url" defaultValue={String(record.planning_url ?? "")}/></label>
          <label>Publicatielink<input type="url" name="publication_url" defaultValue={String(record.publication_url ?? "")}/></label>
        </div>
      </> : <MarkdownField label="Notities / briefing" name="notes" rows={7} defaultValue={String(record.notes ?? "")}/>}
      {module === "campagnes" && <>
        <fieldset className="channel-picker"><legend>Kanalen</legend>{platforms.map((channel) => <label key={channel}><input type="checkbox" name="channels" value={channel} defaultChecked={Array.isArray(record.channels) && record.channels.includes(channel)}/>{channel}</label>)}</fieldset>
        <p className="form-help">Deliverables worden als afzonderlijke, opvolgbare onderdelen in het campagnedossier beheerd.</p>
        <MarkdownField label="Resultaten en evaluatie" name="results_summary" rows={4} defaultValue={String(record.results_summary ?? "")}/>
        <div className="form-row">
          <label>Impressies<input type="number" min="0" name="impressions" defaultValue={String(record.impressions ?? "")}/></label>
          <label>Kliks<input type="number" min="0" name="clicks" defaultValue={String(record.clicks ?? "")}/></label>
        </div>
      </>}
      {config.urlColumn && <label>{module === "social" ? "Canva-link" : "Google Drive-link"}<input type="url" name="url" defaultValue={String(record[config.urlColumn] ?? "")}/></label>}
      <div className="form-actions"><button className="primary">Opslaan</button></div>
    </form>
  );
}
