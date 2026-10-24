# F4 — werkpakketten en bouwvolgorde

## F4.0 — Basis en hergebruik

Baseline, inhoudsinventaris, bevoegdheden en bestaande portalen vergelijken. Geen oude toegang automatisch overnemen.

Afhankelijk van: vastgelegde F3-baseline. Op te leveren: bronregister; fit-gap; besluitenregister. Status: gepland, niet uitgevoerd.

## F4.1 — Publicatie- en aanvraagcontracten

Afzonderlijke platformprojecties, veilige intake, eigen toegang en intrekking; F1/F2 nieuws/events compatibel houden.

Afhankelijk van: F4.0. Op te leveren: CC-model/RPC/API; versiecontracten; beperkte negatieve contractchecks. Status: gepland, niet uitgevoerd.

## F4.2 — Creator Network

Eigen profielvoorstel, platformlinks, veldgerichte opt-in, review, publicatierevisie, filters en intrekking.

Afhankelijk van: F4.1. Op te leveren: CC-creatorwerkstroom; website /creators; eigen profielbeheer. Status: gepland, niet uitgevoerd.

## F4.3 — Esports en partners

Eén partnerregister met meerdere bevestigde rollen; publieke profielen, esportsfilter en samenwerkingsaanvragen.

Afhankelijk van: F4.1. Op te leveren: partnerpublicatie; website /samenwerkingen en /esports; private aanvragen. Status: gepland, niet uitgevoerd.

## F4.4 — Vrijwilligers

Vacatures, beperkte aanvraag, eigen ontvangst/status en afgeschermde CC-opvolging zonder automatische aanstelling.

Afhankelijk van: F4.1. Op te leveren: vacatures; aanvragenwerkvoorraad; status- en bewaarbehandeling. Status: gepland, niet uitgevoerd.

## F4.5 — Mijn BESC

Eén eigen overzicht voor profiel, verklaringen en aanvragen; expliciet gedelegeerde partneracties. Bestaande portalen blijven compatibel.

Afhankelijk van: F4.2, F4.3, F4.4. Op te leveren: website /mijn-besc; beperkte eigen API; CC-portaalkoppelingen. Status: gepland, niet uitgevoerd.

## F4.6 — Inhoud en redirects

Bestaande inhoud als concepten voorbereiden, statische pagina’s en volledige URL-mapping; rechten en actualiteit zichtbaar houden.

Afhankelijk van: F4.1. Op te leveren: 98-regels migratievoorstel; redactionele concepten; redirectplan. Status: gepland, niet uitgevoerd.

## F4.7 — Oplevering en latere acceptatie

Afzonderlijke releases, minimale bouwchecks en één gezamenlijke preproductieacceptatie voorbereiden.

Afhankelijk van: F4.2, F4.3, F4.4, F4.5, F4.6. Op te leveren: twee PR-/releasestromen; migratiemanifest; terugvalplan; open bewijsregister. Status: gepland, niet uitgevoerd.

## Mijlpaal die eerst reviewbaar moet zijn

**Eén creatorprofiel:** eigen account → beperkt profielvoorstel → expliciete veldscope en doeltekst → onafhankelijke review van exacte revisie → afzonderlijke stagingvrijgave → profielkaart/detail → nieuwe revisie → intrekking. De bouw bevat de noodzakelijke opslag-/rechten-/contractchecks; de volledige handmatige variantmatrix wordt bewaard voor vóór productie.

## Oplevering per repository

- CC: schema-/migratievoorstel, servermodel/RPC’s, beperkte API, werkvoorraad, toestemmings-/reviewbediening, bronmigratie en releasebewijs.
- Website: gedeelde versiecontracten als gecontroleerde kopie, pagina’s, eigen formulieren/ontvangststatus, server-only API-client, navigatie en thema’s, privacyvriendelijke foutmeldingen.
- F4.6-content: alle oude URL’s herleidbaar, concepttekst/bron/mediarechten/definitief akkoord per item; geen productie-redirectconfig uit onbeoordeelde voorstellen.
- F4.7: exacte SQL-/imagehashes, afzonderlijke uitrolpakketten en één open preproductiematrix. Voorbereid ≠ gebouwd ≠ gemigreerd ≠ uitgerold ≠ productie-aanvaard.
