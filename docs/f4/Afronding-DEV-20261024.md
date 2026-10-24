# F4 — bouw en DEV-oplevering afgerond

Vastgelegd op 24 oktober 2026, na het akkoord van de opdrachtgever om F4 begrensd af te sluiten, aanvullende privacyautomatisering apart te plannen en de volgende fase aan het oorspronkelijke traject te toetsen.

## Besluit en bewijsgrens

De F4-bouw en technische DEV-oplevering zijn afgerond. Dit besluit is geen websitevrijgave, geen volledige functionele acceptatie en geen productieacceptatie. De uitgebreide hele-app-acceptatie blijft, zoals gevraagd, vóór productie gepland. Open bewijsgrenzen uit F0–F3 blijven bestaan.

De oorspronkelijke scope omvat creatorprofielen en Mijn BESC, private contact- en samenwerkingsaanvragen, partner- en esportsvermeldingen, vrijwilligersvacatures en sollicitaties, partnerdelegatie, informatiepagina’s, navigatie en voorbereiding van inhoudsmigratie en redirects. CC beheert dossiers en vrijgaven; de website blijft een afzonderlijke private repository en gebruikt beperkte API’s.

## Opgeleverd

| Onderdeel | Stand binnen deze afsluiting |
| --- | --- |
| Applicatiebouw | De bovenstaande functies zijn gebouwd; bestaande nieuws- en eventketens worden hergebruikt. |
| Database DEV | Zeven migraties geregistreerd: 126 → 133. Bestaande historie en rijen behouden; 28 lege private tabellen afgeschermd. |
| CC DEV | Beoordeelde image uitgerold en door de operator gezond bevestigd; acht F4-beheerfuncties ingeschakeld. |
| Website DEV | Beoordeelde image uitgerold en door de operator gezond bevestigd; acht F4-websitefuncties blijven uit. |
| Inhoudsmigratie | Register van 98 historische URL’s en drie concepten voorbereid; inhoudelijke review, import en productieomschakeling blijven open. |
| Toegang en inhoud | Geen nieuwe F4-rollen of echte inhoud vrijgegeven met deze oplevering. |

De bestaande staginginstelling is behouden en is geen bewijs dat F4-webfuncties zijn geopend. Caddy, overige website-instellingen en Twitchkoppeling zijn volgens de operatoruitvoer behouden. Rewards, Discord-slotmeldingen, F3-proef, echte campagnes en officiële Twitch-ophaling blijven uitgeschakeld.

## Herleidbaar technisch bewijs

- CC PR #120: https://github.com/missrinam80-besc/besc-commandcenter/pull/120, gemerged als `80c883902400a31ee06f9c61f7b4a2e042aee714`.
- Website PR #4: https://github.com/missrinam80-besc/besc-website/pull/4, gemerged als `efae991ed9f10c311e663f91ce01fcbf2f03bf15`.
- CC-image: `sha256:6f80f656abf4768ecbb9b1fa445c5c42aa0a237a93896ad001a7b1e218a9c221`.
- Websiteimage: `sha256:f9843c93492bbf721e4cb11334e3739cfbf1da6808b505922a34567567b6dd2d`.
- Operatorbewijs CC: `/var/backups/besc-command-center/f4-cc-deploy/20261024T130755Z-LbmYDQ`.
- Operatorbewijs website: `/var/backups/besc-command-center/f4-website-deploy/20261024T131115Z-rXXKTd`.
- Operatorbewijs CC-activering: `/var/backups/besc-command-center/f4-cc-administration/20261024T133118Z-LW2soy`.

De serverpaden zijn verwijzingen naar afgeschermd bewijs, geen meegeleverde back-ups. Geheimen horen niet in Git. De huidige terugvalimages zijn bij de uitrol bewaard; een volledige F4-herstelproef wordt hiermee niet bewezen. De opdrachtgever sloeg de verse back-up voor deze F4-migratie expliciet over; dat wijzigt de latere productievoorwaarden niet.

## Nog nodig voor echt gebruik en productie

1. Actuele inhoud, rechten, doelteksten, privacy- en bewaarbehandeling vaststellen. De bestaande concepten zijn voorstellen, geen vastgesteld beleid.
2. De concrete personen uit missrinam en het bestuur per taak aanwijzen; onafhankelijke beoordeling door een andere persoon organiseren. Geen automatische roltoekenning uit deze namen.
3. Toegang, websiteactivering en eventuele inhoudsvrijgaven afzonderlijk besluiten. Geen impliciete vrijgave door deze afsluiting.
4. De 98 bronregels en drie concepten beoordelen; import en redirects pas volgens expliciete besluiten uitvoeren.
5. De oorspronkelijke 46 geplande F4-gevallen en de integrale productievoorwaarden aantonen. Deze afsluiting tekent die gevallen niet af.

Deze punten beperken de gebruiks- en productiegereedheid. Zij worden niet verborgen door de status ‘bouw afgerond’.

## Privacy en vervolg

Privacy blijft onderdeel van het masterplan en een voorwaarde voor opening. Aanvullende automatisering voor bewaren, verwijderen en afhandeling over revisies, media en back-ups wordt apart afgebakend in de gedeelde planning. Zie [Privacyvoorwaarden en aanvullende uitvoering](Privacyvoorwaarden-en-aanvullende-uitvoering.md).

De volgende fase volgens het vastgelegde traject is **F5: gecontroleerde uitbreiding**. De eerste voorbereidingsstap en grenzen staan in [F5 — scope en eerste werkpakket](../f5/Scope-en-eerste-werkpakket.md). Dit document geeft geen opdracht voor live activering of productieomschakeling.

## Historische voorbereiding

De voorbereidingsmanifesten, contractvoorstellen, geplande acceptatiegevallen, werkpakketstatussen en de oorspronkelijke opleverkandidaat blijven herkenbaar als historische momentopnamen. Hun oude formuleringen ‘gepland’ of ‘niet uitgerold’ beschrijven de voorbereiding, niet deze actuele opleverstatus. Deze afsluiting is leidend voor de stand op 24 oktober 2026.
