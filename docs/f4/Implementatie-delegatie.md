# F4 - partnerdelegatie en eigen profielvoorstellen

Status: lokaal gebouwd op de bestaande F4-reviewbranches. Geen live migratie, roltoekenning, toegangswijziging, uitrol of activering. Deze toevoeging vervolgt de vier eerdere F4-bouwmijlpalen en sluit F4 niet volledig af.

## Afgebakende vertegenwoordiging

De voorzitter legt per bestaande actieve partner, bestaande geverifieerde persoon en geldigheidsperiode een expliciete delegatie met bewijs vast. De persoon moet al afzonderlijke eigen platformtoegang hebben. Een delegatie is gebonden aan die exacte account-/persoon-/toegangsregistratie, niet aan alleen een e-mailadres of een publiek partnerlabel. Zij verloopt uiterlijk met die toegang en maximaal na zeven dagen. Er worden geen interne organisatieleden, rollen, partnerrollen, contractrechten of algemene beheerders aangemaakt.

De nieuwe siteschakelaar is standaard uit. De runtimeflag BESC_PARTNER_DELEGATION_ENABLED staat in beide apps standaard op false. Delegatie gebruikt de bestaande F4-accountverificatie, actuele bevestigde Auth-sessie en de transactiegate. Zij is onafhankelijk van de creator-, intake- en partnerweergaveflags. Voor het overnemen als publicatieconcept moet in het CC wel de bestaande partnerpublicatiefunctie afzonderlijk zijn ingeschakeld.

Een vernieuwde eigen toegang neemt geen oude delegatie of voorstellen over. Een beëindigde delegatie wordt niet heropend; vernieuwing vraagt een nieuwe toekenning met actuele onderbouwing. De vertegenwoordiger kan de eigen delegatie ook beëindigen. Het is geen onderdelegatie- of uitnodigingssysteem en er worden geen berichten aan derden verstuurd.

## Mijn BESC en vaste voorstellen

De website krijgt /mijn-besc/organisaties en /mijn-besc/organisaties/{delegatie}. Het eigen overzicht toont uitsluitend actuele eigen delegaties met publieke partnernaam/website, geldigheid en voorstelnummer. Het detail toont uitsluitend de eigen vaste voorstelversies, eigen status en een expliciet voor de vertegenwoordiger geschreven antwoord. Geen intern partner-, persoon-, account-, document- of contract-ID, contacten, financiële waarden, interne notities of bronrollen. Delegatie- en voorstel-ID's zijn alleen opaque verwijzingen voor deze eigen werkstroom.

Een voorstel bevat publieke naam, beschrijving en optionele veilige https-website. Het kan eigen concept, ingediend, wijzigingen gevraagd, overgenomen als BESC-concept of ingetrokken zijn. Bewaren maakt een nieuwe vaste versie met hash en verwachte huidige revisie. Indienen controleert de actuele bron en delegatie opnieuw. Een antwoord van BESC is zichtbaar voor de vertegenwoordiger; er wordt hier geen privénotitie aan die eigen projectie toegevoegd.

Open eigen pagina's controleren toegang en de actuele voorsteltoestand na 20 seconden en bij terugkeer. Een veranderde bron, antwoord/status of mislukte hercontrole verbergt de oude inhoud en vraagt de actuele pagina opnieuw te openen. Dit is gebouwde logica, geen live timingacceptatie of garantie over screenshots/downloads.

## Overname, onafhankelijke beoordeling en intrekking

Interne curatie vereist zowel partner_editor als publication_editor. De voorzitter heeft op grond van het voorzitterschap alleen delegatie-/sitebeheer en krijgt geen automatische curatietaak. Een publicatiebeoordelaar krijgt via deze toevoeging evenmin inzage in eigen conceptvoorstellen.

Een curator kan wijzigingen vragen of een exact ingediend voorstel overnemen als apart BESC-publicatieconcept. Naam en website moeten dan al overeenkomen met het bestaande partnerregister. Een afwijking wordt niet automatisch in het register geschreven: BESC moet een bronwijziging afzonderlijk verifiëren en verwerken; daarna bewaart de vertegenwoordiger een nieuw voorstel tegen die gewijzigde bron. Dit voorkomt een stilzwijgende omzetting van een extern voorstel in een bevestigd BESC-feit.

Overname gebruikt de bestaande partner.draft-transactie. BESC kiest uit actuele onderbouwde partnerrollen, de taal, het vaste pagina-adres en bewijs voor publicatierechten. Het voorstel verleent zelf geen publieke rol. De nieuwe conceptversie heeft geen logo; de interne preview toont dat expliciet. Overname geeft nog geen goedkeuring of publicatie. Een andere publication_reviewer moet de exacte BESC-versie beoordelen, gevolgd door afzonderlijke vrijgave. Ook de oorspronkelijke vertegenwoordiger mag de gekoppelde versie niet zelf goedkeuren als die toevallig een interne reviewerrol heeft.

