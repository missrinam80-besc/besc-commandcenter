export const emailTemplateVariables = [
  ["{{organisatie}}", "Naam van de organisatie"],
  ["{{afzender}}", "Naam van de ingelogde opsteller"],
  ["{{dossier}}", "Naam van het gekoppelde dossier"],
  ["{{contact_naam}}", "Naam van de primaire contactpersoon"],
  ["{{partner_naam}}", "Naam van de sponsor of partner"],
  ["{{event_naam}}", "Naam van het event"],
  ["{{event_datum}}", "Datum en uur van het event"],
  ["{{event_locatie}}", "Locatie of Online"],
  ["{{vergadering_naam}}", "Naam van de vergadering"],
  ["{{vergadering_datum}}", "Datum en uur van de vergadering"],
  ["{{opvolgdatum}}", "Geplande opvolgdatum"],
  ["{{nieuwsbrief_titel}}", "Interne titel van de nieuwsbrief"],
  ["{{nieuwsbrief_inhoud}}", "Inhoud van de nieuwsbrief"],
] as const;

export type EmailTemplateContext = Record<string, string | null | undefined>;

export function renderEmailTemplate(template: string, context: EmailTemplateContext) {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (placeholder, key: string) => {
    const value = context[key];
    return value === null || value === undefined || value === "" ? placeholder : value;
  });
}

export function unresolvedEmailVariables(value: string) {
  return [...new Set(value.match(/\{\{[a-z_]+\}\}/g) ?? [])];
}
