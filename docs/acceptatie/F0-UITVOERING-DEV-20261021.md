# F0 uitvoering en DEV-acceptatie

Datum: 21 oktober 2026, Europe/Brussels. Vervolg op het [voorbereidingsverslag](ECOSYSTEEM-BASIS-F0-20261021.md), na Linda's uitvoeringsopdracht. Het oorspronkelijke voorstel wordt niet achteraf als al uitgevoerd herschreven.

| Onderdeel | Uitkomst | Bewijssoort |
| --- | --- | --- |
| Bron | [PR #111](https://github.com/missrinam80-besc/besc-commandcenter/pull/111) gemerged na groene controles; main `594392cef96c2e9eb86ac93ea5b476f15038757e`; imagebouw groen. | GitHub gecontroleerd. |
| Handmatige back-up | Gecontroleerde database-/configuratie-export van 21 oktober aangeleverd. | Gebruikersuitvoer; geen nieuwe volledige Storage-/off-server-/herstelacceptatie daarmee bewezen. |
| Preflight | 84 historieregistraties; schema en gecontroleerde gegevensvoorwaarden gelijk aan beoordeelde basis. | Alleenlezende Cloud-inspectie en lokale vergelijking; privébewijzen buiten Git. |
| Historieherstel | Alleen de goedgekeurde 33 versies via officiële CLI geregistreerd. Geen historische migratie-SQL herhaald. | Gebruiker voerde begrensd lokaal pakket uit met verborgen wachtwoordinvoer. |
| Postflight | 117 registraties; alle oorspronkelijke 84 rijen exact behouden; seed `20261001110000` afwezig; gecontroleerd schema en gegevensvoorwaarden gelijk. | Lokaal postflightbewijs gecontroleerd, tijdstip 2026-10-21T11:47:10.287091+00:00. Geen claim over niet-gecontroleerde bedrijfsrijen. |
| Webdeploy | CC DEV healthy na reguliere uitrol. | Door Linda aangeleverde deploymentuitvoer; geen eigen SSH-verbinding. |
| Image/instellingen | Exacte image vergeleken met immutable commit-tag; earning/preview/intake/Discord-slotkeuze uit, Twitchidentiteit behouden. | Linda bevestigde ‘alles is true’ na gerichte servercontrole. |
| Schermacceptatie | Gevraagde nul/ontbrekend/gedeeltelijk/Impressies-weergave, rapport-/CSV- en waar beschikbare sponsorportalcontrole akkoord. | Linda bevestigde ‘helemaal in orde’. Geen automatisch live schermbewijs of nieuwe testdata aangemaakt. |

Het lokale inspectiepakket kreeg een expliciete alleen-lezentransactie nadat een startupinstelling niet was overgenomen. De certificaatfout is opgelost met de officiële Supabase CA voor alleen deze client; echte TLS-/hostnaamcontrole slaagde zonder login of SQL. Certificaatcontrole bleef aan. Beide mislukte pogingen stopten vóór repair. Het latere succesvolle registerbewijs is bepalend.

## Grenzen en volgende fase

De vijf actuele kennisbankconcepten zijn voorbereid en als aanpak bevestigd; niets live ingevoerd/gepubliceerd. De oude seed is niet uitgevoerd en vraagt nog een expliciete definitieve baselineafhandeling. Algemene migration push/include-all/reset blijft ongeschikt.

Geen voorzittersaccount, nieuwe rol of mandaat toegekend; F1 bouwt de geverifieerde binding. Geen botdeploy, nieuwe scopes, verdienregels, saldomigratie, Streamer.bot-inrichting, DNS- of productieomschakeling uitgevoerd. Automatische back-ups blijven uit. Storage, nieuwe off-server kopie en geïsoleerd integraal herstel blijven afzonderlijk te bewijzen waar open.

**Status:** technische F0-uitvoering op DEV afgerond en door Linda geaccepteerd binnen deze scope. Geen volledige juridische of productieacceptatie. [F1](../f1/README.md) bouwt hierop voort.