De gekoppelde BESC-versie behoudt een private verwijzing naar het voorstel en zijn delegatie. Actuele delegatie, bron en voorstelstatus blijven nodig voor uitlezing en publicatie. Voorstel intrekken, delegatie intrekken/beëindigen of onderliggende accounttoegang intrekken haalt gekoppelde vrijgaven permanent weg en trekt relevante ingediende/goedgekeurde versies in. Verlopen delegatie blokkeert eveneens uitlezing en nieuwe commits. Een bestaande los opgestelde BESC-versie zonder deze koppeling blijft onder haar eigen bron-/reviewvoorwaarden vallen.

Wijziging van de bewijsreferentie of account-/persoonbinding beëindigt bestaande delegaties permanent. Terugzetten van oude bewijswaarden herstelt geen delegatie. Documentvingerafdrukken bewaken geregistreerde vindplaats/rechten, maar zijn geen inhoudelijke beoordeling van een extern document dat onder dezelfde URL kan veranderen. Die beoordeling blijft mensenwerk.

## Opslag, API en grenzen

- CC: /app/administratie/vertegenwoordiging, bereikbaar via Websitepublicatie. De pagina en alle mutaties controleren actuele expliciete bevoegdheden. Zij is geen algemene rechtenuitbreiding voor de route /administratie.
- Website: eigen GET /api/v1/platform/representation en /representation/delegations/{id}; POST /representation/workflow laat uitsluitend eigen bewaren, indienen, intrekken en delegatie beëindigen toe. Toekennen, antwoorden en overnemen zijn geen websitebewerkingen.
- API hergebruikt de afzonderlijke websitesleutel, actuele eigen sessie, begrensde verzoek-/antwoordgrootte, privé/no-store headers, strikte schema's en de gedeelde vijfsecondenbegroting. Alleen het CC heeft businessdatabasefuncties.
- Nieuwe migratie 20261023222648_f4_partner_delegation.sql voegt drie private RLS-tabellen zonder directe client-CRUD toe: partner_delegation_settings, partner_delegations en partner_profile_proposals. Bestaande partnerpublicatieversies krijgen een optionele private voorstelverwijzing. Historische SQL blijft ongewijzigd.
- Limieten: 500 delegatieregistraties per site; maximaal 20 niet-ingetrokken, niet-verlopen delegaties per eigen toegang; 100 vaste voorstellen per delegatie en 2000 per BESC-organisatie. Eigen detail is begrensd op die 100; interne voorstellen pagineren per 50. Meer dan 200 actieve bronpartners vraagt een aparte schaaluitbreiding en wordt niet stil afgekapt. Voorgaande rechten-/requestlimieten blijven gelden.
- ops/f4-delegation-release-manifest.json verbindt deze vijfde F4-migratie aan de vier nog niet toegepaste voorgangers. Laatst bevestigd Cloud DEV blijft 126 registraties; de gehele keten zou na latere afzonderlijke vrijgave naar 131 gaan. Deze bouw heeft geen Cloud-schema gelezen of gewijzigd.

## Gerichte bouwcontrole en resterend werk

Gerichte geïsoleerde queries controleren eigen partner/account-afbakening, duurzame ontvangst, versieconflict, overname naar de bestaande partnerketen, weigering van zelfbeoordeling door de vertegenwoordiger, intrekking, verlopen toegang en bewijsherstel zonder herleving. Bestaande partnerpublicatie en vacature-/sollicitatieketen zijn gericht op verenigbaarheid gecontroleerd. API- en presentatiecontroles bewaken gesloten flags, geen administratieve eigen writes, geen private extra velden en veilige tekst-/linkweergave. CC-lint/typecontrole en beide productiebuilds slagen. De automatische CI blijft intact; native PostgreSQL-opbouw is geen lokaal bewezen uitkomst van deze stap.

Er zijn geen live accounts gekoppeld, delegaties verleend, partners gepubliceerd, migraties toegepast of containers gewijzigd. Uitgebreide hele-app-acceptatie blijft op verzoek vóór productie. Nog resterende F4-bouw omvat onder meer statische inhoud, gecontroleerde inhoudsmigratie en redirects; beleidsbesluiten en operationele toegang vereisen hun eigen vastlegging. De oorspronkelijke acceptatiematrix en open F1/F2/F3-bewijsgrenzen blijven behouden.
