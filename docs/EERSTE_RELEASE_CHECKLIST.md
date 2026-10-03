# V1 releasechecklist

Dit document is de vaste checklist voor de eerste volledig werkende versie van het BESC Command Center.

Doel voor v1: de app moet met echte BESC-data werken, de kernflows moeten bruikbaar zijn en de belangrijkste schermen moeten visueel netjes genoeg zijn voor dagelijks gebruik.

## Werkwijze

- Werk module per module af.
- Gebruik eerst lokale ontwikkeling op `http://localhost:3001`.
- Voeg echte data gecontroleerd toe via de templates in `docs/data-templates`.
- Test per module minstens: openen, zoeken/filteren, record aanmaken, record bewerken, koppelen, archiveren/inactiveren en rechtencontrole.
- Na elke afgeronde technische stap: lint/test draaien, commit maken en pushen naar GitHub.
- Productie/VPS komt pas nadat de v1-flow lokaal en/of in preview klopt.

## Statuslegende

- [x] Klaar of reeds getest
- [ ] Nog te doen
- [~] In uitvoering of gedeeltelijk klaar

Laatste acceptatieronde: 2 oktober 2026, DEV-omgeving. De vinkjes hieronder zijn alleen bijgewerkt voor flows die in de chat of tijdens de DEV-rooktest expliciet als geslaagd zijn bevestigd.

## 1. Lokale basis en bronbeheer

- [x] Project staat op de D-schijf: `D:\BESC\Command Center`.
- [x] Docker Desktop werkt.
- [x] Webapp draait lokaal via Docker op `http://localhost:3001`.
- [x] Supabase draait lokaal.
- [x] Lokale database is bijgewerkt met de nieuwste migraties.
- [x] Adminaccount werkt.
- [x] Vrijwilligersaccount werkt.
- [x] Sponsorportaal-testaccount werkt.
- [x] Test-sponsor `GameGear` bestaat lokaal.
- [x] Werk gebeurt op een aparte branch.
- [x] Afgeronde codewijzigingen worden naar GitHub gepusht.
- [ ] Voor v1 een releasebranch of pull request naar `main` voorbereiden.

## 2. Echte basisdata

Gebruik hiervoor de CSV-templates in `docs/data-templates`.

- [ ] Definitieve lijst gebruikers invullen: beheerders, bestuur, medewerkers, vrijwilligers, portaalgebruikers.
- [ ] Rollen per gebruiker controleren.
- [ ] Sponsors en contactpersonen invullen.
- [ ] Streamers/creators invullen.
- [ ] Lopende projecten invullen.
- [ ] Geplande events invullen.
- [ ] Lopende campagnes invullen.
- [ ] Materiaal- en resourceslijst invullen.
- [ ] Belangrijke kennisbankartikels aanvullen met echte BESC-procedures.
- [ ] Financiele basisdata invullen: categorieen, budgetten, onkostenflow, eventuele testboekingen.
- [ ] Nieuwsbrief- en communicatiesjablonen aanvullen met echte BESC-teksten.

## 3. Rollen en toegang

- [x] Beheerder kan inloggen en de interne app openen.
- [x] Vrijwilliger kan inloggen met beperkte interne toegang.
- [x] Portaalgebruiker komt in het sponsorportaal terecht.
- [x] Portaalgebruiker krijgt geen interne `/app`-toegang.
- [x] Gebruikersbeheer getest: gebruiker activeren, rol wijzigen en toegang intrekken.
- [x] Rechtenbeheer getest: custom rol aanmaken, toewijzen en verwijderen.
- [ ] Bestuur testen met echte bestuursaccount.
- [ ] Medewerker testen met echte medewerkersaccount.
- [ ] Vrijwilliger testen met echte vrijwilligersaccount.
- [ ] Sponsorportaal testen met echte sponsorcontactpersoon.
- [ ] Streamerportaal testen zodra streameraccounts gekoppeld zijn.

## 4. Mijn werkplek

### Aanwezig

- Home/dashboard
- Meldingen
- Mijn werk/taken
- Inbox
- Kalender
- Goedkeuringen

### V1-check

