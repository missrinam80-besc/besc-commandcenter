# Roadmapstatus BESC Command Center

Laatste technische controle: 9 augustus 2026.

## Afgerond in de applicatie

- Fase 0 — gedeelde dossierstandaard, schema-audit en rechtenmodel.
- Fase 1 — metadata, datumweergave, modals, lifecycle en directe gebruiksproblemen.
- Fase 2 — gelabelde links, relaties, documenten, centraal archief en gedeelde taakflow.
- Fase 3 — centraal personen-/ledenmodel, accounts, rollen en portaalrechten.
- Fase 4 — verdiepte projecten, events en campagnes.
- Fase 5 — Drive, Calendar, documenten, communicatie en sjablonen.
- Fase 6 — operationele financiën, activa en shoprelaties.
- Fase 7 — managementrapportage, sponsor-/streamerportalen, CSV/PDF en pitchdecks.
- Fase 8 — publieke nieuwsbriefinschrijving, dubbele bevestiging, uitschrijving, HTML-templates en dark mode.
- Fase 8 — generiek beveiligd social-accountmodel met Vault, quota, audit en dagelijkse sync.
- Fase 8 — YouTube, Facebook, Instagram en Twitch als officiële API-pilots; Threads en X blijven beslispoorten voor later.
- Fase 9 — kennisbankmodule, command-centerhandleiding, procesdocumentatie en beheerd publicatieproces.
- Fase 10 — contextuele hulp, onboardinglinks en directe helpnavigatie vanuit de applicatie.
- Fase 11 — productieacceptatiepagina met technische checks, datachecks, handmatige rooktest en beslispoorten.

## Externe acceptatie nodig

De code is aanwezig, maar deze koppelingen zijn pas operationeel nadat BESC de appgegevens en platformtoegang heeft ingesteld:

| Pilot | Externe actie | Technische test |
|---|---|---|
| YouTube | OAuth-client en juiste API's activeren | koppelen, handmatige sync, cronrun, rapport controleren |
| Facebook/Instagram | Meta Business-app, scopes en eventueel App Review | pagina/account koppelen, sync en partial errors controleren |
| Twitch | vertrouwelijke Twitch-app en redirect URI | koppelen, live-status/planning en tokenrefresh controleren |

## Bewuste beslispoorten

Deze onderdelen zijn volgens de goedgekeurde roadmap niet zonder nieuwe beslissing te bouwen:

- **Threads:** niet gebruiken in de eerste versie; pas opnieuw opnemen wanneer BESC beslist dat de extra OAuth- en platformvoorwaarden de moeite waard zijn.
- **LinkedIn:** pas na Community Management-producttoegang.
- **TikTok:** pas na productgoedkeuring en audit.
- **X:** pas na expliciet API-budget en ingestelde kostenlimiet.
- **Volledige vzw-boekhouding:** pas na schriftelijke validatie door de boekhouder van regime, rapporten, bewaartermijnen, correcties en afsluitingen.
- **AI Hub-verdieping:** verdere AI-automatisering pas per concrete werkstroom, eigenaar, brondata en kostenlimiet.

Een gesloten beslispoort is geen defect of onafgewerkte implementatie. Zodra de voorwaarde aantoonbaar vervuld is, wordt ze een afzonderlijke bouw- en acceptatieronde.

## Finale productieacceptatie

1. Alle variabelen uit `.env.example` die voor actieve modules nodig zijn in Vercel zetten.
2. OAuth redirect URI's exact bij de providers registreren.
3. Previewdeployment uitvoeren en inloggen als beheerder, bestuurslid, vrijwilliger en portaalgebruiker.
4. Per kernmodule aanmaken, bewerken, koppelen, archiveren en verwijderen testen.
5. Drive-, Calendar-, Gmail-, nieuwsbrief- en socialflows met echte BESC-testdata uitvoeren.
6. Cronroute gecontroleerd aanroepen en dubbele runs/idempotentie controleren.
7. Rapporten online en als CSV/PDF vergelijken.
8. Supabase Security en Performance Advisors controleren.
9. Productie deployen en dezelfde rooktest herhalen.
10. Beslispoorten en bekende platformbeperkingen formeel accepteren.
