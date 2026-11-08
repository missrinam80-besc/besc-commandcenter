# Pakket 5 — Instagram met één verplichte afbeelding

De gebruiker koos Instagram als eerste publicatieplatform. Dit pakket bouwt en test de keten lokaal met fictieve gegevens en nagebootste Meta-antwoorden. Het verandert geen bestaande koppeling, token, planning, Cloud DEV-database of server. Er is geen echte publicatie uitgevoerd.

## Wat de lokale keten doet

1. Een admin kiest een verbonden Instagram-account en een JPEG-link uit de afzonderlijk ingerichte BESC-mediaopslag. De server controleert de werkelijke bytes, afmetingen en inhoudshash. Een Canva-ontwerplink, willekeurige externe URL of ontbrekende afbeelding volstaat niet.
2. Tekst, hashtags, oproep tot actie en tijdstip blijven in de bestaande socialfiche. Het gekozen account, de vastgelegde accountnaam/externe identiteit, afbeeldingslink en inhoudshash komen in de bestaande beoordelingsmomentopname.
3. Een andere bevoegde goedkeurder beslist volgens de bestaande regels. De aanvrager kan zichzelf niet goedkeuren. Tijdens de beoordeling staat de inhoud vast; een tekst-, beeld-, account- of planningswijziging maakt de bestaande goedkeuring ongeldig.
4. Een bevoegde beheerder geeft precies die goedgekeurde versie afzonderlijk vrij. Een tijdstip in het verleden betekent ‘direct verschuldigd’; vrijgave blijft een expliciete handeling. Herhaalde vrijgave van dezelfde beoordelingsronde maakt geen tweede job.
5. De uitvoerder controleert de huidige bron, beoordeling, sessie, beheerdersrol, accountidentiteit en publicatierechten en legt één exclusieve claim vast. Pas daarna leest hij de accountcredential en voert hij beeld- en providercontroles uit.
6. Via de Facebook Login-variant van de Instagram API maakt hij een beeldcontainer, wacht begrensd op gereedheid, controleert opnieuw de quota en laat de database vlak vóór het publicatieverzoek opnieuw de bron en rechten controleren. Er wordt maximaal één `media_publish`-verzoek voor die claim uitgevoerd.
7. Alleen een gecontroleerd media-ID, bijbehorende accountidentiteit en Instagram-permalink leveren ‘Gepubliceerd’ in de afzonderlijke publicatiehistorie op. De oude dossierstatus blijft een interne registratie; die is geen zelfstandig providerbewijs.

De eerste versie ondersteunt één gewone Instagram-publicatie met één JPEG. Kanaalbundels, stories, reels, carrousels, tags, locaties, advertenties, inbox en andere platformen vallen buiten dit pakket.

## Rechten en historie

Technisch accountbeheer blijft admin-only. De bestaande accounttabellen krijgen geen bredere lees- of schrijfrechten. De beoordelaar ziet de bij de bron vastgelegde accountnaam en identiteit; een latere wijziging van het technische doelaccount blokkeert de uitvoering. De database controleert de vastgelegde doelkeuze tegen de werkelijke accountmetadata.

De twee nieuwe private tabellen bevatten jobs en onveranderbare gebeurtenissen, geen tokens. Hun RLS staat aan en browserrollen en `service_role` krijgen geen directe tabelrechten. De browser kan alleen de beperkte eigenaarfunctie gebruiken met een echte actieve sessie en organisatiebeheersrecht. De afzonderlijke serverfunctie is alleen uitvoerbaar door `service_role`; beide publieke wrappers hebben invokerrechten en een vaste lege zoekroute. Privileged uitvoering blijft in beperkte private functies.

Het nieuwe migratiebestand voegt vier optionele velden aan de bron toe: `instagram_account_id`, `instagram_target`, `instagram_image_url` en `instagram_image_sha256`. Wanneer die leeg zijn, blijft de historische canonieke momentopname exact in de oude vorm. Oude goedkeuringen worden niet door lege nieuwe velden ongeldig gemaakt en worden niet achteraf als gepubliceerde berichten geclassificeerd. Historische migratiebestanden en bestaande beoordelingsrondes blijven ongewijzigd.

Een gewijzigde of gearchiveerde bron blokkeert een nog niet uitgevoerde job. Tijdens verwerking of een onzekere uitkomst kunnen inhoud, afbeelding en varianten niet worden herschreven. Een bevestigde publicatie kan niet via dezelfde bron nogmaals worden verstuurd. De bestaande organisatiegrenzen blijven gelden.

## Onderbrekingen en foutopvolging

- Annuleren kan zolang de job nog niet geclaimd is. Annulering die een gelijktijdige uitvoerder voor is, blokkeert die uitvoerder.
- Ontbrekende rechten, een verkeerde Meta-app, onbruikbare afbeelding of ontbrekende/volle publicatiequota stoppen vóór een muterend providerverzoek en blijven als mislukte controle zichtbaar.
- Na een muterend verzoek maken een time-out, onvolledig antwoord of ontbrekend ontvangstbewijs de uitkomst onzeker. Er wordt geen container of publicatie aangemaakt om die aanvraag automatisch te herhalen. Ook een expliciete providerfout na dispatch wordt conservatief behandeld.
- Gaat alleen de bevestiging van de databaseopslag verloren, dan leest de uitvoerder de opgeslagen uitkomst terug. Een al vastgelegde publicatie wordt zo herkend zonder tweede providerverzoek.
- Een procesonderbreking na de claim kan een job in verwerking laten staan. Er is bewust geen leaseverval dat de opdracht opnieuw verstuurt. De bron blijft geblokkeerd voor inhoudelijke wijzigingen; opvolging moet eerst de werkelijke externe toestand vaststellen. Deze versie heeft geen handmatige knop die onzekerheid zonder bewijs als opgelost kan afboeken.

