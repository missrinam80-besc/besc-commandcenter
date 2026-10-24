# BESC Streamer.bot-bronadapter — F5

Dit is een afzonderlijk lokaal adapterpakket voor Node.js 24.14 of nieuwer en de inline C#-actie van Streamer.bot. Geen databaseverbinding, publieke luisterpoort, moderatorscript, automatische beloning of vervanging van bestaande acties. Beide opt-ins blijven standaard uit. Er is nu niets in de echte streamkit geïnstalleerd of geïmporteerd.

## Inhoud en gegevensstroom

`WriteReference.cs` schrijft eerst een klein JSON-bestand atomair in een lokale wachtrij. `bridge.mjs` stuurt dat bestand via HTTPS naar de beperkte CC-referentieroute met een afzonderlijke `bcr_`-sleutel. Bron-ID en broadcaster-ID uit de beschermde configuratie moeten exact met de serverclient overeenkomen. CC bepaalt zelf organisatie, campagne en deelnemer.

Clips en VOD’s kunnen kandidaatbijdragen worden; onafhankelijke beoordeling blijft in CC. Streamreferenties blijven afzonderlijke, niet-geverifieerde observaties met hun oorspronkelijke stream-ID. Een referentie is geen bewijs van bereik, kijktijd, engagement of recht op Bucks. Dit pakket verstuurt geen follow-/cheerclaims naar de rewards-intake.

De lokale sleutel is alleen voor deze bron. De ontvanger controleert huidige bronbinding, native Twitch-identiteit, actieve deelname en algemeen intern bronbewijs. Afgeschermd bestuurs- of financieel bewijs wordt niet door deze machinefunctie geopend. Intrekking, verloop of bronwissel blokkeert ook herhaling. Een wachtrij mag niet naar een andere bron worden omgebonden; de adapter bewaart daarvoor een lokale bindingvingerafdruk.

## Inrichting na afzonderlijke vrijgave

1. Plaats het uitgepakte pakket en de wachtrij in een afgeschermde lokale map buiten synchronisatie, publieke webmappen en Git. Gebruik de gewone Windows-gebruiker, geen administrator. Regel ook passende Windows-toegangsrechten; POSIX-bestandsmodi alleen bewijzen geen Windows-ACL.
2. Laat eerst CC-migratie, bron/deelname, afzonderlijk clientregister en bijbehorende serverflags beoordelen. De sleutelgenerator onder `ops/create-campaign-reference-client.mjs` bereidt alleen twee lokale bestanden voor; hij registreert niets. Deel geen geheimen of private bestanden in chat.
3. Kopieer `.env.example` lokaal naar een afgeschermd configuratiebestand. Vul het bestaande bron-ID, de numerieke broadcaster-ID, de afzonderlijke sleutel en de absolute lokale wachtrijmap in. Eén bron per instantie en wachtrij. De registerwaarde op CC is `BESC_CAMPAIGN_REFERENCE_CLIENTS_JSON`; dit vervangt geen bestaande Discord-/rewardsclients.
4. Maak later één aparte Streamer.bot-actie met de inhoud van `WriteReference.cs`. De volgende **custom arguments** moeten expliciet vóór die actie zijn ingevuld:

| Argument | Betekenis |
| --- | --- |
| `bescF5Enabled` | Boolean, standaard false; pas aan na vrijgave. |
| `bescQueueDir` | Dezelfde absolute lokale wachtrijmap als in de bridgeconfiguratie. |
| `bescReferenceKind` | `clip`, `video` of `stream`. |
| `bescReferenceId` | Echte clip-/video-/stream-ID, zonder voorvoegsel; geen zelfverzonnen provider-ID. |
| `bescOccurredAt` | Oorspronkelijk gebeurtenistijdstip met `Z` of expliciete tijdzone-offset. Geen hernieuwde tijd per retry. |
| `bescChannel` | Alleen bij stream: de echte kanaallogin in kleine letters. |

De argumentnamen zijn bewust eigen namen. Koppel ze aan de werkelijk beschikbare velden van de gekozen trigger; er wordt geen universele triggerpayload of importformaat verzonnen. Een ontbrekende ID/tijd blokkeert de actie. Gebruik geen kijkerslijst, chatinhoud of accounttokens als argument.

## Controle en starten

```text
node --check bridge.mjs
node --env-file=<afgeschermd-configuratiebestand> bridge.mjs --check
node --env-file=<afgeschermd-configuratiebestand> bridge.mjs --run --once
```

De eerste regel controleert alleen syntaxis. De tweede valideert uitsluitend de configuratie en verstuurt niets. De derde is een echte uitgaande verwerkingsstap en hoort pas na vrijgave. Zonder `--once` blijft `--run` iedere twee seconden werken. Geen service, taakplanner of autostart wordt geïnstalleerd door het pakket.

Start één bridgeproces per wachtrij. De bridge verwerkt maximaal twintig bestanden per ronde en weigert meer dan tweeduizend wachtende bestanden. De C#-actie weigert nieuwe bestanden wanneer de wachtrij vol is. Een onzekere netwerkuitkomst houdt exact dezelfde inhoud/sleutel vast; retries hebben oplopende wachttijd. De server ontdubbelt per bron en referentie. Een definitieve ongeldige aanvraag/conflict gaat naar `failed`. Ontbrekende toegang of een gesloten CC-route pauzeert de ronde en bewaart de invoer. Alleen een bevestigde ontvangst wordt naar `sent` verplaatst. Een vastgelopen proceslock vraagt controle van de betrokken lokale processen; verwijder geen wachtrijbestanden om een onzekere ontvangst te omzeilen.

Nieuwe referenties mogen maximaal zeven dagen oud zijn. Dit is een technische grens voor deze bronroute, geen vastgesteld bewaarbeleid. Bewaring/opschoning van lokale archieven wordt vóór echt gebruik afzonderlijk geregeld; het pakket verwijdert geen historische bronarchieven automatisch.

## Verificatie en grenzen

Gericht gecontroleerd: default-uit, bronbinding, identieke retries na onzekere ontvangst en archivering na bevestiging. C# wordt apart tegen de gedocumenteerde smalle CPH-interface gecompileerd en met fictieve argumenten uitgevoerd. Dat is geen bewijs van live triggerbinding, hardware, OAuth, import of werking op de echte streamkit. Die praktijkacceptatie blijft vóór productie.

Bron: [Streamer.bot C#-argumenten](https://docs.streamer.bot/api/csharp/guide/variables). Bestaande OBS-, Speaker.bot- en StreamUP-instellingen blijven behouden.
