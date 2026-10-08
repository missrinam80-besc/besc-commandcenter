# Fase 1 — release candidate voorbereiden

> Historische notitie. Dit document bewaart het ontwerp of de controle op de genoemde datum; het is geen actuele werkvoorraad. Zie de [wiki](../README.md) en [huidige releasewerkwijze](../Release-en-acceptatie.md).

Status: voorbereiding gestart op 18 september 2026
Doel: de bestaande technische V1-basis gecontroleerd klaarmaken voor echte BESC-data, echte accounts en een reproduceerbare acceptatieronde.

## Uitgangspunt

De automatische kwaliteitscontroles zijn groen: 167 tests slagen, lint slaagt en de productiebuild compileert. Fase 1 is daarom geen nieuwe featurefase. Het is een gecontroleerde validatie van de bestaande applicatie vóór livegang.

De volgorde is bewust. Omdat de integraties eerst opnieuw gekoppeld moeten worden, geldt vanaf nu deze aangepaste volgorde:

1. integraties en serverconfiguratie opnieuw koppelen;
2. integratierooktest uitvoeren;
3. data en accounts voorbereiden;
4. rollen en kernflows lokaal testen;
5. backup en restore aantonen;
6. preview/release candidate opleveren;
7. pas daarna productie publiceren.

De concrete volgorde en checklist staan in [`FASE_1_INTEGRATIES_HERKOPPELEN.md`](FASE_1_INTEGRATIES_HERKOPPELEN.md).

## Fase-1-gates

Een gate is pas klaar wanneer er een datum, tester, omgeving en bewijslink of korte bevinding is ingevuld.

| Gate | Resultaat | Status |
|---|---|---|
| G1 — brondata | CSV-aanlevering gecontroleerd en importeerbaar | [ ] |
| G2 — accounts | echte rollen en portaaltoegang gevalideerd | [ ] |
| G3 — kernflows | aanmaken, bewerken, koppelen, lifecycle en rechten getest | [ ] |
| G4 — integraties | Google, Gmail, social en nieuwsbrief bevestigd | [ ] |
| G5 — dataherstel | backup én restore-test uitgevoerd | [ ] |
| G6 — release candidate | preview, rooktest en beslispoorten afgerond | [ ] |

## 1. Aan te leveren data

Gebruik de bestaande sjablonen in `docs/data-templates`. Vul geen wachtwoorden, tokens of API-sleutels in CSV-bestanden in.

| Bestand | Minimale inhoud | Eigenaar | Status |
|---|---|---|---|
| `users.csv` | naam, e-mail, gewenste rol, status | BESC beheer | [ ] |
| `sponsors.csv` | sponsor, contactpersoon, status, afspraken | sponsorbeheer | [ ] |
| `streamers.csv` | kanaal, eigenaar, portaal nodig ja/nee | contentbeheer | [ ] |
| `projects.csv` | actieve projecten, eigenaar, status, periode | projectbeheer | [ ] |
| `events.csv` | geplande events, locatie, timing, eigenaar | planning | [ ] |
| `campaigns.csv` | doel, kanaal, planning, sponsor/eventrelatie | communicatie | [ ] |
| `materials.csv` | materiaal, locatie, verantwoordelijke, waarde | beheer | [ ] |
| `knowledge.csv` | goedgekeurde procedures en zichtbaarheid | bestuur/beheer | [ ] |

Importvolgorde:

1. gebruikers en rollen;
2. communitypersonen, sponsors en streamers;
3. projecten en events;
4. campagnes en contentrelaties;
5. materialen;
6. kennisbank;
7. financiële en communicatieve basisdata rechtstreeks in de applicatie.

## 2. Account- en rechtenmatrix

Maak voor de acceptatieronde minimaal één testaccount per profiel. Gebruik bij voorkeur aparte testadressen en geen persoonlijke productieaccounts.

| Profiel | Moet kunnen | Mag niet kunnen | Testaccount |
|---|---|---|---|
| Beheerder | gebruikers, rollen, integraties, alle beheerflows | — | [ ] |
| Bestuur | goedkeuringen, rapportage, organisatiebeheer | gebruikersbeheer buiten afgesproken scope | [ ] |
| Medewerker | planning, projecten, communicatie, eigen financiële flows | onbeperkt beheer of ongecontroleerd verwijderen | [ ] |
| Vrijwilliger | eigen werk, kalender, toegestane kennisbank | andere dossiers of gevoelige beheerdata | [ ] |
| Sponsor | eigen sponsorportaal en rapportage | interne `/app` en andere sponsors | [ ] |
| Streamer/creator | eigen portaal en deliverables | interne dossiers en andere creators | [ ] |

Per account controleren:

- [ ] juiste startpagina;
- [ ] zichtbaarheid van navigatie en modules;
- [ ] directe URL-blokkade;
- [ ] organisatie- en dossierafscherming;
- [ ] aanmaken/bewerken/verwijderen volgens rol;
- [ ] uitloggen en opnieuw aanmelden;
- [ ] ingetrokken toegang werkt direct.

## 3. Kernflowtest

