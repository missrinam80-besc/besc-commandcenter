# BESC Command Center — analyse en uitvoeringsplan

> Historische notitie. Dit document bewaart het ontwerp of de controle op de genoemde datum; het is geen actuele werkvoorraad. Zie de [wiki](../README.md) en [huidige releasewerkwijze](../Release-en-acceptatie.md).

Datum: 3 augustus 2026  
Bron: `Aanpassingen tool.xlsx`  
Omvang: 90 opmerkingen, verdeeld over 18 functionele domeinen

## 1. Samenvatting

De feedback vraagt niet in de eerste plaats om nog meer losse modules. De belangrijkste behoefte is een consequente **dossierfiche** die in elke module hetzelfde werkt:

- alle ingevulde metadata is ook in de leesweergave zichtbaar;
- taken, personen, projecten, events, campagnes, documenten en communicatie zijn vanuit het dossier te koppelen en te beheren;
- toevoegen en bewerken gebeurt in modals, zonder de context van het dossier te verlaten;
- archiveren en verwijderen staat compact en herkenbaar op dezelfde plaats;
- Google Drive bewaart de bestanden; Supabase bewaart alleen relaties, labels en metadata;
- dezelfde persoon wordt niet opnieuw ingevoerd als gebruiker, vrijwilliger, bestuurslid, creator of contactpersoon.

Veel technische bouwstenen bestaan al. De efficiëntste aanpak is daarom eerst een gedeelde dossierlaag te bouwen en die vervolgens per module uit te rollen. Portalen, automatische social analytics en volledige boekhouding komen pas daarna.

## 2. Inventaris per domein

| Domein | Aantal | Belangrijkste feedback |
|---|---:|---|
| Projecten | 11 | Drive-weergave vereenvoudigen, gelabelde links, taken sorteren/bewerken, mijlpalen beheren, doel/team/relaties/budget toevoegen |
| Taken | 2 | Checklist en verantwoordelijke bij aanmaak; activiteitensectie verwijderen |
| Algemeen | 12 | Tooltips, Markdown, zoekbare persoonskiezer, documentcreatie, centraal archief, activa, rapporten, volledige metadata, consistente lifecycle, accounts en rollen |
| Events | 12 | Compacte Calendar/Drive-bediening, gelabelde links, personen en campagnes koppelen, alle metadata tonen, documenten vanuit dossier, workshops |
| Campagnes | 7 | Typesjablonen, deliverables scheiden van taken, content/social koppelen, evaluatie en later platformmetrics |
| Social planning | 1 | Doel verduidelijken en later eigen analytics voorzien |
| Community | 5 | Intakeformulieren, aparte doelgroepen, onboarding verduidelijken, personen aan accounts koppelen, compacte lifecycle |
| Sponsors & CRM | 7 | Rapport op fiche, Drive-map, volledige metadata, contacten en historiek volledig beheren, later sponsorportaal |
| Communicatie | 5 | Herbruikbare sjablonen, variabelencatalogus, duidelijkere terminologie, sponsorselectie en BCC |
| UI | 1 | Dark mode |
| Content | 1 | Eigen Drive-map en meerdere platformlinks |
| Shop | 3 | Planning uitbreiden, producttypes/producenten onderscheiden, module verdiepen |
| Nieuwsbrieven | 3 | Meerdere visuele/HTML-sjablonen, afbeeldingen, uitschrijven en publieke inschrijving |
| AI Hub | 1 | Voorlopig inactief houden |
| Vergaderingen | 5 | Actiepunten als taken, typesjablonen, PDF-verslag, statustekst verduidelijken, uitnodigingen via mail/Discord |
| VZW-administratie | 4 | Centraal ledenregister, documentregister, statutaire deadlines, mandaten aan leden koppelen |
| Financiën | 2 | Consistente tabnavigatie en later volwaardige vzw-boekhouding |
| Rapportage | 7 | KPI-relaties, sponsor/streamer/event/financiële/social rapporten, PDF's en pitchdecks |

Totaal: **90**.

## 3. Wat al bestaat en wat werkelijk nieuw is

### Bestaande basis die we moeten hergebruiken

