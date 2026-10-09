import {dossierEditorCatalog,dossierFieldTab} from "./dossier-editor-catalog";
import {dossierFieldLabel} from "./dossier-editor-labels";
import type {EditorBundle,EditorIssue} from "./dossier-editor-draft";

export function editorIssueText(issue:EditorIssue){
 const message=issue.field?issue.message.replaceAll(issue.field,dossierFieldLabel(issue.field)):issue.message;
 return issue.label?`${issue.label} — ${message}`:message;
}

type StorageError={code?:string;message?:string;details?:string|null};
const causes:Record<string,string>={
 choice_unavailable:"Een gekozen type of categorie is ondertussen verwijderd of niet beschikbaar voor deze organisatie. Vernieuw de keuzes en selecteer een beschikbare optie.",
 choice_no_access:"Je hebt geen toegang tot de keuzes van deze organisatie.",
 dossier_no_access:"Je hebt geen bevoegdheid voor de fiche of een gewijzigd onderdeel. Controleer de bewerkrechten voor de betrokken onderdelen.",
 dossier_unavailable:"De fiche of een gewijzigd onderdeel is verwijderd of niet meer toegankelijk. Vernieuw de fiche en vergelijk je invoer.",
 dossier_reference_unavailable:"Een gekoppeld dossier, persoon of account is verwijderd, inactief of niet toegankelijk. Kies een beschikbare koppeling.",
 dossier_separate_approval:"Goedkeuring wijzigen kan alleen via de afzonderlijke goedkeuringsactie.",
 dossier_separate_payment:"Betalingen en betaalstatussen moeten via de afzonderlijke betaalactie worden verwerkt.",
 dossier_locked_newsletter:"Deze nieuwsbrief is vergrendeld voor bewerken. Controleer de goedkeurings- of verzendstatus.",
 dossier_project_outcomes_required:"Vul Doel, Oplevering, Acceptatiecriteria en Afsluitevaluatie in voordat je het project afrondt.",
 dossier_separate_integration_action:"Deze Google-koppeling vraagt een afzonderlijke integratieactie.",
 dossier_identity_changed:"Een dossierkoppeling kan niet naar een ander hoofddossier worden verplaatst via deze editor. Verwijder de oude koppeling en voeg de gewenste koppeling toe.",
 dossier_invalid_relation:"Kies een geldig dossiertype en een bijbehorend dossier voor de relatie.",
 dossier_duplicate_change:"Hetzelfde onderdeel staat meermaals in de opslagwijziging. Vernieuw de editor voordat je opnieuw opslaat.",
 dossier_invalid_delete:"Dit onderdeel kan niet met deze verwijderactie worden verwijderd.",
 dossier_unknown_field:"Een gewijzigd veld wordt niet ondersteund door de opslagversie. Controleer of app en databank dezelfde versie gebruiken.",
 dossier_unknown_part:"Een gewijzigd onderdeel wordt niet ondersteund door de opslagversie. Controleer of app en databank dezelfde versie gebruiken.",
};
const scheduleChecks:Record<string,[string,string]>={
 event_schedule_items_title_check:["title","De titel van het tijdslot moet 2 tot 180 tekens bevatten."],
 event_schedule_items_location_check:["location","De locatie mag maximaal 300 tekens bevatten."],
 event_schedule_items_notes_check:["notes","De praktische afspraken mogen maximaal 4000 tekens bevatten."],
 event_schedule_items_check:["ends_at","Voor een eindmoment is een startmoment nodig en het einde moet na de start liggen."],
 event_schedule_items_kind_check:["kind","Kies een geldig soort onderdeel."],
 event_schedule_items_status_check:["status","Kies een geldige status voor het tijdslot."],
};

