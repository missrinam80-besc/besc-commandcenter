# F2 — CC-publicatie naar afgeschermde website

Uitvoering door Linda goedgekeurd op 22 oktober 2026. Website en F2-voorbereiding staan in de afzonderlijke private repository missrinam80-besc/besc-website. De Discordbot verandert niet.

CC levert beveiligde staging-API-routes onder /api/v1/publications en bediening onder /app/administratie/website. Het nieuwe additieve model bewaart exacte F1-snapshots en expliciete vrijgave, vervanging, periode, intrekking, audit en request receipts. Lezen vraagt een sitecredential en actuele viewer; SQL controleert geverifieerd e-mailadres, actieve account/organisatie, geldige Auth-sessie en afzonderlijke eindige testerbinding. Viewer krijgt geen directe tabellen of Storage. De medialocator vraagt aanvullend de server-only sleutel. Media worden begrensd verwerkt, zonder metadata, en via actuele autorisatie en byteshash uitgeleverd.

De globale F1-transactiesluis is behouden voor alle F2-mutaties. PostgreSQL 17.11-proeven bevestigen één winnaar bij dezelfde epoch, intrekking tegen vertraagde publish en F1-revisie-intrekking tegen publish. Geen historische migratie of F1-gegevens worden aangepast. De twee F1-tellingstests bewaken nu expliciet de F1-grens; nieuwe F2-migraties vallen daarbuiten. F1-bronhashes blijven gecontroleerd.

Next.js is bijgewerkt naar 16.4.2, React naar 19.3.1 en sharp naar 0.35.5 na controle van de officiële beveiligingspublicatie, registry en GitHub-release. De update geldt voor deze release; zij bewijst niet dat de bestaande DEV-server al bijgewerkt is.

## Releasegrens

Het exacte SQL-bestand en de LF-hash staan in ops/f2-release-manifest.json. De cloudbasis heeft 123 historie-items, F2 voegt één toe: 124. De oude seed blijft uitgesloten. De migratie is uitsluitend geïsoleerd toegepast; Cloud DEV is nog niet gemigreerd. Eerst verse schemavergelijking, handmatige back-up, afgeschermde off-server kopie en herstelproef. Bij fout niet blind herhalen; huidige toestand alleenlezend beoordelen.

De bestaande handmatige export is aangescherpt tot verify-full met het reeds gecontroleerde Supabase CA-certificaat en vaste checksum. Dit verifieert de serveridentiteit naast versleuteling; er is geen TLS-bypass of nieuwe automatische back-upplanning. Het publieke CA-bestand bevat geen credential.

API en bediening staan standaard uit: BESC_PUBLICATION_STAGING_ENABLED moet expliciet true zijn. BESC_PUBLICATION_SITE_ID bindt de ene stagingregistratie; BESC_PUBLICATION_KEY_SHA256 bevat alleen de hash van een nieuwe afzonderlijke sitecredential. Geen botclient of bestaande credential hergebruiken. Website krijgt alleen BESC_PUBLICATION_KEY, BESC_AUTH_URL en de publishable Auth-key; geen database- of service_role-credential.

De oude CC-image blijft compatibel met het additieve schema; terugval sluit eerst staging, herstelt gecontroleerde image/config en behoudt audit. Een echte serverrollback blijft apart te bewijzen. De vier bestaande uitgeschakelde flags blijven uit; Twitch-identiteitskoppeling blijft aan. Geen automatische back-ups of productieomschakeling.

## Huidig bewijs

1.036 lokale CC-tests groen, inclusief 16 F2 API-/databasegevallen; de databasegevallen zijn ook op native PostgreSQL 17.11 uitgevoerd. Volledige lint, TypeScript en productiebuild groen. Drie native racevarianten groen. Websitecontracten, echte standalone-browser en container zijn afzonderlijk getest in de websiterepository; die browser gebruikt fictieve Auth-/CC-upstreams en is geen Cloud-Auth-acceptatie.

De Supabase-dashboardvoorcontrole was alleenlezend: historie 123, oude seed uitgesloten, laatste migratie f1_editor_catalog, geen F2-tabellen, nul goedgekeurde publicatierevisies en auth.sessions aanwezig. Dit is een basale voorcontrole, geen volledige actuele catalogusvergelijking of back-upbewijs. De platformlabel main PRODUCTION verwijst naar het bestaande Supabase-project dat BESC als DEV gebruikt; er is geen nieuwe productieomgeving ingericht.

De gebruiker voert de serverstappen zelf uit in Termius. Elke overdracht noemt BESCSRVDEV, de exacte map, het doel en of iets wijzigt. Testeraccountbinding, one.com-DNS, actuele Caddyconfig en live cache-/rol-/terugvalproeven blijven open tot gecontroleerde uitvoering.