- [ ] Inboxitem indienen als medewerker.
- [ ] Inboxitem indienen als vrijwilliger indien toegestaan.
- [ ] Bestuur ziet alle inboxitems.
- [ ] Medewerker ziet eigen ingediende items.
- [ ] Inboxitem omzetten naar project.
- [ ] Inboxitem omzetten naar event.
- [ ] Inboxitem omzetten naar campagne.
- [ ] Inboxitem omzetten naar content.
- [ ] Taak aanmaken en toewijzen.
- [ ] Taakstatus aanpassen.
- [x] Kalenderitem vanuit event controleren.
- [x] Goedkeuringsflow testen met echte gebruiker.
- [ ] UI-polish: lege staten, knoppen, spacing en mobiele weergave controleren.

## 5. Planning en uitvoering

### Modules

- Projecten
- Events
- Campagnes
- Social planning

### V1-check

- [x] Project aanmaken met testdata.
- [ ] Taken koppelen aan project.
- [ ] Event koppelen aan project.
- [ ] Campagne koppelen aan project.
- [ ] Content koppelen aan project.
- [x] Event aanmaken met datum, locatie, eigenaar en status.
- [ ] Event koppelen aan campagne en content.
- [ ] Campagne aanmaken met sponsor, doel, planning en resultatenvelden.
- [ ] Social post plannen vanuit campagne/content.
- [ ] Archiveren/inactiveren testen waar voorzien.
- [ ] Bestuur kan bewerken maar niet ongecontroleerd verwijderen.
- [ ] Medewerker kan samenwerken maar gevoelige acties blijven beperkt.
- [ ] UI-polish: detailpagina's, tabellen en formulieren nalopen.

## 6. Relaties en communicatie

### Modules

- Community en vrijwilligers
- Sponsors en CRM
- Communicatie

### V1-check

- [ ] Communitypersoon aanmaken met echte rol en contactgegevens.
- [ ] Vrijwilliger/streamer correct onderscheiden.
- [ ] Sponsor aanmaken met contactpersoon.
- [ ] Sponsorstatus en opvolging testen.
- [ ] Communicatie-item registreren.
- [ ] Nieuw contact/sponsor indienen als medewerker en laten goedkeuren.
- [ ] Portaalgebruiker ziet alleen eigen sponsorportaal.
- [ ] UI-polish: contactkaarten, lange namen/e-mails en mobiele weergave controleren.

## 7. Content en publicatie

### Modules

- Content
- Shop en merchandise
- Nieuwsbrieven
- AI Hub

### V1-check

- [ ] Contentitem aanmaken vanuit inbox.
- [ ] Content koppelen aan project/event/campagne/sponsor.
- [ ] Contentstatus en goedkeuring testen.
- [ ] Shopproduct of merchandise-item aanmaken.
- [ ] Nieuwsbriefsjabloon aanmaken of aanpassen.
- [ ] Nieuwsbriefvoorbeeld bekijken.
- [ ] Publieke inschrijving testen.
- [ ] Bevestigingsflow testen.
- [ ] Uitschrijfflow testen.
- [ ] BCC en verzendcontrole testen.
- [x] AI Hub als optionele placeholder buiten de verplichte v1-kernflow houden.
- [ ] UI-polish: editorvelden, preview en lege staten controleren.

## 8. Organisatie

### Modules

- Vergaderingen en besluiten
- VZW-administratie
- Financien
- Materialen en resources
- Kennisbank

### V1-check

- [ ] Vergadering aanmaken met agenda.
- [ ] Besluit registreren.
- [ ] Actiepunt uit vergadering opvolgen.
- [ ] Administratief document registreren.
- [ ] Onkost indienen als medewerker.
- [ ] Onkost goedkeuren als bestuur/finance.
- [ ] Financiele basisrapporten controleren.
- [ ] Materiaal/resource aanmaken met locatie, waarde en aankoopinformatie.
- [ ] Materiaal/resource koppelen aan project/event/campagne/taak waar voorzien.
- [ ] Kennisbankcategorieen controleren.
- [ ] Echte kennisbankartikels aanvullen.
- [ ] Kennisbank zichtbaarheidsregels testen voor vrijwilliger/medewerker/bestuur.
- [ ] UI-polish: kaarten, tabellen, dropdowns en tekstafbreking controleren.

## 9. Inzichten

### Modules

- Rapportage en KPI
- Social inzichten
- Managementoverzicht
- Sponsorrapportage
- Streamerrapportage

### V1-check

