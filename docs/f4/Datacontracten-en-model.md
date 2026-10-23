# F4 — datacontracten, API en model

Alle namen en routes hieronder zijn een voorstel voor implementatie, geen bestaande endpoints of uitgevoerde migraties. Het machineleesbare [contract](contracts/platform-contract.json) en de [DTO-schema’s](contracts/public.schema.json) zijn reviewartefacten.

## Modelkeuzes

| Functioneel object | Hergebruik | Noodzakelijke uitbreiding / invariant |
| --- | --- | --- |
| Eigenaar/identiteit | `community_people`, Auth en expliciete bestaande accountbinding | Platformtoegang voor externe gebruikers los van intern lidmaatschap; unieke organisatie/accountcontext, intrekking en bronbewijs. Geen automatische publieke persoonsaanmaak op email-match. |
| Creatorprofielvoorstel | Bestaande persoon als interne eigenaar | Versiegebonden publieke velden en mediareferenties; exact doel/consent en opt-inveldselectie; immutable voorstel na indienen. |
| Organisatieprofiel | `partners`, actuele `partner_roles`, concrete relaties | Uitdrukkelijke vertegenwoordigingsbinding en publieke claims; meerdere rollen per organisatie, geen nieuw organisatieregister. |
| Vacature | Bestaande CC-taken/inbox als behandelbestemming | Afzonderlijk vacaturedossier met titel/rol/beschrijving/voorwaarden/openings- en sluitingsvenster; publicatie is geen aanstelling. |
| Aanvraag | Referentie naar persoon/partner/vacature waar gecontroleerd | Private intake-envelop, canonieke payloadhash, actor/site/request, versie, ontvangst, categorie, toewijzing en statusgeschiedenis. Geen generieke JSON-doorgeefroute. |
| Publicatierevisie/-vrijgave | F1 hash/review en F2 pointer/epoch/concept | Nieuwe typen creator/partner/vacancy/page; aparte versiegrens houdt oude event/news-contracten intact. Goedkeuring en vrijgave blijven aparte handelingen. |
| Media | Private bucket, opaque publieke media-ID, bestaand bronbewijs | Expliciete nieuwe-type locatorcheck, huidige rechten en opt-in; geen permanent publiek Storage-object of signed URL in DTO. |
| Statische pagina / migratie | Bestaande nieuws/eventbronnen waar betekenis overeenkomt | Voor overige informatie een eigen paginabron, bronversie, inhoudsreview en URL-register. Geen omvorming naar nepnieuws. |

Fysieke tabellenamen en aantallen worden bij de code-impactreview van F4.1 vastgezet. Geen migratienaam verzinnen in het voorbereidingspakket. Eerst CLI `migration new`; vervolgens exact SQL-/grant-/effectenmanifest en geen seed/import/aanstellingen in dezelfde schemawijziging.

## Publieke DTO’s

Gemeenschappelijk: schemaversie, opaque `public_id`, revisie, type, taal, slug, publicatietijd en geldigheidsvenster. Geen interne `person_id`, `user_id`, `partner_id`, `consent_id`, brondocument, email, telefoon, contactpersoon, contract, budget of reviewnotitie. Alleen toegelaten media-ID/alt/credit.

- Creator: gekozen publieksnaam, korte bio, gecontroleerde platformlinks, toegelaten disciplines/talen en optionele avatar; geen volgersranglijst, email, live-status of private statistiek.
- Partner: goedgekeurde naam/beschrijving, afzonderlijk geverifieerde actieve publieke rollen, openbare website en toegelaten logo. Geen sponsorwaarde of contactgegevens. Esports is een filter op bevestigde rol, geen tweede partnerkopie.
- Vacature: publieke titel, rol, beschrijving, tijd-/plaatslabel en sluitingsmoment. Formulier verwijst naar stabiel publiek vacature-ID en hercontroleert actuele openstelling op commit.
- Pagina: exact beoordeelde titel/samenvatting en gesaniteerde eenvoudige HTML, zonder embeds/scripts/trackingpixels.

