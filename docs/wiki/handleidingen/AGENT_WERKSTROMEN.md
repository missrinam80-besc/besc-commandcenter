# BESC agentwerkstromen stap 11

## Status en grenzen

De bestaande Technical Agent heeft op 4 november 2026 opdracht `76b85b14-17f8-4dcf-8fce-c21b9dc3fd74` gelezen en een voorstel met acht controlepunten teruggeschreven. Linda heeft dit in CC geaccepteerd. Dat bewijst de beperkte keten met dossierkoppen, niet alle negen agents of volledige dossierbeoordeling.

Deze uitbreiding is lokaal gebouwd. De nieuwe migratie en `BESC_AGENT_WORKFLOWS_ENABLED=true` moeten afzonderlijk op DEV worden vrijgegeven. De bot en website krijgen geen wijziging. De bestaande agents en gedeelde researchvoorziening worden behouden. Er wordt geen autonome agent-naar-agentdelegatie toegevoegd.

## Opdrachten en herstel

Opdrachtkaarten tonen dossiernaam, bestaande agent, datum, kort opdrachtnummer, bronversie, gedeelde context, ontvangst en menselijke beoordeling. Na opslaan wordt de betreffende opdracht geopend. Dezelfde actuele opdracht met dezelfde gebruiker, grant, agent, bronversie, tekst en context wordt hergebruikt, ook wanneer een tweede formulier een andere willekeurige sleutel bevat. Een ingetrokken of verlopen opdracht wordt niet stilzwijgend hervat.

Alleen expliciet handmatig verzenden start een betaalde agentuitvoering. De stabiele opdracht-ID blijft de idempotentiesleutel. Bestaande opdrachten gebruiken exact het oorspronkelijke triggerbericht; nieuwe opdrachten hebben een afzonderlijke berichtversie. Fouten onderscheiden geweigerde credentials, ontbrekende kanaaltoegang, onbeschikbaar kanaal, rate limiting, timeout, netwerkfout en onleesbare ontvangst. Alleen een begrensde foutcategorie wordt opgeslagen; response bodies, tokens en headers niet.

De nieuwe agentinstructie vraagt de volledige resultaatpayload eerst zichtbaar in het agentgesprek te tonen en pas daarna de vereiste opslagbevestiging te vragen. Zo kan dezelfde payload worden hersteld wanneer de bevestiging verloopt. CC neemt het voorstel niet automatisch over uit een ChatGPT-gesprek. Een ontvangen resultaat wijzigt geen dossier.

Een afzonderlijke knop leest alleen de providerstatus via GET. Queued, in progress, suspended, completed en failed zijn geen bewijs dat CC een inhoudelijk resultaat heeft ontvangen. Er is geen onbeperkte achtergrondpoller en geen automatische herhaling.

## Expliciete contextselectie

Standaard gaan alleen titel, status en bronversie mee. De aanvrager kan vooraf een beschrijving en planning/locatie selecteren en bekijken. Beschrijvingen zijn begrensd tot de eerste 6000 tekens. Een aanvullend fragment is maximaal 6000 tekens en vereist een bronverwijzing. Zonder expliciete inhoudscontrole worden geselecteerde onderdelen niet opgeslagen. De gebruiker controleert vrije tekst op onnodige persoonsgegevens, vertrouwelijke informatie en geheime links; het systeem beweert niet dat zulke tekst automatisch geanonimiseerd is.

Bestuurs-, persoons- en financiële tabellen, originele documenten, Drive-bestanden en geheimen worden niet automatisch opgehaald. Het extra fragment is door de aanvrager geselecteerde context, geen onafhankelijk geverifieerde bron. De opgeslagen momentopname is aan de dossierbronversie gebonden. Inhoud is data en verruimt geen bevoegdheid.