- modals voor aanmaken en bewerken;
- Markdown invoer en weergave;
- taakchecklists en taaktoewijzing;
- projectmijlpalen en projectleden;
- archiveren en soft-delete;
- Google Drive- en Calendar-metadata via `google_resource_links`;
- documentregister en Google-documenttemplates;
- Gmail-concepten, goedkeuringen en communicatieregistratie;
- campagne-deliverables;
- vergaderactiepunten met koppeling naar taken;
- financiële budgetten, kosten en financiële documenten;
- KPI- en managementrapportage;
- gebruikers, organisatielidmaatschap en rollen.

### Vooral afwerking of uitbreiding van bestaande functies

- alle velden tonen in de leesweergave;
- ruwe ISO-datums correct formatteren;
- formulieren consequent in modals openen;
- archiveren/verwijderen compacter en uniform maken;
- Drive-ID's en overbodige Drive-URL-velden verbergen;
- taken chronologisch tonen en vanuit een dossier bewerken;
- mijlpalen, sponsorcontacten en contacthistoriek kunnen wijzigen/verwijderen;
- Calendar-, Drive-, e-mail- en documentacties logisch groeperen;
- betere teksten, tooltips en lege toestanden;
- communicatie uitbreiden met BCC, aparte sponsorselectie en een variabelencatalogus.

### Nieuwe gedeelde mogelijkheden

- een generiek systeem voor meerdere gelabelde links per dossier;
- een zoekbare persoonskiezer;
- één centraal personen-/ledenmodel met optionele accountkoppeling en meerdere rollen;
- generieke relaties tussen projecten, events, campagnes, content, sponsors, mensen en financiële records;
- typesjablonen voor campagnes, meetings en andere dossiers;
- activa-, leveranciers- en producentenbeheer;
- centraal archief over alle modules;
- rapportgeneratie per dossier en doelgroep.

### Grote uitbreidingen voor later

- streamerportaal en sponsorportaal;
- automatische socialmediastatistieken via platform-API's;
- volledige vzw-boekhouding en wettelijke rapportering;
- geavanceerde HTML-nieuwsbrieven met beeldbeheer;
- publieke inschrijf- en intakeformulieren;
- pitchdeckgenerator;
- dark mode.

De AI Hub en kennisbank blijven voorlopig aanwezig maar inactief. Ze worden niet verwijderd en krijgen in deze ronde geen uitbreidingsbudget.

## 4. Aanbevolen productprincipes

1. **Eén persoon, meerdere rollen.** Een persoon krijgt één stamrecord en kan tegelijk vrijwilliger, creator, bestuurslid, medewerker of contactpersoon zijn. Een app-account is een optionele koppeling aan dat record.
2. **Taken zijn de enige uitvoeringsbron.** Vergaderactiepunten kunnen taken worden. Campagnedeliverables beschrijven het beloofde resultaat en kunnen aan contentitems en uitvoeringstaken worden gekoppeld.
3. **Bestanden blijven in Google Drive.** Supabase bewaart alleen map-/document-ID, URL, label, type, status en relatie met het dossier.
4. **Relaties zijn expliciet.** Geen namen kopiëren naar tekstvelden wanneer een project, persoon, sponsor, event of campagne als record kan worden gekoppeld.
5. **Eén dossierpatroon.** Kop, metadata, relaties, documenten, communicatie, activiteit en lifecycle staan in elke module in dezelfde volgorde.
6. **Markdown blijft de standaard.** Dit dekt opmaak zonder een zwaar rich-textformaat of onbetrouwbare HTML-opslag te introduceren.
7. **Eerst handmatige betrouwbare data, daarna API-automatisering.** Publicatielinks en metrics worden eerst correct manueel beheerd; automatische imports volgen pas nadat de datadefinities stabiel zijn.

## 5. Gefaseerd uitvoeringsplan

### Fase 0 — Dossierstandaard en schema-audit

Doel: voorkomen dat dezelfde oplossing per module opnieuw wordt gebouwd.

- ontwerp één vaste dossierlay-out;
- definieer gedeelde componenten voor metadata, acties, relaties, links, documenten en lifecycle;
- inventariseer verplichte en optionele velden per contenttype;
- leg statussen, datumformaten en labels centraal vast;
- ontwerp tabellen voor gelabelde links en generieke dossierrelaties;
- bepaal migraties voor bestaande `drive_url`-velden zonder data te verliezen;
- leg rechten vast voor bekijken, bewerken, goedkeuren, archiveren en verwijderen.

