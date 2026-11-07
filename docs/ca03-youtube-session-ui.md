# CA03 — pakket 2: eigen sessie en volledige gebruikersbediening

Dit pakket sluit de lokale creatorbediening aan op de bestaande BESC-sessie, de eigenaarfuncties en de afgeschermde serverpoort. Het bouwt op pakket 1, commit `0b5ce9e` / concept-PR #151. Die PR wordt niet gewijzigd of samengevoegd. Er zijn geen echte accounts, providerkoppelingen, serverinstellingen of Cloud-gegevens aangepast.

## Bediening

Mijn account bevat een apart YouTube-onderdeel wanneer de expliciete servervlag `BESC_CREATOR_YOUTUBE_ENABLED=true` staat. De standaard is uit; de nieuwe API- en callbackroutes antwoorden dan met `503 unavailable`, zonder sessie-, sleutel- of providertoegang. De bestaande persoonlijke Twitch-inlogidentiteit en organisatie-YouTube-/Twitch-synchronisaties zijn afzonderlijk gebleven.

De eigenaar kan eigen koppelingen pagineren, één koppeling bekijken, een nieuw doel/kanaal/video’s/meetperiode en termijnen invoeren, expliciet toestemming geven, naar Google gaan, metingen ophalen, toegang vernieuwen, een aanvraag herstellen/annuleren en een koppeling intrekken. Een callback-querystring bepaalt nooit of een kanaal gekoppeld is. Daarvoor leest de bediening de actuele eigen koppeling opnieuw uit de database.

De nieuwe API gebruikt `GET /api/creator-youtube` voor de eigen lijst; `?after=<uuid>` pagineert met maximaal twintig resultaten. `?link=<uuid>` leest precies één eigen koppeling. Beide selectoren tegelijk, dubbele parameters, onbekende parameters, vreemde herkomst en ongeldige browserbewijzen worden geweigerd. `POST` behoudt de bestaande afgebakende acties. De Google-terugkeer verloopt via `/auth/creator-youtube/callback`. Headers blijven private/no-store en no-referrer; foutdetails, credentials en browsernonces komen niet in de accountweergave.

Het scherm toont weergaven, kijktijd en gemiddelde kijkduur met eenheid, meetvenster en meettijd. Nul blijft nul; ontbrekende waarden heten ‘Ontbreekt’. Na een mutatie wordt de oude meetweergave verborgen en is expliciet herladen beschikbaar. Verlopen termijnen verbergen de meetweergave en blokkeren ophalen; intrekken blijft beschikbaar. Een browser zonder passend herstelbewijs kan geen aanvraag overnemen. Onbevestigde intrekking blijft een afzonderlijke vervolgstap. Er worden geen termijnen, doeleinden of geselecteerde video’s voor een echte creator ingevuld.

## Dezelfde daadwerkelijke sessie

`CreatorYouTubeSession` is verzoekgebonden. De bestaande SSR-client levert het toegangstoken uit de BESC-cookies; `getSession` alleen verleent geen vertrouwen. `getUser` controleert expliciet datzelfde token bij Auth. De gecontroleerde subject-ID, `authenticated`-rol, vervaltijd en sessie-ID moeten passen. Niet-bevestigde en anonieme gebruikers worden geweigerd; bewerkbare gebruikersmetadata wordt niet gebruikt voor rechten.

Een afzonderlijke eigenaarclient wordt vastgezet op dat token. Alle eigenaar-RPC’s en lijst-/detailreads gebruiken die client. Een apart, server-only serviceclient kan uitsluitend de interne kerneloperaties uitvoeren. Een HTTP-actie accepteert geen service-operatie of job-ID. Een organisatie- of adminrol neemt nooit de plaats in van persoonlijke toestemming. De versleutelde aanvraag bindt job, browser, organisatie, gebruiker en sessie. Wisselt de sessie binnen een verzoek, dan stopt de adapter. De bestaande SQL-controles verifiëren daarnaast de actuele `auth.sessions`-rij, bevestigde accountstatus en actief lidmaatschap.

