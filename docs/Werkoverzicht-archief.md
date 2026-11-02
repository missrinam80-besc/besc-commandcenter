# Omkeerbaar archief voor documenten en tickets

Lokaal voorbereid op 1–2 november 2026. Geen vrijgave voor push, merge,
Cloud-migratie, serveruitrol of het archiveren van bestaande documenten/tickets.

## Gedrag

Documentregister en Discordtickets krijgen een actieve weergave en een archief.
Een bevoegde medewerker kan een registratie archiveren en terugzetten. Zoekfilters,
paginering en de badge voor open tickets volgen de gekozen weergave. Een directe
ticketlink blijft bruikbaar en toont de archiefstand.

Archiveren verandert uitsluitend aparte overzichtsmetadata. Het oorspronkelijke
document, zijn classificatie, bewijsversies, bronlinks en geldigheid blijven gelijk.
Bij tickets blijven status, versie, sluitdatum, bewaartermijn, intake, gesprekken,
Discordthread en bestaande verzendopdrachten gelijk. Archiveren is geen intrekking
van bewijs, geen sluiting en geen uitstel van bestaande bewaartermijnen.

Een nieuw bericht van de aanvrager zet een gearchiveerd ticket automatisch terug
in het actieve overzicht. Interne notities doen dat niet. Deze reactie verstuurt
zelf geen Discordbericht. Bestaande fysieke verwijdering van een bron ruimt alleen
de bijbehorende overzichtsmarkering op; bestaande verwijderbeveiligingen blijven aan.

## Rechten en gelijktijdige wijzigingen

- De twee leesviews gebruiken `security_invoker`, zodat de bestaande bron-RLS geldt.
- Archiefmetadata is alleen leesbaar wanneer de gebruiker de bron zelf mag lezen.
- Alleen bestaande organisatiemanagers met actuele documenttoegang mogen documenten
  archiveren. Financiële en governance-afscherming blijven gelden; een technische
  adminrol geeft geen extra toegang tot afgeschermd bewijs.
- Tickets volgen de bestaande actuele `manageTickets`-controle.
- Rechtstreeks schrijven naar archiefmetadata is niet toegestaan. De sessiegebonden
  functie heeft geen anonieme of service-role-vrijgave.
- De functie vergrendelt de bron en daarna de archiefstand, controleert de bevoegdheid
  opnieuw na eventueel wachten, en weigert een verouderde archiefversie.
- Archiveer- en herstelacties hebben herleidbare auditregels. Automatisch herstel
  door een inkomend bericht is herkenbaar als systeemactie, zonder verzonnen actor.

## Lokale databasevoorbereiding

`20261101225803_workspace_record_archive.sql`, aangemaakt met de bestaande CLI:
één lege tabel, twee beperkte leesviews, één mutatiefunctie en twee interne
triggerfuncties. Geen gegevens worden vooraf gearchiveerd of seeded. Bij een later
afzonderlijk vrijgegeven uitvoering gaat de verwachte DEV-historie van 138 naar 139;
de uitgesloten oude seed blijft uitgesloten.

De botrepository en zijn API-contract zijn niet gewijzigd. De bestaande
brontabellen en hun eerdere functies/beveiligingen worden niet herschreven.

## Gerichte verificatie

- 24 gerichte gevallen: archiveren/terugzetten, bronbehoud, audit, RLS en organisatiegrenzen,
  ontbreken/wegvallen van bevoegdheid, geweigerde directe/anon/service-toegang,
  versieconflicten, inkomende berichten, bewaartermijn, verzendwachtrij,
  registerlinks, zoekfilters, paginering en navigatietelling.
- SQL-proeven gebruiken een geïsoleerde synthetische PGlite-platformfixture met de
  bestaande migratieketen. Dit is geen nieuwe native PostgreSQL- of Cloud-acceptatie.
- Typecontrole, lint op gewijzigde bestanden en de lokale productiebouw zijn geslaagd.
- De uitgebreide appacceptatie blijft zoals afgesproken vóór productie.

## Afzonderlijk uitgevoerde, goedgekeurde datawijzigingen

Op Cloud DEV is alleen het content-testdossier met ID
`174ac595-320f-4d6d-9428-d0346bdb97cd` via zijn bestaande `deleted_at` gearchiveerd,
en testmelding `768204d0-2c3b-4593-b512-0b14e251ebbb` verwijderd. Nacontrole en
versleutelde herstelkopie zijn aanwezig buiten de server. Dit gebruikte de bestaande
database en niet de nieuwe archieffunctie. De vijf testdocumenten en zes door Linda
bevestigde testtickets zijn nog niet gewijzigd.

## Latere uitvoering

Eerst code beoordelen. Push/PR, merge, Cloud-migratie, uitrol en de exacte
document-/ticketbatch vereisen hun eigen concrete vrijgave. Voor die batch opnieuw
de toestand en actuele gekoppelde historie controleren; geen oude controlehash
blind hergebruiken. Het laten verdwijnen van testmateriaal uit een werkoverzicht
is geen toestemming om controlehistorie, saldi of Discordgesprekken te wissen.
