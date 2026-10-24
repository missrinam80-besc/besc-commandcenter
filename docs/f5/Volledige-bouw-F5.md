# F5 — gezamenlijke bouwoplevering

24 oktober 2026. Opdracht: alle resterende F5-bouwonderdelen in één pakket afwerken, met noodzakelijke gerichte bouwcontroles en integrale praktijkacceptatie later vóór productie. De eerdere F5.1-leesbasis blijft behouden.

| Werkstap | Gebouwde uitkomst |
| --- | --- |
| F5.0 | Versiegebonden inventaris/hergebruik in PR #122; blijft een historische momentopname van de uitgangspositie. |
| F5.1 | Privéoverzicht van eigen actuele campagnes via de bestaande afzonderlijke CC-/bot-PR’s. |
| Campagne-invoer | `/besc campagne indienen` met campagnelink en postlink, eigen actuele deelname, oorspronkelijke interaction-ID en duurzame replay/conflictcontrole. Kandidaatbijdragen volgen de bestaande onafhankelijke review. |
| Streamer.bot | Afzonderlijke inline C#-actie en Node-adapter met lokale wachtrij, brongebonden sleutels, HTTPS-ontvangst en dynamische intrekking. Clip/VOD wordt kandidaat; streams blijven niet-geverifieerde referenties. |
| Aanvullende socialcapability | Handmatig maximaal tien recente VOD’s en tien clips opvragen voor een gekoppelde Twitch-bron; twee tokenvalidaties, begrensde respons, bronquota en gekozen kandidaat indienen in de bestaande F3-keten. |
| Voorbereid saldobeheer | Beheerdersscherm met consistente CC-snapshot en lokale CSV-vergelijking; aanvullend offline CLI-pakket. Exacte gehele bedragen, controletotaal, dubbele/onbekende koppelingen, reserveringen en privé controleverslag. Geen boeking, samenvoeging of import. |

Dit is een bouwoplevering. F5 is hiermee niet live geactiveerd, formeel volledig geaccepteerd of productierijp verklaard.

## Gemeenschappelijke grenzen

Alle nieuwe functies blijven standaard uit. De bestaande vier rewards-/Discord-schakelaars en F3-/Twitch-schakelaars worden niet gewijzigd. CC, Discordbot en de lokale Streamer.bot-adapter behouden afzonderlijke credentials en uitrol. Website en Caddy zijn niet gewijzigd. Er zijn geen echte bronaccounts, rollen, deelnemers, clients, formulieren of saldi ingericht.

De bot heeft twee afzonderlijke scopes: `campaigns:own:read` en `campaigns:own:write`. Registratie blijft standaard een voorbeeld en vereist bij uitvoering de juiste scopes. De bronadapter heeft uitsluitend `campaigns:reference:write` via een eigen register en tokenprefix; geen Discord-/rewardskey of Supabase-managementsleutel op de streamkit.

Twitch blijft de gekozen eerste bron. Deze beperkte ontdekfunctie voegt geen nieuwe OAuth-scopes, socialplatformen, continue discovery, scraping, publicatiefunctie of bereikmodel toe. Suggesties zijn één begrensde pagina per endpoint, geen volledig campagnearchief. Zij zijn geen officiële campagneprestatie of automatisch geverifieerde bijdrage.

## Gegevens en betrouwbaarheid

Twee additieve F5-migraties zijn lokaal voorbereid: `20261024150408_f5_own_campaigns_bot.sql` en `20261024161428_f5_campaign_extensions_and_reconciliation.sql`. De tweede voegt drie private RLS-tabellen en beperkte routines toe. De bestaande `f3_twitch_begin` wordt uitsluitend uitgebreid om de cooldown en het dagelijkse bronbudget met discovery te delen. Historische SQL-bestanden worden niet herschreven. De oude operationele seed blijft uitgesloten.

De laatst bevestigde Cloud DEV-historie is 133. Alleen na een nieuwe voorcontrole op diezelfde baseline zouden beide nog niet toegepaste migraties 135 registraties opleveren. Zie het [complete releasemanifest](../../ops/f5-completion-release-manifest.json). Dit is geen uitvoerbaar migratie- of serverpakket en bevat nog geen vrijgegeven image-digests.

Replays controleren actuele rechten opnieuw. Eenzelfde interaction-ID met gewijzigde bijdrage conflicteert. De database serialiseert de relevante schrijfacties met de bestaande campagnegate; er is geen tweede saldo of beloningsverwerker. De bronroute accepteert alleen de expliciet gebonden bron en broadcaster; ontvangst blijft `providerVerified=false` en `awarded=false`.

Bronontdekking reserveert vier uitgaande HTTP-pogingen. Zij deelt de actuele bron- en accountquota met bestaande F3-metingen. In-flight intrekking, verstreken sessie of gewijzigde credentialversie blokkeert vrijgave van de suggesties. Eerdere resultaten worden alleen via actuele bron- en campagnerechten getoond.

## Saldovergelijking

Het beheerscherm staat onder `/app/bucks/reconciliatie`, alleen voor een actuele bevoegde beheerder. De database leest de accountstand en ledgerfingerprint in één consistente statementsnapshot; bedragen zijn strings om afronding te vermijden. De externe CSV blijft in de browser. Het offline alternatief gebruikt dezelfde pure vergelijkingskern.

Het genormaliseerde CSV-contract is `external_id,cc_user_id,bucks`. Alleen onveranderlijke Twitch-/Discord-ID’s, expliciete CC-accountkoppelingen en gehele niet-negatieve bedragen. Dit is geen belofte dat een ongelezen StreamElements-export rechtstreeks kan worden geïmporteerd. Geen koppeling op naam/e-mail en geen stille optelling van dubbele regels. Een kloppend extern controletotaal is nog geen goedgekeurde saldo-overname. Accounts buiten het bestand blijven expliciet zichtbaar.

## Installatiepakketten en review

De afzonderlijke adapter- en offline vergelijkingspakketten bevatten broncode, uitleg en controlesommen; geen echte configuratie of sleutel. [Adapterinrichting](../../integrations/streamerbot/README.md) en [offline vergelijking](Saldovergelijking-gebruiken.md) beschrijven wat pas na vrijgave mag worden uitgevoerd.

De bestaande CC-PR #123 en bot-PR #10 worden rond deze volledige uiteindelijke scope bijgewerkt; repositories en commits blijven apart. Geen merge, Cloud-toepassing, serverdeploy, Discordregistratie of live activering volgt uit deze bouwopdracht.

## Bouwchecks en latere acceptatie

Gerichte controles dekken replay/conflict, actuele deelname en bronnen, publieke/private functiegrants, kandidaatstatus, geen beloning, bounded Twitch-data, integervergelijking, onduidelijke koppelingen en duurzame adapterretry. TypeScript, gerichte lint, productiebuilds en de bestaande CI blijven behouden. De native PostgreSQL-job omvat de gerichte lock-/replayketen; zijn definitieve uitkomst blijft per commit in CI zichtbaar.

Echte brontriggers, echte Twitch-accounts en vensters, alle rolvarianten, langdurige reconnect-/uitval, Windows-ACL, operationele bewaarbehandeling, serverterugval en de integrale appacceptatie blijven vóór productie aantoonbaar te maken. Dit pakket tekent eerdere open F0–F4-punten niet af. Werkelijke gegevensophaling, verdienactivering, StreamElements-/Metricool-overname en productieomschakeling blijven afzonderlijke besluiten, zoals in F6 afgesproken.