Acceptatie:

- er is één technisch en visueel patroon dat op minstens Projecten, Events en Campagnes toepasbaar is;
- bestaande Drive-, document- en lifecycledata blijven behouden;
- elke feedbackregel is aan een fase gekoppeld.

Indicatie: 1 korte sprint.

### Fase 1 — Consistentie en directe gebruiksproblemen

Doel: de huidige app dagelijks duidelijker en sneller maken zonder grote datamigraties.

- toon alle ingevulde metadata op detailpagina's;
- formatteer datums en tijden in Nederlands formaat;
- sorteer projecttaken logisch op deadline en status;
- open taakbewerking vanuit het project in een modal;
- voeg wijzigen/verwijderen toe aan mijlpalen, sponsorcontacten en contacthistoriek;
- maak archiveren/verwijderen overal compact en consistent;
- vereenvoudig Drive-kaarten: geen Google-ID, geen dubbel Drive-URL-veld;
- groepeer Drive-, Calendar-, document- en e-mailacties;
- voeg tooltips toe waar de functie niet vanzelfsprekend is;
- verduidelijk geannuleerd/uit historiek en onboarding;
- voeg `workshop` als eventtype toe of bevestig de bestaande ondersteuning in de UI;
- maak de financiële tabnavigatie op elk deelscherm gelijk;
- verberg of markeer AI Hub en kennisbank als inactief.

Acceptatie:

- gebruikers hoeven niet meer naar bewerken om reeds ingevulde informatie te lezen;
- geen ruwe ISO-datums op zichtbare fiches;
- de primaire acties staan op voorspelbare plaatsen;
- alle beheerbare subrecords hebben wijzigen en verwijderen waar de rechten dit toelaten.

Indicatie: 1–2 sprints.

### Fase 2 — Herbruikbare dossierfuncties

Doel: de gevraagde relaties en bestanden beheren zonder iedere module apart te programmeren.

- bouw meerdere gelabelde links per dossier;
- bouw de zoekbare persoonskiezer;
- bouw een generiek relatiepaneel voor project, event, campagne, content, sponsor en persoon;
- laat documenten vanuit de fiche aanmaken of koppelen;
- plaats nieuwe documenten automatisch in de gekoppelde modulemap;
- voeg een compacte documentlijst met type, status en link toe;
- maak centraal archief onder Beheer met filters per module, status, periode en eigenaar;
- voeg een consistente taakmodal toe met checklist, verantwoordelijke, projectrelatie en optionele deadline;
- verwijder de overbodige activiteitensectie op de taakfiche, maar behoud auditlogging op systeemniveau.

Acceptatie:

- een dossier kan meer dan één gelabelde link en document bevatten;
- een bestaand record kan vanuit een ander dossier worden gezocht en gekoppeld;
- gebruikers blijven tijdens toevoegen/bewerken op de dossierpagina;
- archiefitems zijn terug te vinden zonder in de operationele lijsten te verschijnen.

Indicatie: 2 sprints.

### Fase 3 — Personen, leden, accounts en rechten

Doel: dubbele persoonsgegevens en losstaande registers verwijderen.

- introduceer een centraal personen-/ledenregister;
- koppel `community_people`, organisatielidmaatschap en gebruikersprofielen gecontroleerd;
- ondersteun meerdere rollen per persoon;
- bouw aparte gefilterde weergaven voor bestuur, crew, vrijwilligers en streamteam;
- koppel mandaten aan ledenrecords;
- maak de accountpagina compact: leesmodus met afzonderlijke modals voor profiel, e-mail, wachtwoord en Discord;
- laat beheerders rechten en rollen vanuit hetzelfde ledenrecord beheren;
- ontwerp intake-/aanmeldformulieren die na goedkeuring een personenrecord opleveren;
- behoud privacygrenzen tussen interne persoonsgegevens en eventuele externe profielen.

Acceptatie:

- dezelfde persoon hoeft niet in meerdere modules opnieuw te worden ingevoerd;
- een persoon kan zonder app-account bestaan en later aan een account gekoppeld worden;
- rollen bepalen zichtbaar en aantoonbaar de toegestane acties;
- bestaande community- en accountdata is gemigreerd of expliciet als mogelijke dubbeling gemarkeerd.

Indicatie: 2–3 sprints, inclusief datamigratie.

