# Inhoud, media en redirects

Bron: de bewaarde website-inventaris van **3 oktober 2026**, nu opnieuw lokaal gelezen. Dit is geen actuele crawl en bevestigt geen huidige personen, vacatures, sponsorrelaties of productclaims. De inventaris bevat 98 unieke URL-records; daarin zitten pagina’s, aliassen, blogarchieven en shopverwijzingen. Het aantal URL-records is geen aantal te publiceren pagina’s.

Alle 98 records hebben een voorgestelde classificatie/behandeling in [het migratieregister](content-migration-register.json). Geen item is geïmporteerd, goedgekeurd of als redirect ingesteld. De ene bronfout met een ongeldige blog-URL blijft apart zichtbaar. De bron vermeldt ook 11 kalenderitems, vier formulieren en 210 afbeeldings-URL’s; die zijn geen nieuw gecontroleerde inhoud of zelfstandig getelde te migreren assets.

## Behandeling

- Home/Over BESC/team: conceptteksten maken, feitelijke rollen controleren, eigen persoons-/beeldtoestemming per publicatie. Geen oud team automatisch weer publiceren.
- Blog: historische datum/auteur/bron bewaren, concepten per werkelijk artikel; archief/paginering apart naar /nieuws voorstellen. Publicatiedatum niet vervangen door importdatum.
- Events: oude kalender- en eventinhoud aan bestaande CC-eventbron relateren; dubbelen eerst herkennen. Voorbij is niet actief; geen oude planning als nieuw event presenteren.
- Partners/esports: huidige rollen en logo-/claimrechten controleren. Logo alleen bewijst geen actuele sponsoring; oude shop-/sponsorclaims blijven concept.
- Vacatures/formulieren: controleren of een functie nog bestaat; vervangen door de CC-intake, oude externe formulierlink pas uitfaseren na bewezen duurzame opslag. De eerste versie vraagt aanmelden; geen bestaande aanmeldgegevens zonder doel/grondslag overnemen.
- Foto’s/mediakit: bron, eigenaar, beeldrechten, opt-in, alt/credit, formaat en intrekking per asset. Geen Google Photos-/Drive-link als vrij openbaar bestand beschouwen. Geen nieuwe bulkdownload of permanent publieke bucket.
- Privacy/cookies/voorwaarden: concept op werkelijke verwerkingen en embeds; menselijke beoordeling vóór publicatie. Geen automatische overname als actuele juridische tekst.
- Shop/steun: bestaande externe route als bron bewaren; geen F4-checkout, productverkoop of uitfasering van betaalstroom. Definitieve bestemming blijft een afzonderlijk besluit.

## Redirectinvarianten

Elke oude URL blijft herleidbaar naar bron, voorgesteld doel, beoordeeld besluit en verificatie. Aliassen kunnen veel-op-één worden gekoppeld. Nieuwe slugs zijn uniek per taal/type; collisions worden handmatig beoordeeld. Voordat een redirectconfig wordt gegenereerd: exacte oude host/path/query herkennen, relatieve toegestane doelroute, geen onbeoordeelde querydoorvoer/open redirect, geen loops/ketens, bestaand doel of expliciet 410-besluit. Geen generieke alles-naar-home fallback.

301/308-keuze, productiecanonicals, sitemap/robots en legacy-hostownership worden bij de productieovergang besloten. Op staging blijven noindex en no-store. Geen DNS of Google Sites wijzigen in F4-voorbereiding. Vóór F6 is een actuele inventaris/diff nodig, inclusief de nog ongeldige bron-URL, niet alleen de momentopname van 3 oktober.

## Redactionele oplevering tijdens F4-bouw

Per werkelijk inhoudsitem: bronsnapshot, voorgestelde nieuwe bron/slug, behouden/herschrijven/samenvoegen/archiveren, concepttekst, mediarechten, verantwoordelijke, ontbrekende feiten, review en vrijgave apart. Alleen echte gelezen broninhoud als concept gebruiken; geen lege pagina’s met verzonnen programma’s of fictieve partnerclaims vullen.