Schema-validatie alleen controleert geen eigenaarschap, URL-host/credentials, veilige HTML, actuele toestemming of mediarechten. Die servervoorwaarden horen expliciet bij F4.1. Platformlinks zijn navigatielinks, nooit fetchbestemmingen; geen SSRF/discovery.

## Voorgestelde API-grens

`/api/v1/platform/publications/{creators|partners|vacancies|pages}` en detail per slug leveren uitsluitend de nieuwe DTO-versie. Gesloten staging vereist actuele viewer én afzonderlijke serverkey, site, tijdvenster en geldige publicatierevisie. De bestaande `/api/v1/publications/{news|events}` en media blijven compatibel.

`/api/v1/platform/me` en `/api/v1/platform/applications` vereisen eigen sessie/expliciete context. Geen brede servicekey-only eigen route. `me` geeft een beperkte eigen projectie, geen oude sponsor/streamer-RPC payload. Partneracties controleren een actuele, objectgebonden delegatie.

De afzonderlijke methoden, payload-/responsgrenzen en actorvereisten staan in [API-operaties](contracts/api-operations.json). Een `purpose_version_id` in een profielvoorstel benoemt uitsluitend de voorgestelde doeltekst: het is geen bevestigde verklaring. Persoonlijke instemming gebeurt via een aparte eigen handeling met expliciet `accepted=true`, exacte veldscope en doelversie. Een aanvraag zelf verleent geen publicatiegoedkeuring. Intrekking is een afzonderlijke write met request-ID en actuele eigen context.

Read-only JSON: no-store, nosniff, beperkte payload, vaste sortering/cursor en maximum 50 per pagina. Een overschrijding of onvolledig contract geeft een fout, geen stilzwijgend afgekapt ‘compleet’ overzicht. De website weigert onbekende schema’s en gevoelige extra velden. Geen oude stale fallback als toegang is ingetrokken.

Writes: same-origin/CSRF-bescherming, actuele sessie, bounded veldlijsten en payloadgrootte, duurzame serverlimieten per actor/site/categorie, expliciete aanvraagsoort en idempotency-key. Een in-memory teller alleen is onvoldoende voor meerdere workers. Invoer wordt niet naar opgegeven email/URL doorgestuurd. Bestanden, externe callbacks en automatische uitnodigingen vallen buiten de eerste intake.

## Aanvraagcontract

Eerste categoriekeuzes: creator_profile, partnership en volunteer_application. Respectievelijk profielvoorstel, gecontroleerde partner-/samenwerkingsinformatie, of vacature-ID/motivatie/beschikbaarheid. Email wordt waar nodig uit het geverifieerde account afgeleid en blijft privé; telefoon is geen standaardveld. Buiten scope liggende data wordt geweigerd.

Opslag, immutable ingediende payload, behandelingsgeschiedenis, ontvangst en optionele CC-taak/inboxkoppeling gebeuren atomair. Ack pas na commit; dezelfde actor + key + payload geeft dezelfde ontvangst; andere payload met dezelfde key geeft conflict. Een retry na ingetrokken toegang mag geen oude data teruggeven. Geen netwerkmail nodig om opslag als geslaagd te melden.

## Toestanden

Profiel/pagina/vacature: eigen concept → ingediend → wijzigingen gevraagd of exacte review → apart vrijgegeven → vervangen of ingetrokken. Wijziging maakt een nieuwe revisie, zonder geërfd akkoord. Eigen aanvraag: ontvangen → toegewezen → in behandeling → meer informatie gevraagd / afgewezen / administratief afgerond; teruggetrokken is een apart spoor. Afgerond is geen benoeming, contract, portaalgrant of profielpublicatie. Interne beoordeling/notities blijven intern, ook bij eigen statusinzage.
