export const eventDossierTabs = [
  { id: "overzicht", label: "Overzicht" },
  { id: "activiteiten", label: "Activiteiten" },
  { id: "planning", label: "Planning & crew" },
  { id: "materialen", label: "Materialen" },
  { id: "giveaways", label: "Giveaways" },
  { id: "inschrijvingen", label: "Inschrijvingen" },
  { id: "financien", label: "Financiën" },
  { id: "documenten", label: "Documenten & koppelingen" },
  { id: "communicatie", label: "Communicatie" },
] as const;

export type EventDossierTab = typeof eventDossierTabs[number]["id"];

export function resolveEventDossierTab(query: Record<string, string | undefined>): EventDossierTab {
  // Existing action URLs and redirects remain valid without a tab parameter.
  if (query.activiteit) return "activiteiten";
  if (query.inschrijving) return "inschrijvingen";
  if (query.financieel) return "financien";
  if (query.giveaway) return "giveaways";
  if (query.materiaal) return "materialen";
  if (query.schema || query.schema_type) return "planning";
  if (query.betrokkene || query.nieuw === "taak" || query.nieuw === "campagne") return "planning";
  if (query.koppeling || query.link || query.drivePreview) return "documenten";
  if (eventDossierTabs.some(tab => tab.id === query.tab)) return query.tab as EventDossierTab;
  const result = query.succes || query.fout || "";
  if (result.startsWith("activiteit-")) return "activiteiten";
  if (result.startsWith("inschrijving-")) return "inschrijvingen";
  if (result.startsWith("financieel-")) return "financien";
  if (result.startsWith("giveaway-")) return "giveaways";
  if (result.startsWith("materiaal-")) return "materialen";
  if (/^(schema|betrokkene|taak|campagne)(-|$)/.test(result)) return "planning";
  if (/^(drive|kalender|document|link|relatie)(-|$)/.test(result)) return "documenten";
  return "overzicht";
}
