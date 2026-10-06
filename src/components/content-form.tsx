import { approvalStatuses, contentChannels, contentStatuses, contentTypes } from "@/app/app/content/constants";
import { MarkdownField } from "@/components/markdown-field";
import { formatDateTimeLocal } from "@/lib/format";

type Content = {
  id?: string; title?: string; description?: string | null; content_type?: string;
  status?: string; priority?: string; project_id?: string | null; campaign_id?: string | null;
  partner_id?: string | null; primary_channel?: string | null; channels?: string[];
  deadline?: string | null; publication_at?: string | null; drive_url?: string | null;
  canva_url?: string | null; publication_url?: string | null; approval_status?: string;
};
type Option = { id: string; title: string };

export function ContentForm({ action, content = {}, projects = [], campaigns = [], partners = [] }: {
  action: (formData: FormData) => void | Promise<void>;
  content?: Content;
  projects?: Option[];
  campaigns?: Option[];
  partners?: { id: string; name: string }[];
}) {
  return <form action={action}>
    {content.id && <input type="hidden" name="id" value={content.id}/>}
    <label>Titel<input name="title" defaultValue={content.title ?? ""}/></label>
    <MarkdownField label="Beschrijving" name="description" rows={6} defaultValue={content.description}/>
    <div className="form-row">
      <label>Contenttype<select name="content_type" defaultValue={content.content_type ?? "social_post"}>{Object.entries(contentTypes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={content.status ?? "idea"}>{Object.entries(contentStatuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Prioriteit<select name="priority" defaultValue={content.priority ?? "normal"}><option value="low">Laag</option><option value="normal">Normaal</option><option value="high">Hoog</option><option value="urgent">Urgent</option></select></label>
      <label>Project<select name="project_id" defaultValue={content.project_id ?? ""}><option value="">Geen project</option>{projects.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      <label>Campagne<select name="campaign_id" defaultValue={content.campaign_id ?? ""}><option value="">Geen campagne</option>{content.campaign_id && !campaigns.some((item) => item.id === content.campaign_id) && <option value={content.campaign_id}>Huidige campagne (niet beschikbaar)</option>}{campaigns.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      <label>Partner<select name="partner_id" defaultValue={content.partner_id ?? ""}><option value="">Geen partner</option>{content.partner_id && !partners.some((item) => item.id === content.partner_id) && <option value={content.partner_id}>Huidige partner (niet beschikbaar)</option>}{partners.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Deadline<input type="date" name="deadline" defaultValue={content.deadline ?? ""}/></label>
      <label>Publicatiemoment<input type="datetime-local" name="publication_at" defaultValue={formatDateTimeLocal(content.publication_at)}/></label>
      <label>Hoofdkanaal<select name="primary_channel" defaultValue={content.primary_channel ?? ""}><option value="">Nog te bepalen</option>{contentChannels.map((channel) => <option key={channel}>{channel}</option>)}</select></label>
      <label>Goedkeuring<select name="approval_status" defaultValue={content.approval_status ?? "not_required"}>{Object.entries(approvalStatuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    </div>
    <fieldset className="channel-picker"><legend>Kanalen</legend>{contentChannels.map((channel) => <label key={channel}><input type="checkbox" name="channels" value={channel} defaultChecked={content.channels?.includes(channel)}/>{channel}</label>)}</fieldset>
    <label>Google Drive-link<input type="url" name="drive_url" defaultValue={content.drive_url ?? ""}/></label>
    <label>Canva-link<input type="url" name="canva_url" defaultValue={content.canva_url ?? ""}/></label>
    <label>Publicatielink<input type="url" name="publication_url" defaultValue={content.publication_url ?? ""}/></label>
    <div className="form-actions"><button className="primary">Opslaan</button></div>
  </form>;
}