### Fase 4 — Projecten, events en campagnes verdiepen

Doel: deze drie modules als echte operationele spil laten werken.

Projecten:

- projectdoel, kernteam, vrijwilligers, sponsors, leveranciers, shops, activa en budget;
- factuur- en financiële relaties;
- campagnes vanuit het dossier aanmaken of koppelen.

Events:

- mensen via de centrale persoonskiezer koppelen;
- campagnes aanmaken/koppelen;
- documenttemplates en eventdossier duidelijk benoemen;
- e-mailconcepten in een modal;
- Drive- en Calendar-acties compact bijeen.

Campagnes:

- sjablonen per campagnetype;
- contentdeliverables scheiden van uitvoeringstaken;
- bestaande en nieuwe content/social posts koppelen;
- evaluatie met publicatielinks en handmatige metrics;
- alle gerelateerde taken, content, posts, sponsors, projecten en events op één fiche.

Acceptatie:

- relaties zijn tweerichtings zichtbaar;
- een deliverable is niet langer een vervanging voor een taak;
- een campagne kan volledig worden opgevolgd zonder informatie naar losse tekstvelden te kopiëren.

Indicatie: 2–3 sprints.

### Fase 5 — Drive, documenten, communicatie en sjablonen

Doel: communicatie en documentproductie vanuit het juiste dossier uitvoeren.

- modulemappen voor sponsors, content en shop naast projecten/events;
- meerdere documenttemplates per dossier- en campagnetype;
- vergaderverslag als Google Doc en exporteerbare PDF;
- event-, sponsor- en campagnerapporten vanuit templates;
- e-mailsjablonen uitbreiden over alle relevante modules;
- centrale pagina met beschikbare templatevariabelen per module;
- hernoem “Variabelen invullen” naar een duidelijke actie zoals “Sjabloon toepassen”;
- aparte sponsorselectie en BCC;
- uitnodigingen voor vergaderingen via e-mail en, als afzonderlijke integratie, Discord;
- communicatie altijd registreren bij het bronrecord.

Acceptatie:

- geen documentbestand wordt in Supabase gekopieerd;
- gegenereerde documenten staan in de juiste Drive-map en zijn in het dossier zichtbaar;
- e-mail wordt pas na menselijke controle verzonden;
- verstuurde communicatie is terug te vinden bij het juiste dossier.

Indicatie: 2–3 sprints.

### Fase 6 — Financiën, activa en shop

Doel: operationele middelen en financiële impact aan dossiers koppelen.

- projectbudget, raming, kosten, inkomsten en facturen;
- centraal activaregister met eigenaar, locatie, status en gekoppeld dossier;
- leveranciers en producenten als herbruikbare relaties;
- shopplanning uitbreiden met project, campagne, personeel, Drive, notities en financiën;
- onderscheid tussen merchandise en Stream Graphics Shop-producten;
- statutaire deadlines automatisch als belangrijke taken en Calendar-items genereren;
- VZW-administratiedocumenten aan het centrale documentregister koppelen;
- eerst operationele financiële administratie vervolledigen; volledige boekhouding pas na juridische/boekhoudkundige validatie.

Acceptatie:

- financiële realisatie is vanuit project/event/campagne herleidbaar;
- activa hebben een verantwoordelijke en locatie;
- wettelijke deadlines hebben een eigenaar, deadline en herinnering;
- boekhoudkundige functies worden niet als wettelijk sluitend voorgesteld zonder validatie.

Indicatie: 3 sprints voor operationele scope; volledige boekhouding is een apart traject.

### Fase 7 — Rapportage en portalen

Doel: management, sponsors en creators bruikbare inzichten geven.

- KPI-records koppelen aan projecten, campagnes, events en acties;
- sponsorrapport per maand en campagne, online en als PDF;
- creator-/streamerresultaten per campagne en project;
- event- en financiële rapporten;
- social inzichten voor BESC en later voor streamteamaccounts;
- periodieke sponsorpitchdecks;
- sponsorviewer met strikt beperkte toegang;
- streamerportaal voor inschrijvingen, deliverables, voortgang en coaching.

Acceptatie:

- ieder rapport vermeldt bron, periode en gehanteerde metricdefinitie;
- externe gebruikers zien uitsluitend hun eigen dossiers;
- PDF/CSV-uitvoer stemt overeen met de online weergave;
- handmatig ingevoerde en automatisch opgehaalde metrics zijn onderscheidbaar.

