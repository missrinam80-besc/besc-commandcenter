# F4 - vacatures en vacaturegebonden sollicitaties

Status: lokaal gebouwd op de bestaande F4-reviewbranches. Geen live migratie, uitrol, roltoekenning, formulieropening of activering. Dit vervolgt creators, private intake en partnerpublicatie; het sluit F4 niet volledig af.

## Dossier, beoordeling en sluiting

Een vacature heeft één blijvend dossier, één afzonderlijk sollicitatieformulier en vaste publieke versies. Publication_editor bereidt de tekst voor en dient de exacte hash in. Een andere publication_reviewer beoordeelt inhoud, publicatierechten en bewijs. Goedkeuring publiceert niets: een redacteur geeft de goedgekeurde versie afzonderlijk vrij met de verwachte huidige vrijgaveversie. De voorzitter kan uitsluitend de siteschakelaar instellen op grond van die functie; redactie- en behandeltaken volgen daar niet automatisch uit.

Het formulierbeleid wordt door de voorzitter afzonderlijk vastgelegd in het bestaande private aanvraagbeheer: doeltekst, grondslag, bewaarbehandeling, beleidsdocument en open/sluitvenster. De categorie is expliciet partnership of volunteer_application; oude formulieren en aanvragen blijven partnership. Er worden geen voorbeeldvoorwaarden of fictieve vacaturegegevens toegevoegd. Een sollicitatieformulier is slechts aan één vacaturedossier te koppelen.

Elke vacatureversie heeft een verplichte sluitingsdatum binnen het formuliervenster. De openstelling controleert bij iedere uitlezing het actuele bewijs, de sitevrijgave, het publicatievenster, de goedgekeurde versie, dossierstatus en formulieropenstelling. Wijzigingen aan de gekoppelde bewijsreferenties of vaste beleidsvelden trekken betreffende ingediende/goedgekeurde versies en vrijgaven permanent in. Terugzetten van oude bronwaarden herstelt geen goedkeuring. Externe documentinhoud inhoudelijk beoordelen blijft mensenwerk.

Dossier sluiten is definitief voor dat dossier en blokkeert nieuwe sollicitaties. Een nieuw dossier vraagt een nieuw formulier. Alleen het formulier sluiten en bewust opnieuw openen binnen zijn bestaande venster is een tijdelijke aanvraagstop. Bestaande sollicitaties behouden hun eigen ontvangst en behandeling, ook nadat de vacature is gesloten. Er wordt geen aanvraag automatisch afgewezen, geen lidmaatschap of taakrol aangemaakt en geen benoeming verricht.

## Website en eigen aanvraag

Routes: /vrijwilligers, /vrijwilligers/vacatures/{slug} en /vrijwilligers/vacatures/{slug}/aanmelden. Het overzicht ondersteunt taal, titelzoeken en begrensde cursorpaginatie; detailkoppelingen bewaren de taal. Vacaturetekst is plain_text en wordt door React als tekst weergegeven. Het oudere voorbereidingscontract met sanitized_html blijft een voorstel, geen claim over deze runtime. Er is geen vacature-upload- of HTML-editor in deze toevoeging.

De sollicitant leest de exacte vacatureversie, formuliertekst en bewaarbehandeling. Het leesbevestigingsvak staat nooit vooraf aangevinkt en geeft geen marketing- of publicatietoestemming. De velden zijn uitsluitend motivatie en beschikbaarheid; de server bepaalt account, persoon en eigen toegang. De transactie controleert opnieuw de huidige openstelling en gepubliceerde revisie. Een verouderde revisie wordt geweigerd en moet opnieuw worden bekeken.

De aanvraag bewaart de exacte publieke vacatureversie en vaste formuliertekst naast de ingediende velden. Herhaalde verzending met dezelfde request-ID geeft dezelfde ontvangst; zij maakt geen tweede aanvraag. Een al opgeslagen ontvangst mag bij herhaling na vacaturesluiting nog worden teruggegeven aan hetzelfde actuele eigen account. Een nieuwe request-ID kan na sluiting geen nieuwe aanvraag maken.

