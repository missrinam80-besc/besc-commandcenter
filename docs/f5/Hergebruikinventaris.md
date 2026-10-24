# F5.0 — hergebruik en ontbrekende capabilities

24 oktober 2026. De inventaris gebruikt de commits en LF-genormaliseerde SHA256-bronnen in [bronregister.json](bronregister.json). ‘Gebouwd’ betekent hier aanwezig in gecontroleerde broncode. Actieve instellingen, deploys en echte providerwerking zijn niet opnieuw live gecontroleerd.

## Bevindingen

| Capability | Wat aantoonbaar bestaat | Wat nog ontbreekt of apart moet worden besloten |
| --- | --- | --- |
| Twitch-operationele bron | CC heeft OAuth/tokenherstel, kanaalgegevens, live-status en planning. `twitchScopes` is in de gelezen code leeg. | Geen nieuwe OAuth-bouw nodig voor deze bestaande basis. Werkelijke accounts, providerrechten en runtime zijn geen gevolg van codeaanwezigheid. |
| Campagnemetingen | F3 heeft VOD-/clipweergaven en huidige kanaalkijkers, eigen bronbinding, twee tokenvalidaties rond de data-aanvraag, begrensde respons, versiecontrole en afgeschermde opslag. | Geen F5-herbouw. Geen officiële campagne-impressies, uniek bereik of engagement afleiden uit deze drie tellers. Echte campagne/ophaling stond bij de laatste operatorbevestiging uit. |
| Andere socialbronnen | YouTube-, Meta- en Threads-code, scheduler en export zijn aanwezig; het platformregister noemt ook geblokkeerde/plande capabilities. De scheduler kan reeds verbonden, voor sync geselecteerde accounts verwerken. | Aanwezige code en labels zijn geen productgoedkeuring of actief gebruikte bron. Geen generieke nieuwe scheduler bouwen. Per ontbrekende campagnebehoefte eerst veld, toestemming, quotum en producttoegang bepalen; Twitch blijft de gekozen eerste bron. |
| Discordcampagnefunctie | Bot heeft `/besc`, accountcontrole, events, ticketing, slotworker en optionele Bucks-module; CC heeft eigen F3-campagneoverzicht en taak-/deelnemerscontroles. | Geen campagnecommando, campagnescope of campagnebotroute in de vastgelegde bronnen. Eerst een beperkte eigen leesketen bouwen, daarna eventueel een afzonderlijke bijdrage-invoer. |
| Streamer.bot-referenties | De lokale streamkit is aanwezig; de gebruiker bevestigde eerder lokale beeld-/geluidswerking en herstart. De kitdocumentatie is ouder dan die bevestiging. | Geen BESC-bronadapter aangetroffen in de gelezen CC-/botbroncode. Er is geen live Streamer.bot-configuratie of verbinding geïnspecteerd. Een los adapterpakket met lokaal broncontract is nog nodig. |
| Rewards-bronontvangst | Afzonderlijke preview en duurzame intake met eigen scopes/register, stabiele opaque provider-ID, ontdubbeling en actuele accountbinding. Geldige claims worden onder een puntenstop vastgelegd. | Een receipt is expliciet geen geverifieerd providerbewijs. Bronadapter/providerverificatie en zakelijke beloningssemantiek ontbreken. `held` mag niet later stilzwijgend worden uitbetaald. |
| Bucks-beheer | CC heeft toekenning, tegenboeking/correctie, catalogus, regels, levels, aanvragen, reserveringen, beslissingen en historiek. Botmain heeft optionele Bucks-commands en duurzame activiteitworker. | Geen nieuw parallel saldo bouwen. Een voorbereide saldoreconciliatie met cutoff en herkomst moet nog worden afgebakend; echte StreamElements-import/overname hoort bij een afzonderlijk F6-besluit. Geen generieke negatieve boekingen toevoegen buiten de bestaande correcties. |