Een onzekere uitkomst is dus geen bevestiging dat er niets gepubliceerd werd. Voor echte ingebruikname moet de beheerder een concrete opvolgprocedure voor zo’n uitkomst kennen. Er is geen algemene claim van gegarandeerd precies-één-externe-publicatie bij een willekeurige netwerk- of providerstoring.

## Runtime en gescheiden activering

`BESC_INSTAGRAM_PUBLICATION_ENABLED` blijft standaard uit. De optionele bediening, serveractie en POST-route `/api/cron/instagram-publication` blijven dan onbeschikbaar zonder credential-, database- of providercontact. Een ingeschakelde route vereist daarnaast `CRON_SECRET`, één expliciete organisatie, een expliciet media-origin en geldige serverconfiguratie voor de bestaande Meta-app. Er is geen terugval naar creatorcredentials of naar alle organisaties.

De route verwerkt maximaal één verschuldigde job per verzoek. Zij is niet aangesloten op de bestaande social-synchronisatietimer en installeert geen nieuwe timer. De lokale runtime gebruikt de bestaande per-account credentialopslag en de bestaande tokencontrolemethode, met afzonderlijk vereiste publicatierechten. De OAuth-start/callback en bestaande scopes voor alleen metingen zijn niet verruimd.

Voorbeelden staan in `ops/instagram-publication.env.example`; ze zijn uitgeschakeld en bevatten onbruikbare placeholders. Het releasemanifest `ops/instagram-publication-local-release.json` legt de afzonderlijke grenzen voor migratie, uitrol, activering en echte publicatie vast. De ene migratie is uitsluitend voorbereid: bij dezelfde actuele basis zou de geregistreerde Cloud-historie na een apart toegelaten toepassing van 153 naar 154 gaan. Dat is geen toestemming of nieuwe live vaststelling.

## Afbeeldingen en providercontract

De server accepteert alleen een HTTPS-link op het ingestelde media-origin, zonder gebruikersinformatie, query of fragment, met het exacte pad `/social-publication/{organisatie}/{sha256}.jpg`. Downloaden gebeurt zonder credentials of redirects, met een tijd- en omvangsgrens. De bytes worden gehasht en met Sharp volledig gedecodeerd. De lokale conservatieve grenzen zijn JPEG, maximaal 8.000.000 bytes, breedte 320–1440 pixels, verhouding 0,8–1,91 en één beeld. Deze toepassing converteert geen bestanden. Dit scherm uploadt geen nieuwe bestanden en maakt geen bestanden openbaar.

Die verificatie vervangt geen onveranderbare mediaopslag: vóór activering moet het echte origin onder BESC-beheer staan, een hashpad niet overschrijfbaar zijn, Meta het bestand zonder aanmelding kunnen ophalen en het bestand voldoende lang beschikbaar blijven. Een willekeurige webserver met alleen een hashachtige bestandsnaam bewijst die eigenschappen niet. De inrichting en bewaarbehandeling blijven afzonderlijk te verifiëren.

De adapter heeft geen hard gecodeerd quotaplafond. Hij vereist een geldige accountspecifieke respons met gebruik, totaal en venster en weigert bij ontbrekende gegevens. Bestaande interne quota voor het ophalen van metingen zijn geen publicatiequota.

Bronnen: de [officiële Instagram-collectie van Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-af579d08-121e-4897-8f45-5fd41ace49df) beschrijft de Facebook Login-variant, professionele accountkoppeling en de publicatierechten. De [Meta-collectie met containerstatus en publicatiestap](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) ondersteunt de gescheiden container/publicatieketen. De directe Meta-documentatie voor de gedetailleerde afbeeldings- en quota-eindpunten gaf tijdens deze voorbereiding 429/onbereikbaar terug. De precieze live contracten, huidige API-versie en accountgeschiktheid moeten daarom vóór activering nog rechtstreeks worden bevestigd; nagebootste antwoorden bewijzen geen Meta App Review of live API-acceptatie.

## Verificatie

De nieuwe tests voeren de echte lokale SQL, rollen, policies, brontriggers, dispatcher, beeldcontrole en provideradapter uit met fictieve beelden en nagebootste providerantwoorden. Aanvullende scherm- en actietests controleren expliciete vrijgave, organisatiebinding, verborgen bediening bij uitgeschakelde functionaliteit, foutmaskering en zichtbare onzekerheid. Runtimetests controleren de serverassemblage, vaste organisatie, één-jobgrens en cron-authenticatie.

Dezelfde ketentests slagen op een echte geïsoleerde PostgreSQL 17.11-database. Zes proeven met afzonderlijke verbindingen en echte wachtrijen controleren dubbele claims, annulering, bronwijziging vóór dispatch, bronwijziging na dispatch, retargeting van het account en intrekking van accountrechten vóór publicatie. De lokale security-advisorscan rapporteert geen bevindingen. De tijdelijke database wordt na de proef gestopt en verwijderd.

Een nieuwe CI-job herhaalt de native keten en zes races. De definitieve aantallen en lokale bouw-/lintresultaten staan in het lokale pakketverslag. Er is in deze stap nog geen push of PR uitgevoerd.

De live proef met een tweede beoordelaar blijft volgens het gebruikersbesluit overgeslagen; de onderliggende scheiding tussen aanvrager en goedkeurder blijft bestaan en wordt lokaal met fictieve eigen accounts getest. Dit document markeert pakket 5 niet als live geaccepteerd. Eerst volgen review/release, afzonderlijk toegelaten migratie en uitrol, exacte Meta/media-inrichting en afzonderlijk toegelaten publicatie van één gekozen bericht.

[← Interne socialbeoordeling](Social-interne-beoordeling.md)