Indicatie: meerdere sprints; per rapportsoort afzonderlijk opleveren.

### Fase 8 — Onderzoek en latere uitbreidingen

Haalbaarheidsaudit uitgevoerd op 3 augustus 2026. Zie `docs/wiki/historie/phase-8-feasibility-2026-08-03.md` voor de platformvolgorde, privacyvoorwaarden, kostenbesluiten en technische randvoorwaarden.

- officiële platform-API's voor social analytics en publicatie;
- HTML-nieuwsbrieven met afbeeldingen en meerdere templates;
- publieke nieuwsbriefinschrijving en betrouwbaar uitschrijfsysteem;
- volledige vzw-boekhouding;
- dark mode;
- uitbreiding van AI Hub en kennisbank wanneer daar een concrete use-case voor is.

Elke uitbreiding krijgt eerst een korte haalbaarheidsanalyse rond API-toegang, privacy, kosten, eigenaarschap van data en onderhoud.

## 6. Prioriteiten

### P0 — Eerst oplossen

- volledige metadata in leesweergave;
- correcte datumweergave;
- bewerken/verwijderen van bestaande subrecords;
- uniforme lifecycle en centraal archief;
- actiepunten als taken;
- onderscheid tussen deliverables en taken;
- één betrouwbaar personen-/accountmodel.

### P1 — Directe productiviteitswinst

- taakbewerking in dossiermodal;
- gelabelde links;
- documenten vanuit dossiers;
- zoekbare persoonskiezer;
- relaties tussen projecten, events, campagnes, content en sponsors;
- e-mailconcepten en templates op het juiste dossier.

### P2 — Moduleverdieping

- sjablonen;
- projectbudgetten en facturen;
- activa, leveranciers en shop;
- VZW-registers en deadlines;
- uitgebreide rapporten en PDF's.

### P3 — Strategische uitbreidingen

- sponsor- en streamerportalen;
- automatische platformanalytics;
- publieke formulieren en mailinglijsten;
- volledige boekhouding;
- dark mode;
- AI Hub en kennisbank.

## 7. Traceerbaarheid van de 90 opmerkingen

| Feedbacknummers | Verwerkt in |
|---|---|
| 1–11 Projecten | Fase 1, 2, 4 en 6 |
| 12–13 Taken | Fase 1 en 2 |
| 14–25 Algemeen | Fase 0 t/m 3 en 7 |
| 26–37 Events | Fase 1, 2, 4 en 5 |
| 38–44 Campagnes | Fase 4 en 8 |
| 45 Social planning | Fase 8 |
| 46–50 Community | Fase 3 |
| 51–57 Sponsors & CRM | Fase 1, 5 en 7 |
| 58–62 Communicatie | Fase 5 |
| 63 UI | Fase 8 |
| 64 Content | Fase 2 en 5 |
| 65–67 Shop | Fase 6 |
| 68–70 Nieuwsbrieven | Fase 8 |
| 71 AI Hub | Fase 1/8: inactief houden |
| 72–76 Vergaderingen | Fase 1, 2 en 5 |
| 77–80 VZW-administratie | Fase 3, 5 en 6 |
| 81–82 Financiën | Fase 1, 6 en apart boekhoudingstraject |
| 83 Kennisbank | Fase 1/8: inactief houden |
| 84–90 Rapportage | Fase 7 |

## 8. Aanbevolen eerstvolgende bouwronde

Start niet meteen met alle modulewensen. De eerstvolgende ronde wordt één afgebakende **Dossierstandaard-sprint**:

1. gedeelde detailfiche en metadataweergave ontwerpen;
2. datumformatter en gedeelde statuslabels invoeren;
3. compacte lifecyclebalk bouwen;
4. Projecten als eerste referentiemodule ombouwen;
5. regressietests en een volledige handmatige gebruikersrun uitvoeren;
6. hetzelfde patroon pas na goedkeuring uitrollen naar Events en Campagnes.

Daarna volgt de sprint voor gelabelde links, relationele koppelingen en de zoekbare persoonskiezer. Zo ontstaat eerst een stabiel fundament en worden de 90 punten daarna sneller en consistenter afgewerkt.