Voer deze flows lokaal of in een geïsoleerde preview uit met testdata. Noteer per flow één resultaat: `geslaagd`, `mislukt` of `niet van toepassing`.

### Mijn werkplek

- [ ] inboxitem indienen;
- [ ] inboxitem omzetten naar taak, project, event, campagne en content;
- [ ] taak aanmaken, toewijzen, status wijzigen en afronden;
- [ ] kalender en meldingen controleren;
- [ ] goedkeuring aanvragen, beslissen en historiek controleren.

### Planning en relaties

- [ ] project met taak, event, campagne en content koppelen;
- [ ] event met datum, locatie, eigenaar en status beheren;
- [ ] campagne met sponsor, kanaal en evaluatie beheren;
- [ ] communitypersoon meerdere rollen geven;
- [ ] sponsorcontact en portaalrelatie controleren.

### Communicatie en publicatie

- [ ] communicatierecord maken en goedkeuren;
- [ ] Gmail-concept maken;
- [ ] nieuwsbriefvoorbeeld bekijken;
- [ ] publieke inschrijving en dubbele bevestiging testen;
- [ ] uitschrijving testen;
- [ ] BCC en verzendbeveiliging controleren.

### Organisatie en inzichten

- [ ] vergadering, besluit en actiepunt beheren;
- [ ] kost indienen en laten goedkeuren;
- [ ] materiaal met locatie en waarde beheren;
- [ ] kennisbankartikel maken en zichtbaarheidsregels testen;
- [ ] KPI, managementrapport en CSV/PDF-export controleren;
- [ ] sponsor- en creatorrapport met juiste scope controleren.

## 4. Integratiekoppelcheck

Vul waarden alleen in de serveromgeving in. Gebruik de beheerpagina om ontbrekende configuratie te signaleren.

| Koppeling | Vereist voor fase 1 | Acceptatiebewijs | Status |
|---|---|---|---|
| Supabase Auth/RLS | altijd | login per rol + directe URL-test | [ ] |
| Google Drive | documenten en dossiers | document maken/koppelen/openen | [ ] |
| Google Calendar | events en vergaderingen | item synchroniseren en timing controleren | [ ] |
| Gmail | communicatie en nieuwsbrieven | concept, goedkeuring, BCC, verzending volgens beleid | [ ] |
| YouTube | socialrapportage | OAuth, sync, metingen en tokenrefresh | [ ] |
| Meta | Facebook/Instagram inzichten | OAuth, pagina/account, sync en audit | [ ] |
| Twitch | creator-/streamerrapportage | OAuth, sync en refresh | [ ] |
| Vercel cron | dagelijkse social sync | beveiligde route + dubbele run | [ ] |
| AI Gateway | alleen afgesproken AI-flows | kostenlimiet en eigenaar vastgelegd | [ ] |

Beslispoorten voor V1 blijven expliciet buiten scope: Threads, X, LinkedIn, TikTok en volledige vzw-boekhouding.

## 5. Backup- en herstelbewijs

- [ ] lokale/staging schema-backup gemaakt;
- [ ] lokale/staging databackup gemaakt;
- [ ] `.env`-backup buiten Git veilig opgeslagen;
- [ ] restore uitgevoerd op een niet-productieomgeving;
- [ ] gebruikers, rollen, relaties en rapportdata gecontroleerd na restore;
- [ ] productiebackupstrategie en bewaartermijn vastgelegd;
- [ ] meegecommitteerde SQL-dumps formeel beoordeeld op persoonsgegevens en verwijderd uit de bron indien nodig.

## 6. Testrapport per sessie

Kopieer dit blok voor iedere acceptatiesessie:

```text
Datum:
Tester:
Omgeving/URL:
Commit of image:
Testdata:
Profiel:
Flow:
Resultaat: geslaagd / mislukt / n.v.t.
Bewijslink of screenshot:
Opmerking of defect:
Ernst: blocker / hoog / normaal / laag
Vervolgactie en eigenaar:
```

## Definition of done voor fase 1

Fase 1 is afgerond wanneer:

- alle relevante CSV-data gecontroleerd is;
- alle zes accountprofielen getest zijn of gemotiveerd buiten scope staan;
- alle kernflows minimaal één keer met echte of representatieve data geslaagd zijn;
- actieve integraties een actuele acceptatiecheck hebben;
- backup en restore aantoonbaar werken;
- er geen blocker- of hoog-severity defect openstaat;
- de release candidate op een vaste commit reproduceerbaar gebouwd kan worden;
- bestuur/eigenaar de resterende beslispoorten formeel heeft bevestigd.

## Eerstvolgende werksessie

1. `users.csv`, `sponsors.csv`, `streamers.csv`, `projects.csv`, `events.csv`, `campaigns.csv`, `materials.csv` en `knowledge.csv` aanvullen.
2. De testaccounts en verantwoordelijken in de accountmatrix invullen.
3. G1 en G2 uitvoeren op lokaal/staging.
4. Daarna de kernflowtest per module afwerken en alleen concrete defecten als ontwikkelwerk inschrijven.
