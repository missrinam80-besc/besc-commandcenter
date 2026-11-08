# CA03 — pakket 3: voorbereiding van één live creatorproef

Pakketten 1 en 2 zijn samengevoegd en op 8 november 2026 uitgerold naar Command Center DEV, versie `5e67494`. Cloud DEV heeft de twee bijbehorende migraties (153 geregistreerd). Dat is de beginsituatie; het betekent niet dat de creatorfunctie al actief is. De bestaande organisatiekanalen blijven buiten deze proef.

## Gekozen kandidaat en gecontroleerde beginsituatie

De gebruiker heeft `https://www.youtube.com/@missrinam80` aangewezen. De gewone kanaalpagina toont beheerkoppelingen naar kanaal-ID `UCHDALLAy_vfOip7m8XdrOYA`. Dat is een UI-waarneming, nog geen geslaagde OAuth-/Analytics-eigendomscontrole. De Google-adapter moet bij de uiteindelijke codewisseling zelf precies het gekozen kanaal bevestigen. Het persoonlijke Google-inlogaccount is inmiddels door de gebruiker opgegeven en staat uitsluitend in het lokale proefbewijs. De gebruiker heeft bevestigd dat nog geen eigen proefvideo beschikbaar is; de geopende Studio-sessie onder het zakelijke account meldde geen toegang tot het persoonlijke kanaal.

Een alleen-lezen inventaris vond één passend actief, bevestigd BESC-account. De echte UUID staat alleen in het lokale bewijsbestand, niet in een gedeelde voorbeeldconfiguratie. De DEV-container draait als UID/GID 1001 en heeft op dit moment geen creatorconfiguratie, creatorvariabelen of opslagmounts. De creatorfunctie is uit. De proxy heeft geen expliciete access-logdirective; de volledige log-/bewaarinrichting moet vóór activering nog worden vastgesteld.

Na expliciete toestemming is op 8 november 2026 **BESC Creator YouTube DEV**, ID **besc-creator-youtube-dev**, binnen **belgianstreamerscommunity.be** aangemaakt. Google koppelde dit automatisch aan een bestaand facturatieaccount. Na afzonderlijke expliciete toestemming, inclusief de getoonde waarschuwing, is uitsluitend het nieuwe lege project daarvan losgekoppeld. De Google-console bevestigt dat de facturatie voor dit project is uitgeschakeld; Scorebord en BESC Command Center bleven gekoppeld. Er zijn door deze stap geen betaalde diensten, OAuth-clients of serversleutels aangemaakt. De aanvankelijke automatische goedkeuringsweigeringen zijn met de concrete gebruikersakkoorden opgevolgd; er is geen alternatieve uitvoerroute gebruikt.

## Lokale beperking van de proef

De nieuwe runtimeconfiguratie vereist `pilot.ownerId`, `pilot.channelId` en `pilot.expiresAt`. Er is geen terugval naar ‘alle gebruikers’. Zonder die velden blijft de runtime onbeschikbaar. Het accountonderdeel wordt alleen aan de aangewezen gebruiker aangeboden; de API verifieert de daadwerkelijke BESC-sessie onafhankelijk. De eigenaarcontrole gebeurt vóór het openen van opslag of wrapping-keybestand. Een adminrol of bewerkbare gebruikersmetadata verleent geen uitzondering.

Binnen de proef kan alleen het aangewezen kanaal een nieuw consent krijgen. Dat consent mag niet voorbij het afgesproken einde van de proef lopen. De lijst wordt op dat kanaal beperkt; een directe link naar een andere eigen koppeling geeft geen toegang. Ook een eerder opgeslagen job voor een ander kanaal kan via de serverpoort niet naar Google worden afgegeven.

Na het einde blijven eigen status en herstel/intrekking beschikbaar. Nieuwe toestemmingen, collectie, vernieuwing en nieuwe autorisatie worden geblokkeerd; de server retourneert geen metingen meer. De status wordt niet fictief van ‘active’ naar ‘revoked’ veranderd: `access_available=false` maakt de aparte proefgrens zichtbaar. Dit is een toegangslimiet, geen gegevensverwijdering of bevestigde Google-intrekking. Uitschakelen van de hele runtime en intrekken van bestaande providerrechten blijven verschillende handelingen.

## Configuratie en opslag die nog moeten worden ingericht

De Compose- en JSON-voorbeelden onder `ops/creator-youtube-pilot.*.example.*` zijn voorbereid, niet geïnstalleerd. De Compose-override zet de functie expliciet op false, maakt ontbrekende hostpaden niet automatisch aan en mount configuratie/wrapping key alleen-lezen. De bestaande uitrol gebruikt dit voorbeeldbestand niet vanzelf. De JSON bevat onbruikbare placeholders en `isolatedProject=false`; kopiëren ervan activeert niets.