De bestaande MCP-grant is gebonden aan gebruiker, organisatie, scope en geldigheid. Dit is geen cryptografische isolatie tussen agents die dezelfde gebruikersverbinding gebruiken. Alleen zelf aangevraagde opdrachten zijn via de opdrachttool bereikbaar. De algemene MCP-dossierlezer blijft metadata leveren. Intrekken van de grant of verlies van lidmaatschap blokkeert verdere toegang.

## Negen bestaande agents

De keuzelijst gebruikt uitsluitend de negen bestaande identiteiten uit de agentinventaris. Een vervangend ID wordt geweigerd. Een agent is pas selecteerbaar wanneer diens bestaande API-kanaal is ingesteld. Een geconfigureerd kanaal bewijst niet dat de actuele externe toegang werkt.

De live editorinventaris van 4 november toont alleen bij Technical een API-kanaal en de CC-app. Management, Project, Event, Content, Creative, Reporting, Commerce en Finance & Assets moeten nog afzonderlijk op hun bestaande identiteit worden gekoppeld. Aanmaken van API-kanalen en toevoegen van de CC-app vereisen concrete vrijgave; er worden geen nieuwe agentaccounts, scopes of tokens aangemaakt in dit codepakket. Bestaande Google-apps en skills blijven behouden.

## Kosten en stoppen

Linda koos maximaal 5 credits per opdracht. De bestaande geverifieerde voorzitter beoordeelt resultaten binnen dezelfde databasetransactie en moet eerst een toewijzing van 5 credits, een verwijzing naar de gecontroleerde externe kostenlimiet en maximaal 1 tot 3 verzendpogingen vastleggen. Standaard geldt één poging. De nieuwe organisatiebediening begint gepauzeerd. Een goedkeuring verzendt niets; beschikbaar maken verzendt ook niets.

**Dit is geen hard providerplafond.** De Workspace Agents-API geeft geen verifieerbaar werkelijk creditverbruik of per-opdrachtkostenstop terug. Een eigen CC-toewijzing mag daarom niet als gegarandeerde maximale factuur worden voorgesteld. Controle van de externe werkruimtefacturering blijft noodzakelijk. Als een harde garantie van maximaal 5 werkelijke credits vereist is en die extern niet beschikbaar is, blijft betaalde uitvoering gepauzeerd.

Werkelijk verbruik blijft onbekend totdat de voorzitter een gecontroleerde waarde handmatig vastlegt. Een waarde boven de toewijzing pauzeert verdere verzendingen. Er is geen automatische herberekening, extra budget of herstart. De registratie vervangt geen facturatiebron.

Pauzeren blokkeert nieuwe verzendingen. Intrekken sluit de opdracht en blokkeert nieuwe resultaatopslag, ook via de oude leesroute. Geen van beide beëindigt een al lopende uitvoering in ChatGPT. Daarvoor moet de gebruiker het bestaande agentgesprek apart beëindigen. Er wordt geen niet-gedocumenteerde cancel-API aangeroepen.

## Conceptdocument en Drive

Alleen een eigen geaccepteerd resultaat kan een conceptdocument opleveren. Het document bevat voorsteltekst en bronverwijzing, geen stilzwijgende formele afsluiting. Download en nieuwe overdracht worden geblokkeerd wanneer de actuele dossierbronversie is gewijzigd. Bestanden zijn deterministisch en krijgen een SHA-256-kenmerk. Alle downloads zijn privé en zonder cache.

Linda wees de map `Conceptdocumenten(AI)` aan: https://drive.google.com/drive/u/0/folders/1GZLgcucq0Rzl6xo5yhFJlHa3r0IAfp7K. Deze map is op 4 november alleenlezend in haar Drive-sessie gezien. De eerder opgegeven map Templates wordt niet als uitvoermap gebruikt.

De eerste ondersteunde overdracht is expliciet handmatig: DOCX downloaden, als Google-document importeren in de aangewezen map, inhoud en bestaande deelrechten controleren en de Google-documentlink in CC registreren. De registratie heet door gebruiker bevestigd; zij is geen connectorcontrole van map, inhoud of rechten. CC uploadt niets automatisch en maakt geen tweede documentregister.

