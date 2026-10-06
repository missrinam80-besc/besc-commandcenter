# V1 releasechecklist

Dit document is de vaste checklist voor de eerste volledig werkende versie van het BESC Command Center.

Doel voor v1: de app moet met echte BESC-data werken, de kernflows moeten bruikbaar zijn en de belangrijkste schermen moeten visueel netjes genoeg zijn voor dagelijks gebruik.

## Werkwijze

- Werk module per module af.
- Ontwikkel en test wijzigingen lokaal; Cloud Supabase en de bestaande DEV-server zijn het acceptatiedoel voor V1.
- Voeg echte data gecontroleerd toe via de templates in `docs/data-templates`.
- Test per module minstens: openen, zoeken/filteren, record aanmaken, record bewerken, koppelen, archiveren/inactiveren en rechtencontrole.
- Na elke afgeronde technische stap: lint/test draaien, commit maken en pushen naar GitHub.
- Releasevolgorde: GitHub-PR → goedgekeurde merge → geslaagde DEV-imagebouw → eventuele Cloud DEV-migratie → deploy via het bestaande server-script → live acceptatie. Bouw geen image op de server uit losse lokale code.
- Productie-inrichting valt buiten de huidige DEV-acceptatie; zij is geen blokkade voor deze V1-ronde.

## Statuslegende

- [x] Klaar of reeds getest
- [ ] Nog te doen
- [~] In uitvoering of gedeeltelijk klaar

Laatste aanvulling: 6 oktober 2026, DEV. De herstelproeven van 6 oktober zijn uitgevoerd met wegwerpdata en de beheerdersaccount. Oudere vinkjes blijven historische bevestigingen van 2 oktober; zij bewijzen geen recente hertest van alle rollen of integraties. Alleen specifiek genoemde controles zijn bijgewerkt. De vier nieuwe herstelpunten in deze PR zijn lokaal getest; hun migratie, deploy en live acceptatie staan nog open.

## 1. Ontwikkeling, bronbeheer en DEV

- [x] Bronrepository: `missrinam80-besc/besc-commandcenter` op GitHub.
- [x] Bestaande ontwikkelrepository: `D:\CODING\besc-commandcenter`; herstelwerk gebeurt in een aparte werkcheckout en branch.
- [x] Cloud Supabase is het DEV-databasedoel: `sjvzrsmrtcxxtmaxigtn`.
- [x] DEV-app: `https://cc-dev.belgianstreamerscommunity.be`.
- [x] Servercheckout: `/opt/besc-dev/command-center`; deploy gebruikt `docker-compose.server.yml`.
- [x] Image komt uit de GitHub-build: `ghcr.io/missrinam80-besc/besc-commandcenter:dev`.
- [x] Beheerdersaccount werkt bij de DEV-proeven van 6 oktober.
- [x] Wijzigingen worden via afzonderlijke PR's beoordeeld en naar `main` gemerged.
- [x] Communityrollen-migratie en PR #50 zijn gedeployed; de afgesproken beheerderproeven zijn geslaagd.
- [ ] Na deze PR: nieuwe campagne-/relatiemigratie toepassen, image deployen en live acceptatie uitvoeren.

Lokale Docker-/databasechecks en de GameGear-portaaltest uit de oude checklist zijn historische controles. Een lokaal draaiende Supabase is niet het huidige DEV-doel.

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
- [x] Taak aanmaken en aan eigen account toewijzen met wegwerpdata (6 oktober, beheerder; PR #45/#46).
- [x] Taakstatus aanpassen en heropenen met wegwerpdata (6 oktober, beheerder; PR #45).
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
- [x] Campagne en content archiveren, herstellen en verwijderen met wegwerpdata (6 oktober, beheerder).
- [x] Project afsluiten alleen na ingevulde doel/resultaat/evaluatievelden; heropenen gecontroleerd (PR #43).
- [x] Gewone campagnewijziging bevestigd; verouderd formulier na verwijdering geweigerd met beschikbaarheidsmelding (PR #48/#49).
- [ ] Bestuur kan bewerken maar niet ongecontroleerd verwijderen.
- [ ] Medewerker kan samenwerken maar gevoelige acties blijven beperkt.
- [ ] UI-polish: detailpagina's, tabellen en formulieren nalopen.

## 6. Relaties en communicatie

### Modules

- Community en vrijwilligers
- Sponsors en CRM
- Communicatie

### V1-check

- [x] Communityprofiel met meerdere rollen aanmaken, naam/rollen wijzigen, rollen leegmaken en verouderd formulier afwijzen (6 oktober, beheerder; PR #50).
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
- [x] Gewone contenttekstwijziging behoudt bestaande relaties (door gebruiker bevestigd na PR #38).
- [x] Content aan tijdelijk communityprofiel koppelen; oude koppelkeuze na profielverwijdering afwijzen (PR #50).
- [x] Verwijderde gerelateerde taak verdwijnt uit dossierweergave (PR #47).
- [ ] Content koppelen aan project/event/campagne/sponsor met echte gegevens en relevante gebruikersrollen.
- [x] Content aanmaken, bewerken, archiveren, herstellen en verwijderen met wegwerpdata (beheerder; PR #41).
- [ ] Contentstatus en goedkeuring testen met relevante gebruikersrollen.
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
- [x] Archief/herstel van campagne en content gecontroleerd met wegwerpdata als beheerder.
- [ ] Archief en herstel/raadpleging over overige modules en gebruikersrollen testen.
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
- [x] GitHub DEV-imagebouw en serverdeploy tot en met PR #50 geslaagd.
- [ ] Nieuwe DEV-image van deze PR na merge controleren.
- [x] Korte browsercontrole op desktop.
- [ ] Korte browsercontrole op mobiel formaat.
- [ ] Dark mode volledige app nalopen.
- [x] Afgesproken herstelproeven tot en met PR #50 geslaagd binnen hun beschreven scope; dit is geen volledige app-audit.
- [ ] Geen ontbrekende env-variabelen voor actieve v1-modules.
- [ ] Databasebackup maken.
- [ ] Restore-test uitvoeren.
- [ ] Productievariabelen voorbereiden.
- [ ] Definitieve domeinnaam kiezen.
- [ ] VPS of productiehosting klaarzetten.
- [x] DEV-deployprocedure uitvoeren.
- [ ] Productierooktest uitvoeren.

## Eerstvolgende herstel- en acceptatieronde

1. Deze PR reviewen en mergen; wachten op de geslaagde GitHub-imagebouw.
2. `20261006205557_atomic_campaign_and_relationships.sql` op Cloud DEV toepassen en controleren.
3. DEV deployen en de [campagne-/relatieproeven](campaign-links-release-dev-rollout.md) uitvoeren.
4. Daarna de open rechtenproeven met bestuur, medewerker, vrijwilliger en portaalgebruiker uitvoeren.
5. Integraties opnieuw controleren vóór echte-data-invoer en brede acceptatie.
6. Echte basisdata verzamelen, gecontroleerd invoeren en de kernflows met die gegevens testen; desktop, mobiel en dark mode beoordelen.

Productiepunten hierboven zijn voorbereiding voor een latere productieronde, geen afgeronde DEV-controles.

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

Stuur de ingevulde bestanden terug of plak de inhoud in de chat. Daarna bereiden we gecontroleerde invoer naar Cloud DEV voor en testen we module per module. Echte-data-invoer blijft een afzonderlijk goedgekeurde stap.