/** Translate only recognized database metadata; never expose failing-row values or SQL. */
export function dossierStorageFeedback(error:StorageError,bundle:EditorBundle):{message:string;issues?:EditorIssue[]}{
 const code=error.code??"";
 const original=error.message??"";
 if(code==="40001"||original==="dossier_conflict")return {message:"Dit dossier of een onderdeel is ondertussen gewijzigd. Je invoer blijft staan; vergelijk de recente versie voordat je opnieuw opslaat."};
 if(code==="42883"||code==="PGRST202")return {message:"De gezamenlijke opslagfunctie ontbreekt of is nog niet beschikbaar. Controleer de dossiermigratie en de databankversie."};
 if(causes[original])return {message:causes[original]};
 const constraint=original.match(/constraint "([a-z0-9_]+)"/i)?.[1];
 const cfg=dossierEditorCatalog[bundle.kind];
 const definitions=[{table:cfg.table,fields:cfg.fields,label:cfg.label,tab:undefined},...cfg.collections];
 // PostgreSQL metadata identifies a column, but not a safe row identity. Show candidates.
 const column=original.match(/column "([a-z0-9_]+)"/i)?.[1];
 const relation=original.match(/relation "([a-z0-9_]+)"/i)?.[1];
 const identified=code==="23502"?definitions.find(def=>def.table===relation&&column&&def.fields.includes(column)):undefined;
 const foreign=code==="23503"&&constraint?definitions.flatMap(def=>def.fields.map(field=>({def,field}))).find(({def,field})=>constraint===`${def.table}_${field}_fkey`||constraint===`${def.table}_organization_id_${field}_fkey`):undefined;
 const def=identified??foreign?.def,field=identified?column:foreign?.field;
 if(def&&field){
  const message=code==="23502"?`Vul ${dossierFieldLabel(field)} in; de databank vereist dit gegeven.`:`De koppeling bij ${dossierFieldLabel(field)} is niet beschikbaar. Kies opnieuw een geldig dossier, persoon of account.`;
  const changes=def.table===cfg.table?[bundle.root]:bundle.parts.filter(part=>part.collection===def.table&&!part.delete);
  const issues=changes.map(change=>({message,field,tab:def.tab??dossierFieldTab(field,cfg),rowId:change.id,collection:def.table===cfg.table?undefined:def.table,label:def.table===cfg.table?def.label:`${def.label}: ${String(change.values.title??change.values.name??change.base?.title??change.base?.name??"onderdeel")}`}));
  return {message:"De databank heeft het volgende veld afgewezen. Controleer de genoemde fiche of onderdelen; er is niets opgeslagen.",issues};
 }
 if(code==="23514"&&constraint&&scheduleChecks[constraint]){
  const [field,message]=scheduleChecks[constraint];
  const issues=bundle.parts.filter(part=>part.collection==="event_schedule_items"&&!part.delete).map(part=>({message,field,collection:part.collection,rowId:part.id,tab:cfg.collections.find(c=>c.table===part.collection)?.tab,label:`Programma en inzet: ${String(part.values.title??part.base?.title??"tijdslot")}`}));
  return {message:"De databank weigert een regel voor een tijdslot. Controleer de onderstaande onderdelen; de databank vermeldt niet welk tijdslot de fout veroorzaakte.",issues};
 }
 const messages:Record<string,string>={
  "42501":"Geen schrijfrechten voor de fiche of een gewijzigd onderdeel. Controleer je bewerkrechten en de toegang tot gekoppelde dossiers.",
  "23503":"Een gekoppeld dossier, persoon of account bestaat niet meer of hoort niet bij deze organisatie. Kies opnieuw een beschikbare koppeling.",
  "23505":"Deze registratie of koppeling bestaat al. Controleer of je hetzelfde onderdeel dubbel hebt toegevoegd.",
  "23502":"Een verplicht gegeven ontbreekt volgens de databank. Controleer de verplichte velden van de fiche en de toegevoegde onderdelen.",
  "23514":"Een databankregel wordt niet gevolgd. Controleer datumvolgorde, toegestane status, tekstlengte en aantallen van de gewijzigde onderdelen.",
  "22007":"Een datum of tijd is ongeldig. Controleer de ingevulde start- en eindmomenten.",
  "22008":"Een datum of tijd valt buiten het toegestane bereik. Controleer de start- en eindmomenten.",
  "22P02":"Een waarde heeft niet het verwachte type. Controleer getallen, datums en geselecteerde koppelingen.",
 };
 const message=messages[code]??"De databank heeft de opslag geweigerd zonder een herkenbare veldmelding. Je invoer blijft staan. Geef de onderstaande foutcode door bij de melding.";
 return {message:`${message} Foutcode: ${/^[A-Z0-9]{5,12}$/.test(code)?code:"ONBEKEND"}.`};
}
