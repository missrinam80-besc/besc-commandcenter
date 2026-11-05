# OP01 — bewaking en beheer van DEV

De beheerder ziet actuele waarschuwingen via Beheer → Systeemstatus en een melding op het startscherm. De webserver verzamelt ongeveer elke vijf minuten uitsluitend meetwaarden en vaste statuscodes. Een meting ouder dan vijftien minuten krijgt de status geen actuele meting. Een niet aangesloten onderdeel heet nog niet gekoppeld.

## Omvang en grenzen

- Web: schijfruimte en inodes, beschikbaar geheugen, containers, lokale HTTP-controles, HTTPS-aanmeldpagina's, mislukte systeemdiensten, tijdsynchronisatie en begrensde logs.
- Database: bereikbaarheid, omvang, verbindingen, langlopende transacties en de cumulatieve deadlockteller. Deze teller is geen uitspraak over een actuele storing.
- Bot: uitsluitend na toegang en inrichting van een beperkte, afgedwongen SSH-probe. Geen berichten, botacties, statebestanden, sleutels of onbegrensde shelltoegang via deze probe. Een draaiende container bewijst op zichzelf geen volledige Discord-acceptatie.
- Geen ruwe logs, persoonsgegevens of sleutels in de statuscache. De cache bevat per onderdeel maximaal twintig statuswijzigingen en groeit niet per timeruitvoering.
- De webbewaking deelt de webserver met Command Center. Onafhankelijke uitvaldetectie buiten deze server is hiermee niet geleverd. Er wordt geen e-mail of Discordbericht verstuurd.

## Grenswaarden

Schijf: aandacht bij minder dan 1 GiB vrij of 85% gebruikt; kritiek bij minder dan 512 MiB vrij of 95% gebruikt. Inodes: aandacht bij 85%, kritiek bij 95%. Beschikbaar geheugen: aandacht onder 128 MiB, kritiek onder 64 MiB. Een ontbrekende/ongezonde container of onbereikbare HTTP(S)-controle is kritiek. Een mislukte systeemdienst of ontbrekende logbegrenzing vraagt aandacht.

Containerlogs behouden de bestaande grens van drie bestanden van 10 MB. Het systeemlog krijgt een opslaggrens van 256 MiB, minimaal 512 MiB vrije ruimte en maximaal 32 MiB vluchtig log. Er wordt geen handmatige vacuum of opruiming uitgevoerd. Dit is een technische opslagbegrenzing, geen vastgesteld privacybewaarbeleid voor bedrijfsgegevens.

## Incidenten en updates

1. Controleer de tijd van de laatste meting en bepaal welk onderdeel geraakt is. Noteer begin, impact en de bijbehorende statuswijziging.
2. Controleer alleen de relevante dienst en foutcategorie; deel geen ruwe secrets of volledige configuratie.
3. Bepaal een gerichte ingreep. Deze bewaking herstart, verwijdert of herstelt geen apps of data.
4. Controleer na de ingreep de exacte versie, gezondheid, instellingen en twee nieuwe metingen. Leg de oplossing en eventuele vervolgactie vast.

Updates verlopen via de bestaande repositories, controles, exacte image-identiteit en terugvalprocedure. Er wordt geen nieuwe automatische app-update of automatische cleanup toegevoegd.

## Herstel en vervanging

Handmatige herstelkopieën en bestaande gerichte herstelproeven blijven de basis. Er wordt op verzoek geen dagelijkse back-uptaak geïnstalleerd. Een nieuwe volledige app-/Auth-/Storage-/bot-herstelproef blijft een apart acceptatiepunt. Oude herstelkopieën worden niet door dit pakket verwijderd.

Linda heeft nog geen vervanger voor technisch beheer of mailbox afgesproken. Er worden geen personen, rollen of toegangen toegekend om dit open punt in te vullen. Hostingcapaciteit, onafhankelijke bewaking, actuele herstelproef en de nog niet aangesloten bot blijven zichtbaar open totdat hun werking afzonderlijk is bevestigd.
