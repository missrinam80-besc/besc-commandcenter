import {eventDossierTabs} from "./event-dossier-tabs";
import {projectTabs,campaignTabs,sponsorTabs,communityTabs} from "./contact-dossier-tabs";

export type EditorTab={id:string;label:string};
export type EditorCollection={table:string;label:string;tab:string;fields:string[];parentField:string;key?:string;entityField?:string;entityValue?:string;capability?:string;singleton?:boolean;through?:boolean};
export type EditorConfig={table:string;label:string;path:string;capability:string;entity?:string;tabs:readonly EditorTab[];fields:string[];collections:EditorCollection[]};
const fields=(s:string)=>s.split(" ").filter(Boolean);
const commonTabs=[{id:"algemeen",label:"Algemeen"},{id:"planning",label:"Planning & opvolging"},{id:"dossiers",label:"Gekoppelde dossiers"},{id:"documenten",label:"Documenten & koppelingen"}] as const;
const collection=(table:string,label:string,tab:string,parentField:string,columns:string,extra:Partial<EditorCollection>={}):EditorCollection=>({table,label,tab,parentField,fields:fields(columns),...extra});
const links=(entity:string):EditorCollection[]=>[
  collection("record_links","Bronlinks","documenten","entity_id","label url link_type position",{entityField:"entity_type",entityValue:entity}),
  collection("record_relationships","Dossierrelaties","dossiers","source_id","target_type target_id source_type source_id relationship_type",{entityField:"source_type",entityValue:entity}),
];
const finance=(parentField:string):EditorCollection[]=>[
  collection("budget_envelopes","Budgetten","financien",parentField,"name category status planned_amount start_date end_date notes owner_id",{capability:"manageFinance"}),
  collection("expenses","Kosten","financien",parentField,"title budget_id category status amount expense_date supplier invoice_number proof_url declaration_url claimant_name notes",{capability:"manageFinance"}),
  collection("income_entries","Inkomsten","financien",parentField,"title budget_id income_type status amount expected_date received_at payer invoice_number proof_url notes",{capability:"manageFinance"}),
];
const documents=(entity:string)=>collection("google_resource_links","Documentregistraties","documenten","entity_id","name google_id resource_type mime_type web_url",{entityField:"entity_type",entityValue:entity});
const assignments=(parentField:string,tab:string)=>collection("community_assignments","Betrokkenen en inzet",tab,parentField,"person_id role_name status starts_at notes");
const tasks=(parentField:string,tab:string)=>collection("tasks","Taken",tab,parentField,"title description status priority due_at");
function config(table:string,label:string,path:string,capability:string,columns:string,tabs:readonly EditorTab[]=commonTabs,collections:EditorCollection[]=[],entity?:string):EditorConfig {
  return {table,label,path,capability,fields:fields(columns),tabs,collections:[...collections,...(entity?links(entity):[])],entity};
}

