"use client";

import { useMemo, useState } from "react";
import { Mail } from "lucide-react";

type DossierType = "partner" | "event" | "meeting" | "project" | "campaign";
type Option = { id: string; title: string; email?: string; contactName?: string; followUpDate?: string | null; date?: string | null; location?: string | null; isOnline?: boolean };
type Template = { id: string; name: string; category: string; entity_type: string | null; subject_template: string; body_template: string };

const labels: Record<DossierType, string> = { partner: "Sponsor", event: "Event", meeting: "Vergadering", project: "Project", campaign: "Campagne" };
const communicationTypes: Record<string, string> = {
  sponsor_follow_up: "Sponsoropvolging", event_communication: "Eventcommunicatie", invitation: "Uitnodiging",
  project_update: "Projectcommunicatie", campaign_update: "Campagnecommunicatie",
};

function renderTemplate(value: string, context: Record<string, string>) {
  return value.replace(/{{\s*([\w-]+)\s*}}/g, (_, key: string) => context[key] ?? "");
}

function formatDate(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("nl-BE", { dateStyle: "long", timeStyle: "short" }).format(new Date(value)) : "nog te bepalen";
}

export function CommunicationComposer({ action, gmailConfigured, templates, partners, events, meetings, projects, campaigns, organizationName, senderName, initialType, initialId }: {
  action: (formData: FormData) => void | Promise<void>;
  gmailConfigured: boolean;
  templates: Template[];
  partners: Option[];
  events: Option[];
  meetings: Option[];
  projects: Option[];
  campaigns: Option[];
  organizationName: string;
  senderName: string;
  initialType: string;
  initialId: string;
}) {
  const startingType = (Object.keys(labels) as DossierType[]).includes(initialType as DossierType) ? initialType as DossierType : "partner";
  const [type, setType] = useState<DossierType>(startingType);
  const [entityId, setEntityId] = useState(initialId);
  const [templateId, setTemplateId] = useState("");
  const initialOptions = startingType === "partner" ? partners : startingType === "event" ? events : startingType === "meeting" ? meetings : startingType === "project" ? projects : campaigns;
  const initialSelected = initialOptions.find((item) => item.id === initialId);
  const [title, setTitle] = useState(initialSelected ? `E-mail - ${initialSelected.title}` : "");
  const [to, setTo] = useState(initialSelected?.email || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const options = type === "partner" ? partners : type === "event" ? events : type === "meeting" ? meetings : type === "project" ? projects : campaigns;
  const availableTemplates = useMemo(() => templates.filter((item) => !item.entity_type || item.entity_type === type), [templates, type]);
  const selected = options.find((item) => item.id === entityId);
  const communicationType = type === "partner" ? "sponsor_follow_up" : type === "event" ? "event_communication" : type === "meeting" ? "invitation" : type === "project" ? "project_update" : "campaign_update";

  function templateContext(selectedOption = selected) {
    return {
      organisatie: organizationName,
      afzender: senderName,
      dossier: selectedOption?.title || "het dossier",
      contact_naam: type === "partner" ? selectedOption?.contactName || "" : "",
      partner_naam: type === "partner" ? selectedOption?.title || "" : "",
      event_naam: type === "event" ? selectedOption?.title || "" : "",
      event_datum: type === "event" ? formatDate(selectedOption?.date) : "nog te bepalen",
      event_locatie: type === "event" ? selectedOption?.isOnline ? "Online" : selectedOption?.location || "nog te bepalen" : "nog te bepalen",
      vergadering_naam: type === "meeting" ? selectedOption?.title || "" : "",
      vergadering_datum: type === "meeting" ? formatDate(selectedOption?.date) : "nog te bepalen",
      project_naam: type === "project" ? selectedOption?.title || "" : "",
      campagne_naam: type === "campaign" ? selectedOption?.title || "" : "",
      opvolgdatum: type === "partner" ? selectedOption?.followUpDate || "" : "",
    };
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = availableTemplates.find((item) => item.id === id);
    setSubject(template ? renderTemplate(template.subject_template, templateContext()) : "");
    setBody(template ? renderTemplate(template.body_template, templateContext()) : "");
  }

  function changeType(nextType: DossierType) {
    setType(nextType);
    setEntityId("");
    setTitle("");
    setTo("");
    setTemplateId("");
    setSubject("");
    setBody("");
  }

  function changeEntity(nextId: string) {
    setEntityId(nextId);
    const next = options.find((item) => item.id === nextId);
    setTitle(next ? `E-mail - ${next.title}` : "");
    setTo(next?.email || "");
    if (templateId) {
      const template = availableTemplates.find((item) => item.id === templateId);
      if (template) {
        setSubject(renderTemplate(template.subject_template, templateContext(next)));
        setBody(renderTemplate(template.body_template, templateContext(next)));
      }
    }
  }

  return <form action={action}>
    <input type="hidden" name="email_template_id" value={templateId}/>
    <div className="template-picker">
      <label>Sjabloon<select value={templateId} onChange={(event) => applyTemplate(event.target.value)}><option value="">Leeg bericht</option>{availableTemplates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <button type="button" onClick={() => applyTemplate(templateId)}>Sjabloon toepassen</button>
    </div>
    <div className="form-row">
      <input type="hidden" name="communication_type" value={communicationType}/>
      <label>Soort communicatie<select value={communicationType} disabled>{Object.entries(communicationTypes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Dossiertype<select name="entity_type" value={type} onChange={(event) => changeType(event.target.value as DossierType)}>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>{labels[type]}<select name="entity_id" value={entityId} onChange={(event) => changeEntity(event.target.value)} required><option value="">Kies een {labels[type].toLowerCase()}</option>{options.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      <label>Interne titel<input name="title" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Bijv. projectopvolging"/></label>
      <label>Aan<input name="to_addresses" type="text" required value={to} onChange={(event) => setTo(event.target.value)} placeholder="naam@organisatie.be; tweede@organisatie.be"/></label>
      <label>CC<input name="cc_addresses" type="text" placeholder="Optioneel, gescheiden door ;"/></label>
      <label>BCC<input name="bcc_addresses" type="text" placeholder="Optioneel, verborgen voor andere ontvangers"/></label>
      <label>Onderwerp<input name="subject" required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Onderwerp van de e-mail"/></label>
      <label>Opvolgdatum<input name="follow_up_date" type="date"/></label>
    </div>
    <label>Bericht<textarea name="body_text" required rows={12} value={body} onChange={(event) => setBody(event.target.value)} placeholder={"Beste,\n\n...\n\nMet vriendelijke groeten,\nBESC vzw"}/></label>
    <div className="form-actions"><button className="primary" disabled={!gmailConfigured}><Mail size={15}/>Opslaan als Gmail-concept</button></div>
  </form>;
}
