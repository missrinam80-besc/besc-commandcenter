# F4 - partner- en esportsvermeldingen

Status: lokaal gebouwd, zonder Cloud-migratie, uitrol, publieke inhoud, roltoekenning of activering. Dit vervolgt [creatorprofielen](Implementatie-creator.md) en [private intake](Implementatie-intake.md). Het is geen volledige F4-afsluiting.

## Een bronregister, aparte publieksversies

`public.partners` blijft het enige partnerregister. `public.partner_roles` blijft de bron voor expliciete rollen. De drie nieuwe private tabellen bewaren uitsluitend site-instellingen, vaste publicatieversies en de vrijgavepointer; zij vormen geen tweede organisatieregister.

Een publieke vermelding gebruikt naam en website uit een actieve, niet-gearchiveerde bronpartner. De redacteur kiest uit actuele rollen met bronbewijs, schrijft een afzonderlijke publieke beschrijving en koppelt bewijs voor inhoud/publicatierechten. Er is geen standaardrol op basis van partner_type, geen sponsorwaarde uit een contract en geen automatische omzetting van een samenwerkingsaanvraag. Gevraagde rollen uit intake zijn geen bevestigde partnerrollen.

Esports is een filter op dezelfde beoordeelde partnervermeldingen met een actuele esportsrol. Het is geen tweede partnerkopie. Andere mogelijke rollen zijn sponsor, community, event, education en social_impact. Alleen de expliciet gekozen, onderbouwde rollen verschijnen in de versie.

## Beoordeling, bronversie en intrekking

Voorbereiden en indienen vereisen zowel partner_editor als publication_editor. Onafhankelijke beoordeling vereist publication_reviewer en toegang tot het noodzakelijke bewijs; de auteur kan de eigen versie niet goedkeuren. Goedkeuring geeft geen websitevrijgave. Publication_editor geeft een exacte goedgekeurde versie apart vrij, met verwachte huidige vrijgaveversie en optioneel tijdvenster. Een nieuwe beschrijving vraagt een nieuwe versie; de bestaande vrijgave blijft staan tot bewuste vervanging.

De beoordeelde versie bevat hashes van publieksvelden, actuele brongegevens, geselecteerde rolrecords, bewijsreferenties en logometadata. Alleen een document-ID noemen is onvoldoende: ook wijzigingen in documentvindplaats, label of afscherming worden gedetecteerd. De werkelijk inhoudelijke beoordeling van een brondocument blijft mensenwerk; een hash is geen bewijs dat de inhoud klopt of dat een extern document onder dezelfde URL niet gewijzigd is.

Wijzigingen aan naam, website, bronstatus, archivering, geselecteerde rol of gekoppeld bewijs trekken betreffende ingediende/goedgekeurde versies en vrijgaven in. Eerdere waarden terugzetten herstelt geen oude goedkeuring. Een verlopen rol of publicatievenster blokkeert uitlezing eveneens. Deze controles zijn naast elkaar aanwezig: actuele bronvalidatie bij iedere read en permanente intrekking bij relevante bronwijzigingen. De bronwijziging krijgt auditmetadata zonder contact- of contractinhoud.

## Website en privacy

De website krijgt `/samenwerkingen`, een detail per slug en `/esports`. Zoeken op naam, rollenfilter, taal en begrensde cursorpaginatie gebruiken dezelfde beperkte CC-API. Detailkoppelingen behouden de taal. De samenwerking kan doorlinken naar de reeds gebouwde private intake, indien die afzonderlijk is ingeschakeld.

De publieke DTO bevat uitsluitend opaque public_id, type/revisie, taal/slug, naam, beschrijving, gekozen rollen, veilige website-link, optioneel logo en publicatievenster. Geen interne partner-, persoon-, account-, document- of consent-ID, contactpersoon, e-mail, telefoon, contract, waarde of interne notitie. De website weigert onbekende/gevoelige extra velden. Tekst wordt als tekst weergegeven. Externe websites worden niet door de app opgehaald; navigatielinks vereisen https zonder credentials, query, fragment, poort of lokaal/IP-adres.

