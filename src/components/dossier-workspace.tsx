import {AppShell} from "./app-shell";
import {DossierEditor} from "./dossier-editor";
import {FullDossierCreate} from "./full-dossier-create";
import {loadDossierEditor} from "@/lib/dossier-editor-server";
import {saveDossierEditor} from "@/app/app/dossier-editor-actions";
import {dossierEditorCatalog} from "@/lib/dossier-editor-catalog";
import type {EditorRecord} from "@/lib/dossier-editor-draft";
import "./dossier-editor.css";
import {randomUUID} from "node:crypto";

export async function DossierWorkspace({kind,id,active,returnTo,preset={},initialTab,context}:{kind:string;id?:string;active:string;returnTo:string;preset?:EditorRecord;initialTab?:string;context?:{type:string;id:string}}){
 const data=await loadDossierEditor(kind,id,preset),cfg=dossierEditorCatalog[kind];
 if(!id&&context&&cfg.entity&&data.parts.record_relationships)data.parts.record_relationships.push({id:randomUUID(),source_type:cfg.entity,source_id:data.id,target_type:context.type,target_id:context.id,relationship_type:"related"});
 // Presets are supplied by the calling server page, never free-form URL values.
 const props={...data,record:data.record??null,initialValues:preset,initialTab,cancelHref:returnTo,onSave:saveDossierEditor};
 return <AppShell active={active}><header className="topbar module-top"><div><p>DOSSIER</p><h1>{id?String(data.record?.title??data.record?.name??data.record?.display_name??cfg.label):`Nieuw: ${cfg.label}`}</h1></div></header><div className="module-body">{id?<DossierEditor key={data.id} {...props} mode="edit"/>:<FullDossierCreate key={data.id} {...props}/>}</div></AppShell>;
}