Alle RPC’s zijn POST, ook de autorisatie-‘read’ die sinds pakket 1 dispatch claimt. Een PostgREST-antwoord bevestigt de afgeronde SQL-transactie voordat een providerverzoek mag beginnen. Er komt geen providerverzoek binnen een open SQL-transactie en geen automatische tokenherhaling na onzekerheid. De lokale HTTP-fixture bootst Auth/PostgREST-transport na; de SDK en SQL-functies zijn echt. Elke gesimuleerde RPC wordt afzonderlijk gecommit. Dit is geen live test van de beheerde Supabase-diensten.

## Veilige ontdekking zonder private tabeltoegang

Eén nieuw, alleen voorbereid migratiebestand voegt `public.creator_youtube_account(uuid,uuid,integer)` toe. Het hanteert dezelfde sessie-/organisatiegrenzen en vergrendelingsvolgorde als de bestaande eigenaarfunctie. Alleen `authenticated` mag de functie uitvoeren; anon, service_role en PUBLIC krijgen geen execute. Admins krijgen alleen hun eigen resultaten.

De functie retourneert maximaal twintig eigen link-ID’s met kanaal, status, intrekkingsstatus en termijnen. De UUID-cursor is uitsluitend een selectiemiddel. Jobs, tokens, sleutels, browserbewijzen en gegevens van andere eigenaars worden nooit geretourneerd. Details en metingen blijven via de bestaande eigenaar-read lopen. Er worden geen tabellen of tabelrechten toegevoegd of verruimd en bestaande SQL-bestanden blijven ongewijzigd.

De release-inventaris volgt pakket 1: na afzonderlijk goedgekeurde toepassing zou deze wijziging de vereiste Cloud-historie van 152 naar 153 brengen. Dit is een volgordevoorwaarde, geen bevestiging dat pakket 1 al is toegepast. De oude uitgesloten seed blijft uitgesloten. Live toepassing en uitrol zijn niet toegestaan in dit pakket.

## Configuratiegrens voor pakket 3

De runtime leest alleen na expliciet inschakelen een specifiek `BESC_CREATOR_YOUTUBE_CONFIG_FILE`. Dit afgeschermde JSON-bestand beschrijft `organizationId`, exacte HTTPS-`origin`, `storageRoot`, `wrappingKeyFile`, `keyringId` en een aparte `google`-configuratie met `clientId`, `clientSecret`, `isolatedProject: true`. De origin moet exact overeenkomen met `NEXT_PUBLIC_SITE_URL`. Er is geen terugval op organisatie-OAuth-credentials.

Configuratie, opslag en wrapping-keybestand moeten buiten de applicatieboom liggen, op bestaande lokale absolute paden zonder symlinks/omleidingen. De wrapping key staat buiten de opslagboom, als een afzonderlijk bestand met 32 bytes base64url-materiaal. Op Unix worden groeps-/publieke rechten geweigerd. Op Windows moet de beheerder passende ACL’s afzonderlijk aantonen; de Unix-modecontrole is daar geen ACL-bewijs.

De mappen `attempts`, `receipts` en `keys` en de bestaande sleutelring moeten vooraf aanwezig zijn. De runtime opent ze, initialiseert of roteert niets automatisch, en blokkeert bij ontbrekende of verkeerde sleutels. Er wordt geen echte configuratie of sleutel aangemaakt door dit pakket. Projectisolatie is een verplichte aansluitverklaring; een boolean bewijst niet dat een echt Google-project correct is ingericht.

Voor pakket 3 blijven concrete inrichting en toestemming nodig: providerproject en callbackregistratie, afgeschermde sleutelbron/mounts, back-up en herstel, rechten/termijnen, één compatibele opslag-/workerversie en één afgebakende live creatorproef. De scheiding van persoonlijke toegang, campagnedeling en publicatie blijft gelden.

## Onzekerheid blijft zichtbaar

