export const sponsorTabs = [
  {id:"algemeen",label:"Algemeen"}, {id:"contacten",label:"Contactpersonen"},
  {id:"samenwerking",label:"Samenwerking"}, {id:"opvolging",label:"Opvolging"},
  {id:"dossiers",label:"Gekoppelde dossiers"}, {id:"documenten",label:"Documenten & rapporten"},
] as const;
export const communityTabs = [
  {id:"algemeen",label:"Algemeen"}, {id:"profiel",label:"Profiel & inzetbaarheid"},
  {id:"intake",label:"Intake & ontwikkeling"}, {id:"dossiers",label:"Inzet & dossiers"},
  {id:"account",label:"Account & toegang"}, {id:"documenten",label:"Documenten & koppelingen"},
] as const;
export const projectTabs = [
  {id:"algemeen",label:"Overzicht"}, {id:"planning",label:"Planning & taken"},
  {id:"team",label:"Team & inzet"}, {id:"financien",label:"Financiën"},
  {id:"dossiers",label:"Gekoppelde dossiers"}, {id:"documenten",label:"Documenten & koppelingen"},
  {id:"overleg",label:"Overleg & activiteit"},
] as const;
export const campaignTabs = [
  {id:"algemeen",label:"Overzicht & briefing"}, {id:"deliverables",label:"Deliverables"},
  {id:"publicaties",label:"Content & publicaties"}, {id:"financien",label:"Financiën"},
  {id:"resultaten",label:"Resultaten & evaluatie"}, {id:"dossiers",label:"Gekoppelde dossiers"},
  {id:"documenten",label:"Documenten & koppelingen"},
] as const;
export function contactTabs(module: string) {
  if(module === "projecten") return projectTabs;
  if(module === "campagnes") return campaignTabs;
  return module === "sponsors" ? sponsorTabs : communityTabs;
}
export function resolveContactTab(module: string, query: Record<string,string|undefined>) {
  if (contactTabs(module).some(t=>t.id===query.tab)) return query.tab!;
  const feedback=query.succes||query.fout||"";
  if(module === "projecten") {
    if(query.taak || query.mijlpaal || query.nieuw === "taak" || /^(taak|mijlpaal)/.test(feedback)) return "planning";
    if(query.betrokkene || /^(team|betrokkene)/.test(feedback)) return "team";
    if(/^reactie/.test(feedback)) return "overleg";
    if(/^drive/.test(feedback)) return "documenten";
  }
  if(module === "campagnes") {
    if(query.nieuw === "content" || query.nieuw === "social") return "publicaties";
    if(/^deliverable/.test(feedback)) return "deliverables";
  }
  if (query.koppeling === "relatie") return "dossiers";
  if (query.koppeling || query.link) return "documenten";
  const result=query.succes||query.fout||"";
  if (/^(link|document)(-|$)/.test(result)) return "documenten";
  if (/^(relatie|taak|inzet)(-|$)/.test(result) || query.nieuw === "taak") return "dossiers";
  if (module === "sponsors" && /^contactmoment/.test(result)) return "opvolging";
  if (module === "sponsors" && /^contact/.test(result)) return "contacten";
  if (module === "community" && /^onboarding/.test(result)) return "intake";
  return "algemeen";
}
// Only preserve a known tab on these exact local dossier routes; never accept a return URL.
export function appendContactTab(href: string, formData: Pick<FormData,"get">) {
  const match=href.match(/^\/app\/(sponsors|community|projecten|campagnes)\/[0-9a-f-]{36}(?:\?|$)/i);
  const tab=formData.get("dossier_tab");
  if (!match || typeof tab!=="string" || !contactTabs(match[1]).some(t=>t.id===tab)) return href;
  const url=new URL(href,"https://local.invalid");
  url.searchParams.set("tab",tab);
  return url.pathname+url.search;
}