Voorgestelde paden zijn `/opt/besc-secrets/creator-youtube/` voor configuratie en wrapping key en `/var/lib/besc-creator-youtube/` voor de afzonderlijke mappen `attempts`, `receipts` en `keys`. Het keybestand blijft buiten de opslagboom en alles blijft buiten `/app`. De applicatie moet de bestaande bestanden met UID 1001 kunnen lezen/schrijven: private bestanden 0600, opslagmappen 0700, eigenaar passend bij de container. Het Google-clientgeheim mag nooit in Git, screenshot, chat, publieke buildvariabele of gewone buildlaag terechtkomen.

Werkelijke sleutelinitialisatie, credentialopslag, mounts, een herstelkopie met afzonderlijke sleutelbewaring, Compose-wijzigingen en herstart vereisen nog een concreet vrijgegeven uitvoerplan. Er is in deze voorbereiding geen echte sleutel gemaakt of gekopieerd en geen serverconfiguratie gewijzigd. De lokale sleutelring- en procesherstelproeven vervangen geen offsite herstelproef van de uiteindelijke Cloud/Vault/bestandscombinatie.

## Voorwaarden voor de daadwerkelijke creatorproef

| Onderdeel | Huidige toestand | Vereist vóór activering |
| --- | --- | --- |
| Nieuwe pilotpoort | Lokaal gebouwd | Review, samenvoeging, image en afzonderlijk toegelaten DEV-uitrol |
| Google-project | Aangemaakt en gecontroleerd; facturatie uit | OAuth/API-inrichting nog afzonderlijk voorbereiden en vrijgeven |
| Google-client | Ontbreekt | Webclient, juiste testgebruiker, exacte HTTPS-callback, minimale twee readonly-scopes en API-inrichting |
| Sleutels en herstel | Niet geprovisioneerd | Private opslag/mounts, een gecontroleerde herstelkopie en herstelinstructie |
| Creator/video | Kanaal-ID en Google-account bekend; nog geen eigen proefvideo beschikbaar | Juiste Studio-sessie en één bestaande eigen video bevestigen, zonder nieuwe publicatie |
| Doel en termijnen | Geen echte waarden vastgelegd | Expliciet doel, meetvenster, proefeinde, bewaren, verwijderen en verwijderverzoek afspreken |
| Providerherstel | Onzekere/onvolledig gevalideerde antwoorden blijven open | Geteste afhandeling en opvolging; geen geforceerde succesvolle opruiming |
| Privacy en logs | Nog niet afgetekend voor deze functie | Juiste informatie/links, verwijderroute, callback-/tokenredactie en bewijs voor de feitelijke inrichting |
| Live acceptatie | Niet uitgevoerd | De eigenaar geeft zelf Google-toestemming; één meting, controle en intrekking binnen de vrijgegeven scope |

De proef haalt geen gegevens van andere creators op, voegt geen deelnemers toe, start geen periodieke creatorcollectie en publiceert geen berichten of video’s. Er wordt ook geen video aangemaakt om een ontbrekende eigen proefvideo te vervangen.

## Bronnen voor de voorwaarden

Google verlangt een scheiding tussen test- en productieprojecten, passende scopes, contactinformatie en veilige redirects. Zie [OAuth-productievoorwaarden](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance). Dit vormt geen bewijs dat het beoogde project al correct is geconfigureerd.

De [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies), met name III.A en III.E, beschrijven informatie/toestemming, geautoriseerde zichtbaarheid, opslag/verversing en de verwijderroute. Een ingevuld `retain_until` verbergt gegevens na afloop maar voert geen verwijdering uit. De vereiste verwijderafhandeling moet daarom aantoonbaar worden ingericht voordat echte creatorinformatie wordt opgeslagen. Deze notitie kiest geen nieuwe BESC-bewaartermijn en is geen juridische aftekening.

## Afgeronde lokale verificatie

- **1.661 tests geslaagd, nul mislukt**, waaronder de vier nieuwe geïntegreerde pilotproeven en de nieuwe schermproef voor intrekking na afloop.
- **20 geïntegreerde applicatie-/runtimeproeven** slagen ook onder Linux met PostgreSQL 17.11, echte Supabase SSR-/clientbibliotheken en echte private bestandsopslag. Auth-/PostgREST-HTTP, Google en Vault zijn nagebootst.
- Lint, TypeScript en de lokale webpack-build slagen. De bestaande 27 standalone-tracewaarschuwingen van de gedeelde dependency-junction blijven een lokale bouwbeperking.
- Er zijn geen SQL-bestanden of dependencies gewijzigd, geen PR/push/merge uitgevoerd en geen applicatie- of Cloud DEV-uitrol gedaan. Deze pilotpoort staat alleen lokaal; live blijft de eerder uitgerolde versie `5e67494` met de creatorfunctie uit.

Pakket 3 is hiermee **gestart, niet afgerond**. Het Google-project is een werkelijk uitgevoerd onderdeel; de pilotpoort en montagevoorbeelden zijn lokale voorbereiding. OAuth-inrichting, proefvideo, sleutelprovisioning/herstel, privacy/verwijdering, onzekere providerafhandeling en de echte creatorproef blijven open.
