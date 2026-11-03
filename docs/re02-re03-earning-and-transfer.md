# RE02 en RE03: lokale afbouw

Deze uitbreiding is lokaal voorbereid. Cloud-migratie, uitrol, broninrichting, activering en echte saldowijzigingen zijn afzonderlijke besluiten. Er worden geen regels, tarieven, bronnen, abonnementen of batches gezaaid. Automatisch verdienen blijft uit.

## RE02

- `/app/bucks/verdienen`: beheerders met `manageRewards` kunnen conceptregels voorbereiden en een concrete versie met reden activeren of deactiveren. Bewerkingen schakelen de regel uit. Discordregels en kanaalselectie worden in het bestaande regelbeheer onderhouden.
- Discord: bestaande gatewaywaarneming, duurzame worker en servervalidatie blijven behouden. Configuratie wordt alleen geleverd voor ingeschakelde, expliciet goedgekeurde regelversies. Een oud event of voice-interval van vóór de goedkeuring kan niet verdienen.
- Twitch: aparte EventSub-webhook voor `channel.follow` v2 en `channel.cheer` v1. Controle van ruwe bytes met HMAC-SHA256, begrensde leestijd/omvang, berichttijd, kanaal, moderator, abonnement, versie en callback. Uitgevallen bewijsverwerking wordt niet als succes bevestigd.
- Volg-events zijn levenslang maximaal eenmaal per Twitch-account/kanaal beloonbaar. Cheers gebruiken een expliciet vast bedrag per geldig event boven het ingestelde minimum Bits, met cooldown en daglimieten in UTC. Geen financiële omzettingsclaim.
- Huidige Auth-identiteiten, lidmaatschap en blokkering worden opnieuw gecontroleerd; bij ontbrekende of ambigue binding volgt geen boeking. Revocation blokkeert het ingetrokken abonnement duurzaam. Dubbele berichten leveren geen dubbele boeking op.
- Geen berichtinhoud, namen of cheer-teksten in het bewijsregister. Alleen de minimale bronfeiten en uitkomst worden vastgelegd.
- De bestaande Streamer.bot-intake blijft ongewijzigd ontvangstbewijs; zij roept geen verdienfunctie aan.

### Nog in te richten na apart akkoord

`BESC_REWARDS_EARNING_ADMIN_ENABLED`, `BESC_REWARDS_ACTIVITY_ENABLED` en `BESC_REWARDS_TWITCH_VERIFIED_ENABLED` staan standaard uit. Voor Twitch is uitsluitend op de server `BESC_REWARDS_TWITCH_EVENTSUB_SOURCES_JSON` beschikbaar: per bronnaam organisatie-ID, numerieke broadcaster/moderator-ID, HTTPS-callback, hoog-entropiegeheim en twee exacte abonnements-ID’s (of tijdelijk `null` tijdens het aanmaken). Het geheim gaat nooit naar de browser of database. EventSub-abonnementen worden niet automatisch aangemaakt. De callback heeft pad `/api/v1/integrations/rewards/twitch/<bronnaam>`.

Een nieuw abonnement start met een challenge. Alleen voor die challenge mag het abonnements-ID nog `null` zijn; handtekening, kanaal, moderator, callback, type en versie blijven vereist. Na het aanmaken vult de operator het door Twitch toegekende exacte abonnements-ID in. Notificaties en intrekkingen worden tot dan geweigerd; de challenge kan nooit punten toekennen. Een aparte broninrichtingsprocedure en echte Twitch-OAuth-scopes blijven nodig voor activering. Geen live bewijs geclaimd.

Bronnen: [Twitch webhook-verificatie](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/) en [abonnementstypen](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), geraadpleegd 3 november 2026.

## RE03

`/app/bucks/overgang` geeft voorbereiding, het concrete onveranderlijke overzicht, annulering en een afzonderlijk bevestigde uitvoering. Beheer vereist een actuele bevoegde CC-sessie. De bestaande alleenlezende saldovergelijking blijft bestaan.

1. Bewaar een oorspronkelijke StreamElements-export afgeschermd. Lever een gecontroleerde UTF-8-omzetting aan met kop `external_id,bucks`, numerieke Twitch-ID’s met prefix `twitch:` en hele niet-negatieve doelsaldi. Een apart mappingbestand heeft kop `external_id,cc_user_id`. Maximaal 5000 accounts; maximaal 256 KB per bestand. Quotes en namen worden niet als IDs geïnterpreteerd.
2. De operator bevestigt dat omzetting en totaal tegen de oorspronkelijke export zijn gecontroleerd. Beide bestanden krijgen een controlesom. De omzetting wordt niet voorgesteld als een automatisch gecontroleerd native StreamElements-exportformaat; daarvoor is nog een echt voorbeeld nodig. Bestandsbytes worden niet opgeslagen, de operator bewaart de bronbestanden.
3. De database verifieert iedere mapping tegen de actuele unieke Twitch- én Discord-Auth-binding, legt bronkanaal, stopmoment, hashes, exacte verschillen en bestaande XP/reserveringen vast, en neemt een vaste organisatiebrede saldo-/boekingstand op.
4. Bij uitvoering bevestigt de bevoegde persoon exact dit overzicht, de gestopte bron, het stopmoment en een reden. Alle Discord/Twitch-verdienregels moeten gepauzeerd zijn. Databasevrijgave ontbreekt standaard en kan alleen via de aparte servicefunctie `re03_set_enabled` worden ingesteld na activeringsgoedkeuring. De browser kan die vrijgave niet uitbreiden.
5. De database vergrendelt de relevante identiteiten en de saldi/boekingen en controleert opnieuw op wijzigingen. Alleen de verschillen worden atomair geboekt als `external_transfer`. Bestaande XP, reserveringen en historie blijven behouden. Een verschil buiten het bereik van een bestaande integer-ledgerboeking wordt afgewezen.
6. Een voltooide batch wordt bij herhaling alleen teruggelezen. Hetzelfde bronkanaal kan binnen de organisatie niet nogmaals worden overgezet, ook niet met een ander bestand of stopmoment. Een gewijzigde voorbereiding vereist een nieuwe batch; oude batches kunnen worden geannuleerd.

`BESC_REWARDS_TRANSFER_ENABLED` staat standaard uit. Er is geen echte export, batch, migratie of overgang uitgevoerd. De botwijziging is alleen leescapaciteit voor de nieuwe boekingssoort en moet vóór de eerste echte overgang worden uitgerold.

## Bewijsgrens

Gerichte component-/databasecontroles en een geïsoleerde native PostgreSQL-proef staan los van live Twitch-, Discord- en StreamElements-acceptatie. De native gerichte geldproef vervangt de bestaande sessiechecker door een fictieve checker; de volledige migratieketen gebruikt wel de echte definities. De volledige integrale acceptatie blijft, volgens opdracht, gepland vóór productie.
