import Link from "next/link";
import { ExternalLink, FileText, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  addRecordLink,
  addRecordDocument,
  addRecordRelationship,
  deleteRecordLink,
  deleteRecordDocument,
  deleteRecordRelationship,
  updateRecordLink,
} from "@/app/app/dossier-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { FormModal } from "@/components/form-modal";
import { SearchableRelationPicker } from "@/components/searchable-relation-picker";
import {
  dossierEntityConfig,
  relationshipTypeLabels,
  type DossierEntityType,
  type RecordLink,
  type RecordDocument,
  type RelationOption,
  type ResolvedRelationship,
} from "@/lib/dossier-relations";
import { formatDateTime } from "@/lib/format";

import { sourceObservationLabels } from "@/lib/source-observation";

const linkTypeLabels: Record<string, string> = {
  reference: "Referentie",
  publication: "Publicatie",
  briefing: "Briefing",
  document: "Document",
  website: "Website",
  other: "Andere link",
};

export function RecordConnectionsPanel({ entityType, entityId, links, documents, relationships, options, canManage, modal, selectedLinkId, queryContext = "", view = "all" }: {
  entityType: DossierEntityType;
  entityId: string;
  links: RecordLink[];
  documents: RecordDocument[];
  relationships: ResolvedRelationship[];
  options: RelationOption[];
  canManage: boolean;
  modal?: string;
  selectedLinkId?: string;
  queryContext?: string;
  view?: "all" | "documents" | "relationships";
}) {
  const queryHref = (query = "") => `?${[queryContext, query].filter(Boolean).join("&")}`;
  const orderedRelationships = view === "relationships" ? [...relationships].sort((a,b)=>a.entityType.localeCompare(b.entityType)||a.label.localeCompare(b.label,"nl")) : relationships;
  const selectedLink = links.find((item) => item.id === selectedLinkId);
  const supportsDocuments = ["project", "event", "campaign", "partner", "community_person"].includes(entityType);
  return (
    <>
      {modal === "link" && canManage ? (
        <FormModal closeHref={queryHref()} title="Link toevoegen">
          <form action={addRecordLink}>
            <input type="hidden" name="entity_type" value={entityType}/><input type="hidden" name="entity_id" value={entityId}/>
            <label>Naam van de link<input name="label" placeholder="Bijvoorbeeld briefing, publicatie of website"/></label>
            <label>Webadres<input type="url" name="url" placeholder="https://..."/></label>
            <label>Soort link<select name="link_type" defaultValue="reference"><option value="reference">Referentie</option><option value="publication">Publicatie</option><option value="briefing">Briefing</option><option value="document">Document</option><option value="website">Website</option><option value="other">Andere link</option></select></label>
            <div className="form-actions"><Link href={queryHref("")}>Annuleren</Link><button className="primary">Link opslaan</button></div>
          </form>
        </FormModal>
      ) : null}
      {selectedLink && canManage ? (
        <FormModal closeHref={queryHref()} title="Link bewerken">
          <form action={updateRecordLink}>
            <input type="hidden" name="entity_type" value={entityType}/><input type="hidden" name="entity_id" value={entityId}/><input type="hidden" name="id" value={selectedLink.id}/>
            <label>Naam van de link<input name="label" defaultValue={selectedLink.label}/></label>
            <label>Webadres<input type="url" name="url" defaultValue={selectedLink.url}/></label>
            <label>Soort link<select name="link_type" defaultValue={selectedLink.link_type}><option value="reference">Referentie</option><option value="publication">Publicatie</option><option value="briefing">Briefing</option><option value="document">Document</option><option value="website">Website</option><option value="other">Andere link</option></select></label>
            <div className="form-actions"><Link href={queryHref("")}>Annuleren</Link><button className="primary">Wijzigingen opslaan</button></div>
          </form>
        </FormModal>
      ) : null}
      {modal === "relatie" && canManage ? (
        <FormModal closeHref={queryHref()} title="Bestaand dossier koppelen" description="De relatie wordt automatisch ook op het andere dossier zichtbaar.">
          <form action={addRecordRelationship}>
            <input type="hidden" name="entity_type" value={entityType}/><input type="hidden" name="entity_id" value={entityId}/>
            <SearchableRelationPicker options={options}/>
            <label>Soort relatie<select name="relationship_type" defaultValue="related"><option value="related">Gerelateerd aan</option><option value="part_of">Onderdeel van</option><option value="supports">Ondersteunt</option><option value="sponsor">Sponsor van</option><option value="participant">Betrokken bij</option><option value="supplier">Leverancier voor</option></select></label>
            <div className="form-actions"><Link href={queryHref("")}>Annuleren</Link><button className="primary">Relatie opslaan</button></div>
          </form>
        </FormModal>
      ) : null}
      {modal === "document" && canManage && supportsDocuments ? (
        <FormModal closeHref={queryHref()} title="Google-document koppelen" description="Het bestand blijft in Google Drive; alleen de naam, link en metadata worden bewaard.">
          <form action={addRecordDocument}>
            <input type="hidden" name="entity_type" value={entityType}/><input type="hidden" name="entity_id" value={entityId}/>
            <label>Naam van het document<input name="name" placeholder="Bijvoorbeeld projectbriefing of evaluatie"/></label>
            <label>Google Drive-link<input type="url" name="url" placeholder="https://docs.google.com/…"/></label>
            <div className="form-actions"><Link href={queryHref("")}>Annuleren</Link><button className="primary">Document koppelen</button></div>
          </form>
        </FormModal>
      ) : null}
      <div className="record-connections-grid">
        {view !== "relationships" && <section className="form-card">
          <div className="form-heading"><div><span className="eyebrow">REFERENTIES</span><h2>Links</h2></div>{canManage ? <Link className="row-action" href={queryHref("koppeling=link")}><Plus size={14}/>Toevoegen</Link> : null}</div>
          <div className="connection-list">{links.length ? links.map((item) => <article key={item.id}><div><a href={item.url} target="_blank" rel="noreferrer"><strong>{item.label}</strong><ExternalLink size={13}/></a><span>{linkTypeLabels[item.link_type] ?? item.link_type}</span></div>{canManage ? <div className="connection-actions"><Link aria-label={`${item.label} bewerken`} href={queryHref(`link=${item.id}`)}><Pencil size={14}/></Link><form action={deleteRecordLink}><input type="hidden" name="entity_type" value={entityType}/><input type="hidden" name="entity_id" value={entityId}/><input type="hidden" name="id" value={item.id}/><ConfirmSubmitButton aria-label={`${item.label} verwijderen`} className="icon-danger-button" message={`Link “${item.label}” verwijderen?`}><Trash2 size={14}/></ConfirmSubmitButton></form></div> : null}</article>) : <p className="empty-inline">Nog geen extra links gekoppeld.</p>}</div>
        </section>}
        {view !== "documents" && <section className="form-card">
          <div className="form-heading"><div><span className="eyebrow">SAMENHANG</span><h2>Gerelateerde dossiers ({relationships.length})</h2></div>{canManage ? <Link className="row-action" href={queryHref("koppeling=relatie")}><Plus size={14}/>Koppelen</Link> : null}</div>
          <div className="connection-list">{relationships.length ? orderedRelationships.map((item) => <article key={item.id}><div><Link href={item.href}><strong>{item.label}</strong><Link2 size={13}/></Link><span>{dossierEntityConfig[item.entityType].label} · {relationshipTypeLabels[item.relationship_type] ?? item.relationship_type}</span></div>{canManage ? <form action={deleteRecordRelationship}><input type="hidden" name="entity_type" value={entityType}/><input type="hidden" name="entity_id" value={entityId}/><input type="hidden" name="id" value={item.id}/><ConfirmSubmitButton aria-label={`${item.label} ontkoppelen`} className="icon-danger-button" message={`Relatie met “${item.label}” verwijderen?`}><Trash2 size={14}/></ConfirmSubmitButton></form> : null}</article>) : <p className="empty-inline">Nog geen andere dossiers gekoppeld.</p>}</div>
        </section>}
        {supportsDocuments && view !== "relationships" ? <section className="form-card record-documents-card">
          <div className="form-heading"><div><span className="eyebrow">GOOGLE DRIVE</span><h2>Documenten</h2></div>{canManage ? <Link className="row-action" href={queryHref("koppeling=document")}><Plus size={14}/>Document koppelen</Link> : null}</div>
          <div className="connection-list">{documents.length ? documents.map((document) => <article key={document.id}><div><a href={document.web_url} target="_blank" rel="noreferrer"><FileText size={14}/><strong>{document.name}</strong><ExternalLink size={13}/></a><details className="document-metadata"><summary>Brongegevens</summary><span>Registratie bijgewerkt {formatDateTime(document.updated_at)}</span><span>{sourceObservationLabels(document)}</span></details></div>{canManage ? <form action={deleteRecordDocument}><input type="hidden" name="entity_type" value={entityType}/><input type="hidden" name="entity_id" value={entityId}/><input type="hidden" name="id" value={document.id}/><ConfirmSubmitButton aria-label={`${document.name} ontkoppelen`} className="icon-danger-button" message={`Registratie van “${document.name}” verwijderen? Het bestand in Google Drive blijft bestaan.`}><Trash2 size={14}/></ConfirmSubmitButton></form> : null}</article>) : <p className="empty-inline">Nog geen documenten aan dit dossier gekoppeld.</p>}</div>
        </section> : null}
      </div>
    </>
  );
}
