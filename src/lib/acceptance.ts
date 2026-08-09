export const acceptanceChecks = [
  { key: "auth-roles", category: "Login & accounts", title: "Login testen als beheerder, bestuurslid, vrijwilliger en portaalgebruiker." },
  { key: "account-lifecycle", category: "Login & accounts", title: "Account aanmaken, goedkeuren, profiel aanpassen, Discord koppelen en uitloggen." },
  { key: "inbox-conversion", category: "Werkflow", title: "Inboxitem maken en omzetten naar taak of dossier." },
  { key: "core-records", category: "Werkflow", title: "Project, event, campagne en taak aanmaken, bewerken, koppelen, archiveren en verwijderen." },
  { key: "drive-folders", category: "Google Workspace", title: "Drive-map maken voor project en event; documentregister controleren." },
  { key: "calendar-sync", category: "Google Workspace", title: "Event en vergadering synchroniseren naar Google Calendar; geannuleerd item verwijderen." },
  { key: "generated-documents", category: "Google Workspace", title: "Notulen, eventdossier en sponsorrapport genereren en ter goedkeuring voorleggen." },
  { key: "gmail-approval", category: "Communicatie", title: "Gmail-concept maken, laten goedkeuren, versturen en dossiercommunicatie controleren." },
  { key: "newsletter-flow", category: "Communicatie", title: "Nieuwsbriefinschrijving, bevestiging, uitschrijving en goedgekeurde verzending testen." },
  { key: "reporting-exports", category: "Rapportage", title: "Rapportage online, CSV/PDF en managementoverzichten vergelijken." },
  { key: "social-pilots", category: "Integraties", title: "Social accounts koppelen en handmatige sync per actief platform uitvoeren." },
  { key: "production-smoke", category: "Release", title: "Productiedeployment uitvoeren en dezelfde rooktest herhalen." },
] as const;

export const acceptanceStatuses = ["pending", "passed", "failed", "blocked", "not_applicable"] as const;

export function acceptanceStatusLabel(status: string) {
  if (status === "passed") return "Geslaagd";
  if (status === "failed") return "Mislukt";
  if (status === "blocked") return "Geblokkeerd";
  if (status === "not_applicable") return "Niet van toepassing";
  return "Te testen";
}