Mijn BESC toont de eigen ontvangst, vacatureversie, berichten en status. Een aanvrager kan gevraagde aanvullende informatie geven en een lopende aanvraag intrekken. Alleen expliciet voor dat formulier aangewezen actuele behandelaars kunnen de motivatie en interne notities lezen. Een publicatierol of voorzitterschap geeft die inzage niet automatisch. Interne notities komen nooit mee in de eigen DTO of publieke vacature.

Open pagina's controleren opnieuw na 20 seconden en bij terugkeer. Aanvraagformulieren controleren ook gewijzigde vacatureversies via de eigen formulierlinks; gewijzigde of niet opnieuw bevestigde inhoud wordt verborgen. Deze bouw is geen live timingacceptatie en kan bestaande screenshots of downloads niet intrekken.

## Technische grens en release

- Beide apps: BESC_VACANCY_PLATFORM_ENABLED=false; solliciteren vereist daarnaast BESC_PLATFORM_INTAKE_ENABLED. De aparte vacaturesiteschakelaar is standaard uit.
- CC-bediening: /app/administratie/vacatures en bestaand /app/administratie/aanvragen. De aanmeldfunctie vereist eigen platformtoegang; vacatureweergave vereist ook een actuele stagingviewer of expliciet may_view-recht. De toegangskeuze is een afzonderlijk, standaard uitgevinkt veld en verruimt ook andere ingeschakelde staginginhoud; er wordt door deze bouw geen toegang toegekend.
- Website leest alleen GET /api/v1/platform/publications/vacancies en detail per slug via de bestaande afgeschermde CC-gateway. Actuele bevestigde sessie, site en afzonderlijke websitesleutel blijven nodig; geen directe businessdatabaseclient in de website.
- Publieke DTO: opaque public_id, revisie/type, taal/slug, titel, taakomschrijving, samenvatting, tekst, locatie, beschikbaarheid, sluiting en publicatievenster. Geen formulier-, dossier-, persoons-, account- of document-ID en geen motivatie of interne notitie. Strikte schema's weigeren extra velden.
- Maximaal 50 publicaties per pagina, 200 dossiers per site, 1000 versies per organisatie, 100 eigen aanvragen per toegang; bestaande intakegrenzen en behandeltaken blijven gelden. De cursor is aan site, taal en filters gebonden.
- Eén nieuwe migratie: 20261023220656_f4_vacancies_applications.sql. Vier private RLS-tabellen zonder directe client-CRUD; bestaande private intake wordt uitgebreid met categorie en vaste vacatureverwijzingen/snapshot. Alle eerdere migratiebestanden blijven ongewijzigd.
- ops/f4-vacancy-release-manifest.json verbindt de vier nog niet toegepaste F4-migraties. Laatst bevestigde Cloud DEV-registratie blijft 126; alleen na latere afzonderlijke vrijgave wordt de keten 127/128/129/130. Er is nu geen Cloud-schema gelezen of aangepast.

## Gerichte bouwcontrole en open acceptatie

De geïsoleerde vacatureketen controleert publicatie met onafhankelijke beoordeling, vaste sollicitatiesnapshot, idempotente ontvangst, verouderde versie, sluiting en afgeschermde behandeling. De bestaande samenwerkingsintake blijft werken. API-controles bewaken gesloten flags, private extra velden en filtergebonden cursors. Presentatiecontroles bewaken tekstweergave, taal, revisie en uitgevinkte bevestiging. Lint/typecontrole en productiebuilds worden voor deze bouw uitgevoerd; automatische CI blijft intact. Native schemaopbouw wordt door de bestaande CI gecontroleerd, niet als lokaal bewezen gepresenteerd.

Nog afzonderlijk gepland: uitgebreide live app-acceptatie vóór productie, live migratie-/deployvoorcontrole, echte beleidsbesluiten en inhoud, toegangstoekenningen, operationele bewaarbehandeling, bredere F4-delegatie en inhoudsmigratie/redirects. De oorspronkelijke 46 geplande acceptatiegevallen zijn niet allemaal uitgevoerd of afgevinkt.