De Google Drive-connector is in deze sessie niet beschikbaar. Er is geen nieuwe native Google Doc geïmporteerd. Voor geautomatiseerde plaatsing blijft een werkende, begrensde importkoppeling en concrete uitvoeringsvrijgave nodig.

## Assist Online

De huidige boekhoudkundige overdracht is volgens Linda handmatig. Assist Online blijft de bron; er wordt geen fictieve API, importformaat of tweede boekhouding gebouwd. De gebruiker controleert de originele financiële stukken, periode, volledigheid en bedragen, draagt die handmatig over en controleert de ontvangst daar. CC kan uitsluitend periode, gecontroleerde ontvangst-/bronverwijzing en het verbonden conceptkenmerk vastleggen. Een agentvoorstel is geen financieel bewijs. Er zijn geen bedragen, boekingen, betalingen of echte overdrachten uitgevoerd.

## Vrijgavevolgorde

1. Code en migratie reviewen; geen wijziging van bestaande migratiebestanden.
2. Code na toestemming pushen en als concept-PR laten controleren. Merge is afzonderlijk.
3. Exacte nieuwe CC-image bouwen en beoordelen; website en bot blijven op hun huidige images.
4. DEV-voorcontrole tegen historie 143 en het actuele schema; afwijkingen eerst beoordelen.
5. Eén migratie afzonderlijk vrijgeven: 143 naar 144 registraties, twee lege afgeschermde tabellen. Bestaande kolommen/rijen blijven behouden; oude opdrachten krijgen veilige standaardwaarden voor de nieuwe velden. De nieuwe dispatchpoort geldt ook voor de oudere serverversie en begint gepauzeerd.
6. CC-uitrol en activering afzonderlijk vrijgeven. Schijfruimte en actuele image opnieuw controleren; terugvalimage bewaren. Houd de nieuwe instelling uit totdat migratie en bediening aanwezig zijn.
7. Bestaande agentkanalen en CC-apps na toestemming inrichten; de gepubliceerde kanaal-ID's teruglezen. Geen sleutelwaarden in chat of Git.
8. Linda controleert de externe kostenlimiet en maakt handmatige uitvoering beschikbaar. Alleen daarna per concrete opdracht verzenden.

## Gerichte verificatie

Dertig gerichte gevallen voor bestaande en nieuwe contracten zijn groen, inclusief databaserollen, contextselectie, duplicate handling, maximum pogingen, intrekking, statuslezing en documentgrenzen. Een native PostgreSQL 17-proef heeft 143 historische migraties zonder oude operationele seed opgebouwd, de nieuwe migratie teruggedraaid en vastgelegd en het behoud van bestaande kolommen/rijen en een oude opdracht gecontroleerd. Twee echte gelijktijdige verbindingen bewijzen één opdracht bij dubbele voorbereiding en weigering van een wachtende verzending na intrekking. De tijdzone is vastgezet voor dezelfde deduplicatie in verschillende sessietijdzones.

Typecontrole, gerichte lint en applicatiebouw zijn groen. DOCX-structuur, deterministische hash, XML-escaping, bronbinding en de titelcontrole zijn gecontroleerd. Visuele DOCX-rendering bleef open: LibreOffice ontbreekt; het geïnstalleerde OpenOffice leverde in de headless proef geen PDF en de eigen proefprocessen zijn gestopt. Geen claim van visueel of native Google Docs-gevalideerde uitvoer.

De brede app-acceptatie blijft, zoals afgesproken, voor productie. Andere agents hebben geen nieuwe betaalde live proef gehad. Dit document verklaart stap 11 niet integraal operationeel afgerond.

## Primaire providerbronnen

- https://developers.openai.com/workspace-agents/trigger-runs
- https://developers.openai.com/workspace-agents/authentication

De trigger-API ondersteunt stabiele idempotentiesleutels en een afzonderlijke beta-statuslezing. De status is geen resultaattekst en geeft geen verifieerbare creditmeting of gedocumenteerde cancelroute.
