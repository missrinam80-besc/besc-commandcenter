export const ticketStatuses = { open: "Open", in_progress: "In behandeling", waiting_requester: "Wacht op aanvrager", closed: "Gesloten" } as const;
export const ticketLinkLabels: Record<string, string> = { pending: "Discord wordt gekoppeld", linked: "Discord gekoppeld", failed: "Koppeling mislukt", uncertain: "Koppeling controleren" };
export const ticketDeliveryLabels: Record<string, string> = { pending: "Wacht op verzending", leased: "Wordt verwerkt", delivered: "Afgeleverd", failed: "Aandacht nodig", uncertain: "Uitkomst controleren" };
export const ticketErrors: Record<string, string> = {
  version_conflict: "Dit ticket is intussen gewijzigd. Vernieuw de pagina en probeer opnieuw.",
  assignee_forbidden: "Deze medewerker heeft geen actuele ticketrechten.",
  ticket_closed: "Dit ticket is gesloten. Alleen herstel van een Discordopdracht is nog mogelijk.",
  thread_unavailable: "De Discordkoppeling is nog niet beschikbaar. Controleer eerst de koppeling.",
  invalid_content: "Vul een bericht van 1 tot 4000 tekens in.",
  invalid_status: "Kies een geldige ticketstatus.",
  ticket_unavailable: "Het ticket is niet beschikbaar binnen deze organisatie.",
  upstream_unavailable: "De wijziging kon niet worden opgeslagen. Probeer opnieuw.",
};