Een onbekend of nog niet gevalideerd providerantwoord kan niet met een kale succesvolle revoke worden gepromoveerd tot volledige SQL-afhandeling. De bediening bewaart het herstelbewijs en toont open opvolging. Een verloren bevestiging na een daadwerkelijk gecommitteerde activatie kan via de bestaande intrekkingsketen worden hersteld zonder een tweede codewisseling. Ontbrekende antwoorden, sleutels of browser-/sessiebewijzen krijgen geen bevoorrechte overname. De reeds bekende providerreconciliatie en retentie-/vernietigingsinrichting zijn voorwaarden voor live acceptatie en worden niet als opgelost aangemerkt.

## Controles en bewijslimieten

De nieuwe tests gebruiken echte Supabase SSR-cookieverwerking, `supabase-js`, het actuele schema en echte lokale versleutelde bestandsopslag. Alleen de Auth-/PostgREST-HTTP-antwoorden, Google en Vault zijn testdubbels. Tests omvatten de hele normale keten, weigering/annulering/verval, verloren commitbevestiging, sessiewissel, ingetrokken SQL-sessie, niet-actief lidmaatschap, bevestigingsverlies, eigenaargrenzen, paginering, rolgrenzen en afgeschermde runtimebestanden. React/DOM-proeven controleren de accountbediening, consent, herstel, statusvertrouwen en correcte meetweergave. Dit is geen echte Google-, browser-OAuth- of productie-Vault-acceptatie.

De algemene lokale SQL-scan behoudt twee bestaande nieuwsbriefbevindingen rond de ontbrekende `newsletter_subscription_requests`. De nieuwe creator-leesfunctie heeft geen analyzerbevindingen. Deze afzonderlijke nieuwsbriefproblemen worden niet stilzwijgend gewijzigd of als groen voorgesteld.

## Geraadpleegde documentatie

- [Supabase SSR-client voor Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs).
- [Supabase getUser: validatie bij Auth](https://supabase.com/docs/reference/javascript/auth-getuser).
- [Supabase RPC](https://supabase.com/docs/reference/javascript/rpc).

De implementatie is daarnaast gecontroleerd tegen de lokaal vastgelegde SDK-versies en de bestaande SQL-grenzen. Geen dependencies of lockfiles gewijzigd.

## Afgeronde lokale verificatie

- **1.656 tests geslaagd, nul mislukt**; de nieuwe accountbediening heeft acht React/DOM-proeven.
- **16 volledige applicatie-/runtimeproeven geslaagd** met echte Supabase SSR-/clientbibliotheken en echte PostgreSQL 17.11 onder Linux. Alleen de HTTP-diensten, Google en Vault zijn nagebootst; netwerktoegang van de Linux-proef beperkt zich feitelijk tot de expliciete lokale databaseclient. Dit wordt niet als een netwerkloze provider-liveproef voorgesteld.
- De **acht bestaande PostgreSQL-transactieraces** slagen met het nieuwe schema.
- Volledige lege-schemaherbouw: **154 SQL-bestanden, 204 RLS-tabellen en 382 functies**. De bestaande agentregressies slagen.
- De nieuwe SQL-leesfunctie heeft **nul analyzerbevindingen**. De twee bestaande nieuwsbriefbevindingen blijven apart geregistreerd.
- Lint, TypeScript en de lokale webpack-build slagen. Voor de bestaande lettertypedownload is de vertrouwde Windows-certificaatopslag gebruikt. De bestaande 27 waarschuwingen over dependencies buiten de standalone-tracegrens blijven aanwezig; dit valideert geen uitleverbare containerimage.
- De daadwerkelijk gebouwde Next-routes zijn lokaal uitgevoerd: GET/POST/HEAD van de API en GET van de callback geven met de standaard uitgeschakelde functie 503. Mijn account verwijst zonder aanmelding naar login (307). De tijdelijke webserver en databasecontainers zijn daarna gestopt.

Er zijn geen wijzigingen gepusht, PR’s aangemaakt, migraties live toegepast, images gepubliceerd, servers uitgerold of echte providerverzoeken gestart. De lokale branch bouwt voort op de nog afzonderlijke concept-PR #151. De nieuwe GitHub-job voor de geïntegreerde gebruikersketen is alleen voorbereid; GitHub-controles voor pakket 2 zijn nog niet gestart.