- [ ] KPI registreren met echte definitie, bron en periode.
- [ ] Rapportagefilter testen.
- [ ] CSV-export testen.
- [ ] Managementoverzicht testen.
- [x] Social inzichten tonen echte gekoppelde Facebook- en Instagramdata waar beschikbaar.
- [ ] Sponsorrapportage heeft dropdown voor sponsorselectie.
- [ ] Sponsorrapportage toont alleen bedrijven met rol Sponsor en status Actief.
- [ ] Bestuur en medewerker kunnen elke sponsorpagina raadplegen.
- [ ] Streamerrapportage heeft dropdown voor streamerselectie.
- [ ] Streamerrapportage toont alleen actieve profielen met rol Streamteam; streamteamniveau is niet verplicht.
- [ ] Bestuur en medewerker kunnen elke streamerpagina raadplegen.
- [ ] Sponsorportaalgebruiker ziet alleen eigen sponsorrapport.
- [ ] Streamer ziet alleen eigen streamerportaal zodra portaal actief is.
- [ ] PDF-export testen waar voorzien.
- [ ] UI-polish: padding, kaartbreedtes, labels versus klikbare tekst, dark mode.

## 10. Beheer

### Modules

- Integraties
- Rechtencontrole
- Gebruikers en toegang
- Activiteit
- Archief
- Historiek

### V1-check

- [x] Discord login en accountkoppeling getest.
- [x] Google Workspace-koppeling getest.
- [x] YouTube OAuth en sync getest.
- [x] Twitch OAuth en sync getest.
- [x] Facebook/Instagram via Meta getest.
- [x] Threads niet gebruiken in v1.
- [x] X niet gebruiken in v1.
- [x] Gmail-flow volledig testen.
- [ ] Integratiepagina's met ontbrekende env-variabelen duidelijk controleren.
- [ ] Rechtenmatrix opnieuw controleren na echte rollen.
- [ ] Gebruikersbeheer met echte accounts testen.
- [ ] Activiteitenlog controleren.
- [ ] Archief en herstel/raadpleging testen.
- [ ] Historiekweergave controleren.
- [ ] UI-polish: beheerpagina's, tabellen en mobiele overflow controleren.

## 11. Portalen

- [x] Sponsorportaal-testaccount werkt.
- [x] GameGear-testcase werkt.
- [ ] Echte sponsor koppelen aan portaalgebruiker.
- [ ] Sponsorportaal testen met echte sponsordata.
- [ ] Streamerportaal activeren/testen met echte streamer.
- [ ] Portaalrechten controleren: geen interne navigatie, geen data van anderen.
- [ ] UI-polish: portaalpagina's geschikt maken voor externe gebruikers.

## 12. Techniek, kwaliteit en release

- [x] `pnpm run lint`
- [x] `pnpm test`
- [x] `pnpm run build`
- [ ] Docker build controleren.
- [x] Korte browsercontrole op desktop.
- [ ] Korte browsercontrole op mobiel formaat.
- [ ] Dark mode volledige app nalopen.
- [x] Geen fouten bij de gecontroleerde kernflows tijdens de DEV-rooktest.
- [ ] Geen ontbrekende env-variabelen voor actieve v1-modules.
- [ ] Databasebackup maken.
- [ ] Restore-test uitvoeren.
- [ ] Productievariabelen voorbereiden.
- [ ] Definitieve domeinnaam kiezen.
- [ ] VPS of productiehosting klaarzetten.
- [x] DEV-deployprocedure uitvoeren.
- [ ] Productierooktest uitvoeren.

## Eerste focusronde

Deze ronde werken we eerst aan:

1. Echte basisdata verzamelen via de templates.
2. Gebruikers en rollen valideren.
3. Sponsors, streamers, projecten, events, campagnes en materialen invoeren.
4. Kernflows testen met die echte data.
5. UI-polish oplossen op schermen die tijdens het testen zichtbaar fout lopen.

## Data-aanlevering

Vul bij voorkeur eerst deze bestanden aan:

- `docs/data-templates/users.csv`
- `docs/data-templates/sponsors.csv`
- `docs/data-templates/streamers.csv`
- `docs/data-templates/projects.csv`
- `docs/data-templates/events.csv`
- `docs/data-templates/campaigns.csv`
- `docs/data-templates/materials.csv`
- `docs/data-templates/knowledge.csv`

Stuur de ingevulde bestanden terug of plak de inhoud in de chat. Daarna zet ik de data gecontroleerd in de lokale database en testen we module per module.