Optionele logo's gebruiken bestaande BESC-mediareferenties. De CC-reviewer heeft een afgeschermde preview; een authenticated client krijgt via de previewcontrole alleen een boolean, nooit een privaat pad. Alleen de bestaande CC-servercredential leest daarna de locator. De website krijgt bytes via een eigen gecontroleerde proxy, geen Storagepad of ondertekende downloadlink. Grootte, bestandshash en actuele rechten worden gecontroleerd en na het ophalen opnieuw getoetst.

Open websitepagina's controleren toegang en actuele inhoud na 20 seconden en bij terugkeer. Intrekking of mislukte hercontrole verbergt de oude inhoud. Geen gedeelde cache of stale fallback. Dit is gebouwde logica, geen volledige live timingacceptatie of controle over reeds gemaakte screenshots/downloads.

## Technische grens

- Nieuwe flag in beide apps: `BESC_PARTNER_PLATFORM_ENABLED=false`. De aparte siteschakelaar ontbreekt/is uit bij een nieuwe installatie. Er worden geen sites, viewers, rollen, bronpartners of vermeldingen toegevoegd.
- CC-bediening: `/app/administratie/partners-publicatie`, bereikbaar via de websitebeheerpagina indien de flag aanstaat. Alleen expliciete actuele taken geven toegang tot inhoud en handelingen. Voorzitterschap geeft sitebediening, geen automatische inhoudsredactie.
- CC-API: `GET /api/v1/platform/publications/partners`, detail `…/partners/{slug}` en logo `…/partners/media/{id}`. Actuele stagingviewer, geverifieerde sessie en afzonderlijke websitesleutel blijven nodig. Nieuws/events, creators en private intake behouden hun bestaande routes en flags.
- API ondersteunt maximaal 50 per pagina met een ondertekende cursor gebonden aan site, taal en filters. CC-versies pagineren ook per 50. De huidige curatiegrens is 200 actieve bronpartners en 1000 voorbereide versies per site; overschrijden geeft expliciet een fout. Verdere schaalvergroting hoort bij een latere uitbreiding.
- Runtimecontracten: CC `src/lib/f4-partner-contract.ts`, bytegelijke websitekopie `src/lib/partner-contract.ts`. Strikte input/DTO-validatie, versie/hashcontrole, duurzame requestreceipts, rate limits en bestaande transactiegate/audit worden hergebruikt.

## Migratie en release

`20261023214422_f4_partner_publications.sql` voegt drie private RLS-tabellen toe zonder directe client-CRUD en zonder wijzigingen aan historische SQL. Brontriggers bewaken de koppeling met bestaande partners, rollen, documenten en media. De website leest uitsluitend de beperkte CC-API; er is geen businessdatabaseclient in de website.

Het manifest verbindt deze ene toevoeging aan de twee nog niet toegepaste F4-voorgangers. Laatst bevestigd Cloud DEV blijft 126. Na afzonderlijke latere vrijgave: creator 127, intake 128 en partnerpublicatie 129. Deze bouw heeft geen live database gelezen of gewijzigd. Voor een serveruitrol zijn actuele capaciteit, exacte images en het afzonderlijke uitrolpakket nog nodig. Er is niets gemerged of gedeployd door deze bouwstap.

## Gerichte controle en resterend F4

Een geïsoleerde databaseketen met fictieve gegevens controleert bestaande bronrollen, onafhankelijke review, aparte vrijgave, begrensde publieke DTO, logo, rolintrekking en gewijzigd bewijs. Twee API-grensgevallen controleren onder meer filters/cursor, onveilige URL's, extra private velden en hercontrole na media-ophaling. Een presentatiegeval controleert het gedeelde detailadres, taalbehoud, tekstweergave en de vaste esportsselectie. Beide productiecompilaties en gerichte CC-lint/typecontrole worden bij oplevering gerapporteerd. Bestaande CI blijft actief.

Geen live account-, Auth/Storage-, provider-, browser- of productieacceptatie. De uitgebreide app-test blijft voor productie. Resterende F4-bouw: partnerdelegatie/eigen partnerwijzigingen, vacatures met vacaturegebonden sollicitaties, verdere Mijn BESC-functies, statische pagina's, inhoudsimport en redirects. De historische 46 acceptatiegevallen en eerdere open bewijsgrenzen blijven behouden.

Bron: [Supabase databasefuncties en toegangsgrens](https://supabase.com/docs/guides/database/functions).