De generieke socialexport en F3-campagnemetingen blijven verschillende leesmodellen. Een bestaande operationele snapshot wordt niet zonder de F3-bron-, periode- en deelnemerscontroles een campagneresultaat.

## Concrete codeankers

- Twitch: [integratie](../../src/lib/twitch-integration.ts), [operationele sync](../../src/lib/twitch-sync.ts), [F3-adapter](../../src/lib/campaign-twitch.ts) en [F3-aanvulling](../f3/Bouwafronding-Twitch.md).
- Social: [platformregister](../../src/lib/social-connectors.ts), [scheduler](../../src/lib/social-sync-scheduler.ts), [cronroute](../../src/app/api/cron/social-sync/route.ts) en [exportlezing](../../src/lib/social-metrics-export-query.ts).
- Campagneketen: [eigen campagnepagina](../../src/app/app/campagnes/bijdragen/page.tsx), [F3-databaseaanvulling](../../supabase/migrations/20261023134550_f3_campaign_twitch_completion.sql).
- Botgrens: [client/scopes](../../src/lib/bot-api.ts), [actuele accountlookup](../../src/lib/bot-api-store.ts) en de afzonderlijke botbronnen in het bronregister. Botmain is opnieuw gelezen op commit `bbaba45b1c36831de49fbd8d456588422d7450c5`; de oudere lokale ticketbranch was geen actuele Bucks-baseline.
- Rewards: [intakecontract](../contracts/rewards-intake-v1.md), [bestaand saldo-/boekingscontract](../contracts/bucks-xp-v1.md), [webacties](../../src/app/app/bucks/actions.ts) en [Bucks-botcontract](../contracts/bucks-xp-api-v1.md).

## Toegang, betrouwbaarheid en kosten

De machineleesbare [capabilities](capabilities.json) benoemen per onderdeel toegang, foutgrenzen, ontbrekende bouw en latere acceptatie. Bronnen en evidence-lagen blijven gescheiden: code gelezen, eerdere operatorbevestiging, providerdocumentatie en nog onbekende live toestand.

Voor F5.1 zijn geen nieuwe provideraanvragen of extra diensten nodig als de bestaande bot/CC-infrastructuur wordt hergebruikt. Dit is geen prijs- of capaciteitsgarantie: actuele serverruimte, geheugen, botruntime en operationele belasting moeten vóór uitrol worden gecontroleerd. Voor nieuwe socialproducten, een permanente Streamer.bot-adapter en extern saldobeheer is nog geen kostenbegroting vastgesteld.

## Streamer.bot-broncontract: gerichte vervolggrens

De officiële [eventdocumentatie](https://docs.streamer.bot/api/websocket/guide/events) beschrijft een tijdstip, bron, type en eventspecifieke data; die algemene envelop bewijst geen universele oorspronkelijke providerbericht-ID. Voordat een adapter wordt gebouwd, moeten concrete clip-/streamgebeurtenissen en de versiegebonden payloads worden gecontroleerd. Een lokale waarneming kan een referentie opleveren, maar geen financieel bewijs of officiële kijkcijfers.

Voor follow-/cheer-intake blijft de bestaande eis voor de oorspronkelijke provider-ID gelden. Bij een ontbrekende ID niet zelf een UUID verzinnen of een nieuwe ID per retry maken. Een clipreferentie wordt niet in de bestaande follow-/cheer-rewardsnamespace geperst. De transportkeuze, runtimeplaats en eventuele duurzame wachtrij horen bij dat afzonderlijke adapterpakket; nu wordt geen lokale server geopend of account gekoppeld.

Externe broncontrole: Streamer.bot-eventenvelop, Twitch API-reference en Supabase-changelog op 24 oktober 2026 geraadpleegd. De Markdown-changelog kon via de browser niet worden gelezen; de officiële HTML-changelog wel. Deze inventaris introduceert geen Supabase-feature of migratie en bewijst geen compatibiliteit van een live project met nieuwe platformreleases.
