# F4 — uitvoering en terugval voorbereiden

## Baseline

CC main `b7ab31b63f0754fee3fb3c578d7488cb25f4dd6e`; website main `3c3a841a183c8f04f4e2394d41db1da5754ede01`. De gebruiker bevestigde de CC-image `sha256:9f124aa91409226d7efb6c49feff88a878e7a912292c69a9841e6580ced8bd64` gezond, 126 registraties, bestaande instellingen gelijk, website/Caddy ongewijzigd. Terugvaltag `besc-commandcenter:f3-completion-before-20261023T144541Z`; uitrolbewijs `/var/backups/besc-command-center/f3-completion-deploy/20261023T144541Z-3OAshz`. Dit is gebruikersbewijs, geen nieuwe F4-serverinspectie.

F4 voorbereiden autoriseert geen migratie, deploy, activering, roltoekenning, publicatie, nieuwe live accounts of DNS-wijziging. Lokale bouw kan later binnen de gekozen opdracht plaatsvinden; externe stappen krijgen een concreet pakket en hun eigen vrijgave. De gebruiker voert serverstappen zelf uit in Termius. Geen geheimen of databasewachtwoorden in Git/chat/pakket.

## Releasevolgorde voor de bouw

1. Nieuwe baseline lokaal vastleggen; vóór live handeling actuele server-/Cloudmetadata en capaciteit controleren. Laatste server is klein; geen ruimte vrijmaken door willekeurig volumes, back-ups of terugvalimages te verwijderen.
2. Additieve schemawijzigingen met expliciete effect-/grantreview; oude migraties/seed blijven intact. Exact lokaal gecreëerde migraties, bronhashes en historievolgorde vastleggen. Verwacht aantal pas bij definitief SQL vastzetten, geen fictieve migratieversies in dit pakket.
3. CC-provider deploybaar met nieuwe functies standaard uit en oude F1/F2/F3-consumenten compatibel. Bestaande nieuws/events en eigen portalen blijven werken.
4. Afzonderlijke websiteimage met contractversiecontrole; pas daarna beperkte stagingtoegang en expliciete functievrijgave. Geen wildcard callbacks, shared cookie domain of extra algemene beheerrechten.
5. Migratie vóór code die het nieuwe model gebruikt; SQL Editor-uitvoering is niet automatisch migratiehistorie. Kies één gecontroleerd pad. Bij reeds toegepast schema eerst alleen lezen en daarna uitsluitend passende historieregistratie, nooit blind SQL herhalen.
6. Voor elke serverstap: **BESCSRVDEV** en correcte map vermelden. CC-map `/opt/besc-dev/command-center`; websitemap `/opt/besc-dev/website`. Aparte uitrolpakketten met manifest, vaste digest, checksums, behoud van env/Caddy en terugvaltag. Geen `latest`-aanname en geen build op de kleine VPS.
7. Eindcontrole beperkt tot exacte image, gezondheid, migratieregistratie en invarianten. Grote browser-/actor-/misbruikmatrix bundelen voor preproductie.

## Terugval en intrekking

Functies dichtzetten is een afzonderlijke, expliciete toestand; niet stiekem schema of rechten herstellen. Bewaar vorige beide images en afgeschermde configuratie vóór mutatie. CC-/websitecontracten moeten eerst additief zijn zodat de vorige consument kan blijven draaien. Nieuwe type-entry’s mogen de oude F2-union niet breken.

Image-terugval verwijdert geen nieuwe rijen. Geen down-migratie/drop als standaard herstel. Bij schemafout: veilige functiesluiting, bewijs bewaren en forward-fix of gecontroleerde geïsoleerde restorebeslissing. Een herstelproef met Database/Auth/Storage/Vault is afzonderlijk bewijs; een gezonde oude container bewijst die niet.

Na een eventuele DEV-proef: tijdelijke taken/toegang expliciet beëindigen, testpublicaties en media intrekken, fixtures herkenbaar bewaren/opruimen volgens besluit en flags teruglezen. Geen automatische terugval naar historische toestemming of oude publieke inhoud. F4 bereidt productieovergang/redirects voor, maar schakelt website of DNS niet om.
