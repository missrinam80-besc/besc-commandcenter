# Discord-events en aanwezigheid (BO04)

Lokale implementatie. Geen Cloud-migratie, scopes, uitrol of activering uitgevoerd.

## Bedieningsmodel

Bij Events → Communicatie stelt een actuele eventbeheerder afzonderlijke publieke tekst in en kiest expliciet **Publiceren in Discord**. Alleen toekomstige, niet-verwijderde events in **Bevestigd** of **In productie**, met start- én eindtijd, worden nieuw gepubliceerd. De tekst is bestemd voor de hele Discordserver. Interne beschrijvingen, crewgegevens en afgeschermde bewijsbronnen worden niet overgenomen. Een afgeschermde bron kan niet worden vrijgegeven.

Een organisatiebeheerder met zowel event- als botbeheer verbindt één bestaande geregistreerde botserver. Een bestaande publicatie verhindert stil wisselen naar een andere server. De betrokken CC-client krijgt pas na afzonderlijke vrijgave `events:sync` en eventueel `events:interest`.

Het Discord-event bevat een unieke BESC-link op het CC-domein: `/events/aanmelden/<publicatie-id>`. Het CC toont de teruggelezen Discord-eventlink. Er worden geen extra aankondigingsberichten, mentions of slashcommands toegevoegd. Een afzonderlijk aankondigingskanaal is buiten deze implementatie gehouden tot daar een keuze voor is.

## Drie afzonderlijke feiten

- **Discord-interesse:** volledige begrensde waarneming van Discord Interested; geen namen of berichten opgeslagen. Een mislukte/deelmatige lijst vervangt de vorige waarneming niet. Maximaal 5.000 IDs per snapshot.
- **Ik kom:** eigen verklaring van een bevestigd, niet-geblokkeerd persoonlijk BESC-account met actuele sessie. Interne CC-toegang is niet vereist. Functionele accounts kunnen geen persoon vertegenwoordigen. Intrekken blijft mogelijk voor de eigen registratie na sluiten van de pagina.
- **Werkelijk aanwezig:** apart bevestigd door een actuele eventbeheerder, vanaf de starttijd. Crew/deelnemer/vrijwilliger/bezoeker is een administratieve indeling; geen technische toegang, Bucks of XP. Een latere eigen intrekking wist een eerdere aanwezigheidsbevestiging niet.

De publieke pagina bevat uitsluitend expliciet vrijgegeven eventinformatie, nooit een deelnemerslijst. Eigen gegevens worden alleen met de eigen sessie gelezen. De beheerpagina toont registraties per 50. De route is dynamisch, niet indexeerbaar en krijgt no-store/no-referrer headers.

## Schakelaars (alle standaard uit)

CC: `BESC_DISCORD_EVENTS_ENABLED=false`, `BESC_EVENT_RSVP_ENABLED=false`.
Bot: `BESC_DISCORD_EVENTS_ENABLED=false`, `BESC_DISCORD_EVENT_INTEREST_ENABLED=false`.
Aanwezigheidsaanmelding vereist bovendien beide opgeslagen RSVP-keuzes (organisatie en event). Serverinstellingen alleen vervangen geen expliciete vrijgave per event.

De bot gebruikt uitsluitend de bestaande beperkte CC-client. De duurzame bestaande statemap krijgt een afzonderlijk, aan API/server/app/client gebonden eventjournaal. Polling synchronisatie iedere 30 seconden; complete interessewaarneming iedere vijf minuten. Bestaande ticket-, slot- en Bucks-workers blijven gescheiden.

## Updates, intrekken en herstel

Bronwijzigingen maken een nieuwe onveranderlijke opdrachtversie. De API controleert vlak vóór verzending opnieuw bron, vrijgave, server, client, versie en lease. Niet-verzonden oude versies worden geannuleerd. Intrekken sluit de BESC-pagina onmiddellijk en levert daarna een annulerings-/afrondingsopdracht voor hetzelfde Discord-ID. Zet bij gecontroleerd sluiten eerst de organisatie-/eventvrijgave uit en laat de worker de intrekkingen afhandelen; schakel daarna pas de runtime uit. Alleen de runtime uitzetten trekt bestaande Discord-events niet in en sluit de rechtstreeks aanroepbare publieke RPC niet als de opgeslagen vrijgave nog aan staat.

Discord staat voor geplande events annuleren toe en voor gestarte events afronden. Eindstatussen worden niet automatisch heropend of vervangen. Een ontbrekend of handmatig gewijzigd event vraagt controle.

Het journaal wordt vóór de externe schrijfactie en vóór de CC-bevestiging duurzaam opgeslagen. Een verloren bevestiging herhaalt alleen de bevestiging. Een onzekere schrijfactie zoekt één eigen event met dezelfde unieke BESC-link en exact dezelfde vastgelegde inhoud. Alleen dat eenduidige bewijs wordt automatisch bevestigd. Geen match, meerdere matches of gewijzigde inhoud blijft **Uitkomst nog te controleren**; er volgt geen tweede create. De worker bewaart geen token, publieke tekst of deelnemers in dit journaal.

Na een harde procescrash blijft de exclusieve `.lock` staan. Verwijder die nooit automatisch: bevestig eerst dat geen oude worker meer draait, bewaar het journaal en controleer de bestaande Discord-/CC-opdracht. Verwijder uitsluitend de bij dat journaal behorende stale lock na beheerbeoordeling, zonder het journaal leeg te maken. Hervatten kan dan alleen bevestigen/reconcilieren, nooit blind opnieuw aanmaken. Een onopgeloste onzekere opdracht blokkeert nieuwe writes van deze eventworker; ticketing blijft apart draaien.

## Uitvoering na afzonderlijke goedkeuring

1. GitHub-review en controles op beide repositories.
2. Alleen de exact beoordeelde SQL op Cloud DEV (139 → 140 indien dezelfde baseline).
3. CC en bot afzonderlijk uitrollen, alle nieuwe schakelaars uit; bestaande statemap behouden.
4. Bestaande botclient/serverbinding en beperkte scopes controleren en expliciet vrijgeven.
5. Organisatie-/eventvrijgave en runtime afzonderlijk activeren. Controleer de vereiste Discord Scheduled Event-permissies; geef geen Administrator-recht.
6. Later integrale acceptatie vóór productie, inclusief echte Auth-aanmelding, Discord-permissies, koppelingen, runtime-herstart en werkelijke bezoekersroute.

Een schema-/botuitrol publiceert op zichzelf niets. De brede productieacceptatie en werkelijk externe werking zijn niet afgedekt door de lokale proef.

Bronnen: [Discord Scheduled Events](https://docs.discord.com/developers/resources/guild-scheduled-event), [Discord rate limits](https://docs.discord.com/developers/topics/rate-limits), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