// Explicit allowlist shared by the UI and its database transaction. Identity, audit,
// credentials, approval signatures and membership administration are never fields.
export const dossierEditorCatalog:Record<string,EditorConfig>={
  task:config("tasks","Taak","/app/taken","active","title description status priority due_at project_id",commonTabs,[
    collection("task_checklist_items","Checklist","planning","task_id","title is_done position"),
    collection("task_assignees","Verantwoordelijken","planning","task_id","user_id",{key:"user_id"}),
  ],"task"),
  project:config("projects","Project","/app/projecten","manageProjects","title description status priority owner_id start_date due_date drive_url goal deliverables acceptance_criteria closure_evaluation",projectTabs,[
    tasks("project_id","planning"),collection("project_milestones","Mijlpalen","planning","project_id","title due_date is_done"),
    collection("project_members","Projectaccounts","team","project_id","user_id",{key:"user_id"}),assignments("project_id","team"),
    collection("campaigns","Campagnes","dossiers","project_id","title campaign_type status priority notes start_date end_date channels",{capability:"manageOrganization"}),
    ...finance("project_id"),documents("project"),
    collection("comments","Opmerkingen","overleg","entity_id","body",{entityField:"entity_type",entityValue:"project"}),
  ],"project"),
  event:config("events","Event","/app/events","manageEvents","title description event_type status priority owner_id start_date end_date start_at end_at location is_online role_besc expected_attendees eventbrite_url stream_url",eventDossierTabs,[
    collection("tasks","Eventtaken","planning","id","title description status priority due_at project_id",{through:true,entityValue:"event",capability:"manageProjects"}),
    assignments("event_id","planning"),
    collection("event_schedule_items","Programma en inzet","planning","event_id","title kind starts_at ends_at person_id location status notes"),
    collection("event_materials","Materialen","materialen","event_id","name asset_id quantity source provider location pickup_at return_at status notes responsible_person_id"),
    collection("event_giveaways","Giveaways","giveaways","event_id","name quantity_planned quantity_received quantity_distributed status responsible_person_id source provider notes"),
    collection("event_registration_settings","Inschrijvingsinstellingen","inschrijvingen","event_id","mode capacity external_url notes",{key:"event_id",singleton:true}),
    collection("event_registrations","Inschrijvingen","inschrijvingen","event_id","name quantity status notes"),
    ...finance("event_id"),documents("event"),
  ],"event"),
  campaign:config("campaigns","Campagne","/app/campagnes","manageOrganization","title campaign_type status priority notes start_date end_date channels project_id event_id partner_id budget value reporting_status results_summary impressions clicks drive_url",campaignTabs,[
    collection("campaign_deliverables","Deliverables","deliverables","campaign_id","title community_person_id due_date status approval_status notes"),
    collection("content_items","Content","publicaties","campaign_id","title description content_type status priority primary_channel channels deadline publication_at approval_status drive_url canva_url publication_url",{capability:"manageContent"}),
    collection("social_posts","Social posts","publicaties","campaign_id","title post_type platform status scheduled_at copy hashtags call_to_action publication_url",{capability:"manageOrganization"}),
    ...finance("campaign_id"),documents("campaign"),
  ],"campaign"),
  partner:config("partners","Sponsor / CRM-contact","/app/sponsors","manageOrganization","name partner_type status priority email website sector collaboration_type estimated_value contract_url agreement_summary next_follow_up drive_url notes owner_id",sponsorTabs,[
    collection("partner_contacts","Contactpersonen","contacten","partner_id","community_person_id account_user_id name role_title email phone is_primary"),
    collection("partner_interactions","Contactmomenten","opvolging","partner_id","interaction_type occurred_at summary next_action follow_up_date"),documents("partner"),
  ],"partner"),
  community:config("community_people","Communitycontact","/app/community","manageOrganization","display_name person_type status handle discord_handle email account_user_id language availability streamteam_level onboarding_status skills interests platforms drive_url notes",communityTabs,[
    collection("community_person_roles","Rollen","profiel","person_id","role",{key:"role"}),
    collection("community_onboarding_items","Intake en ontwikkeling","intake","person_id","title item_type completed due_date notes"),
    collection("community_assignments","Inzet","dossiers","person_id","project_id event_id role_name status starts_at notes"),documents("community_person"),
  ],"community_person"),
  social:config("social_posts","Social post","/app/social","manageOrganization","title post_type platform status scheduled_at copy notes hashtags call_to_action content_id campaign_id event_id partner_id planning_url publication_url canva_url",commonTabs,[
    collection("social_post_variants","Platformvarianten","planning","social_post_id","platform status scheduled_at copy publication_url"),
  ],"social_post"),
  content:config("content_items","Content","/app/content","manageContent","title description content_type status priority project_id campaign_id partner_id primary_channel channels deadline publication_at drive_url canva_url publication_url approval_status",commonTabs,[],"content"),
  meeting:config("meetings","Vergadering","/app/vergaderingen","manageOrganization","title meeting_type status meeting_at ends_at attendees notes decisions action_points minutes_url",commonTabs,[
    collection("meeting_action_items","Actiepunten","planning","meeting_id","title assignee_text status task_id"),documents("meeting"),
  ],"meeting"),
  inbox:config("inbox_items","Inboxdossier","/app/inbox","manageInbox","title description source status priority reviewer_id",commonTabs),
  knowledge:config("knowledge_articles","Kennisartikel","/app/kennisbank","manageOrganization","title article_type status category_id owner_id summary body tags review_due_date drive_url",commonTabs),
  budget:config("budget_envelopes","Budget","/app/financien/budgetten","manageFinance","name category status planned_amount start_date end_date notes project_id event_id campaign_id partner_id merch_launch_id owner_id",commonTabs,[
    collection("expenses","Kosten","planning","budget_id","title category status amount expense_date supplier invoice_number proof_url notes",{capability:"manageFinance"}),
    collection("income_entries","Inkomsten","planning","budget_id","title income_type status amount expected_date received_at payer proof_url notes",{capability:"manageFinance"}),
  ]),
  expense:config("expenses","Kost","/app/financien/kosten","submitExpenses","title budget_id category status amount expense_date paid_at supplier invoice_number proof_url declaration_url claimant_name payment_reference notes project_id event_id campaign_id partner_id merch_launch_id",commonTabs),
  income:config("income_entries","Inkomst","/app/financien/inkomsten","manageFinance","title budget_id income_type status amount expected_date received_at payer invoice_number proof_url notes project_id event_id campaign_id partner_id merch_launch_id",commonTabs),
  product:config("shop_products","Product","/app/shop/producten","manageOrganization","name product_type status price style platforms description asset_url shop_url owner_id supplier_id producer_id project_id campaign_id",commonTabs,[],"shop_product"),
  launch:config("merch_launches","Lancering","/app/shop/lanceringen","manageOrganization","title collection_name status launch_date timing description drive_url owner_id project_id campaign_id partner_id",commonTabs,[],"merch_launch"),
  asset:config("assets","Materiaal / resource","/app/materialen","manageOrganization","name asset_type status serial_number owner_person_id location acquired_date purchase_value current_value supplier_id project_id event_id campaign_id document_url notes",commonTabs),
  newsletter:config("newsletters","Nieuwsbrief","/app/nieuwsbrieven","manageContent","title subject body_text mailing_list_id email_template_id",commonTabs),
  member:config("association_members","VZW-lid","/app/administratie","manageOrganization","full_name email membership_type status joined_on left_on member_number voting_right address notes",commonTabs),
  mandate:config("governance_mandates","Bestuursmandaat","/app/administratie","manageOrganization","member_id role role_label start_date end_date status appointment_document_url notes",commonTabs),
  deadline:config("compliance_deadlines","Administratieve deadline","/app/administratie","manageOrganization","title category due_date status recurrence responsible_id document_id notes",commonTabs),
  administration:config("administrative_documents","Administratief document","/app/administratie","manageOrganization","title document_type status document_date valid_from valid_until drive_url reference_number confidential notes",commonTabs),
};

