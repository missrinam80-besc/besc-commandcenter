import {dossierEditorCatalog} from "./dossier-editor-catalog";
import type {DossierDraft} from "./dossier-editor-draft";

export function hasDossierDriveFolder(draft:DossierDraft):boolean {
  return Boolean(draft.values.drive_url)||(draft.parts.google_resource_links??[]).some(row=>!row.deleted&&row.values.resource_type==="folder");
}

/** Stage only folder references; the existing dossier transaction saves both together. */
export function unlinkDossierDriveFolder(draft:DossierDraft):DossierDraft {
  const cfg=dossierEditorCatalog[draft.kind];
  if(!cfg)throw Error("Onbekende fiche.");
  return {...draft,
    values:cfg.fields.includes("drive_url")?{...draft.values,drive_url:null}:draft.values,
    parts:{...draft.parts,google_resource_links:(draft.parts.google_resource_links??[]).map(row=>row.values.resource_type==="folder"?{...row,deleted:true}:row)},
  };
}