// Reviewed business fields omitted from the first screen prototype.
for(const [kind,extra] of Object.entries({task:"content_id",event:"project_id partner_id drive_url",campaign:"owner_id",partner:"contact_name last_contact",community:"owner_id phone birth_date started_on stopped_on role_description avatar_url",social:"owner_id bundle_kind",content:"owner_id",product:"product_family",newsletter:"template_variant preheader hero_image_url hero_image_alt"}))dossierEditorCatalog[kind].fields.push(...fields(extra));
for(const cfg of Object.values(dossierEditorCatalog))for(const def of [cfg,...cfg.collections])def.fields=def.fields.filter(name=>!['approval_status','paid_at','payment_reference'].includes(name));
dossierEditorCatalog.newsletter.capability="manageOrganization";

export function dossierFieldTab(name:string,config:EditorConfig) {
  const has=(tab:string)=>config.tabs.some(t=>t.id===tab);
  if(/^(budget|value|estimated_value|amount|planned_amount|price|purchase_value|current_value)/.test(name)&&has("financien"))return "financien";
  if(/^(reporting_status|results_summary|impressions|clicks)$/.test(name)&&has("resultaten"))return "resultaten";
  if(/^(project_id|event_id|campaign_id|partner_id|content_id|merch_launch_id|budget_id|supplier_id)$/.test(name)&&has("dossiers"))return "dossiers";
  if(/^(drive_url|canva_url|publication_url|minutes_url|document_url|proof_url|declaration_url|asset_url|shop_url|planning_url|contract_url)$/.test(name))return "documenten";
  if(config.table==="community_people"){
    if(name==="account_user_id")return "account";
    if(/^(skills|interests|platforms|availability|language|streamteam_level)$/.test(name))return "profiel";
    if(name==="onboarding_status")return "intake";
  }
  if(config.table==="partners"&&/^(collaboration_type|estimated_value|contract_url|agreement_summary)$/.test(name))return "samenwerking";
  return config.tabs[0].id;
}

// A related-dossier panel shares the documents tab where the current fiche has no
// separate dossiers tab (e.g. events). Never generate an unreachable editor panel.
for(const config of Object.values(dossierEditorCatalog)){
  for(const part of config.collections){
    if(!config.tabs.some(tab=>tab.id===part.tab))part.tab="documenten";
  }
}
