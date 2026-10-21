# Huidige DEV-status — 17 oktober 2026

[← Wiki](README.md)

## Actualisatie 21 oktober: bronregister en rewards-intake

Het [bronregister van de ecosysteembasis](Ecosysteem-basis-en-uitvoering.md) bevat de op 21 oktober gecontroleerde codeversies en Cloud-schema-metadata. CC-main is `279c607691883acd5f4ec8c6b12c7ce62e3b3920`; bot-main is `bbaba45b1c36831de49fbd8d456588422d7450c5`. Dit zijn bronversies, geen zelfstandig uitgelezen serverimages.

De opaque-ID-vervolgmigratie uit PR #110 is op 20 oktober op Cloud DEV uitgevoerd en gecontroleerd; de gebruiker bevestigde vervolgens gezonde webdeploy, behoud van Twitchkoppeling en uitgeschakelde activiteit/preview/intake. De op 21 oktober read-only gecontroleerde private functiebody komt exact met de migratie overeen. Er zijn geen punten uitgegeven door deze intakevoorbereiding. Het CLI-migratieregister loopt achter; voer ontbrekende registraties niet blind als migraties opnieuw uit.

De meetweergavecorrectie uit F0.1 is een nieuwe codewijziging en nog niet op DEV geaccepteerd. De onderstaande momentopname van 17 oktober en de aanvulling van 18 oktober behouden hun historische context.

Dit is een gedateerde momentopname, geen automatische uitlezing van de servers. Bronnen zijn de code op CC-main `6db618aac85a5577c71e7b34f96bc023db9ae879`, bot-main `9050b2966c569ba19e5862eefe48da0ff01f4d0f`, controles via CC-webbeheer en de door de gebruiker aangeleverde serveruitvoer en Discordresultaten. Latere configuratiewijzigingen vragen een nieuwe controle.

## Aanvulling 18 oktober: persoonlijke Twitchkoppeling

CC PR #108 is gemerged en de gebruiker heeft de DEV-deploy en gezonde webservice bevestigd. De persoonlijke Twitchkoppeling staat nu aan (`BESC_TWITCH_IDENTITY_LINKING_ENABLED=true`). Koppelen, ontkoppelen/herkoppelen en annuleren/weigeren zijn door de gebruiker bevestigd, met behoud van Discordkoppeling en Bucks-saldo. Automatisch verdienen en de Discord-slotkeuze blijven uit; saldo-overname is niet uitgevoerd. In deze ronde zijn geen botinstellingen gewijzigd. Zie het [acceptatieverslag](../acceptatie/PERSOONLIJKE-TWITCHKOPPELING-20261018.md).

De onderstaande bot-, clientrechten- en imagemomentopname blijft die van 17 oktober; deze aanvulling is geen nieuwe controle daarvan.

## Bevestigde omgeving

| Onderdeel | Laatst bevestigd |
| --- | --- |
| Command Center | DEV op BESCSRVDEV, `/opt/besc-dev/command-center`, healthy; Cloud Supabase voor Database/Auth/Storage. |
| Discordbot | Aparte repo en server BESCSRVDEV-02 / `104.248.194.147`, `/opt/besc-discordbot`; verbonden. |
| Ticketing V2 | `BESC_TICKETING_V2=true`; blijft actief na de slottests. |
| Bot-slotworker | `BESC_SLOT_WORKER_ENABLED=false`. |
| CC-Discordkeuze bij boeking | `BESC_SLOT_DISCORD_NOTIFICATIONS_ENABLED=false`. E-mail blijft beschikbaar. |
| Botclient | `besc-discord-tickets-dev`; oudere leesclients ingetrokken. Laatst veilig gecontroleerd: niet ingetrokken, geldig tot `2027-01-09T16:33:18Z`. Niet automatisch verlengen. |
| Clientrechten | `identity:read`, `account:read`, `events:read`, `tickets:create`, `tickets:own:read`, `tickets:ingest`, `tickets:deliver`, `bot-config:read`, `bot-config:report`, `bot-config:deliver`, `slots:deliver`. Geen algemene Discord- of databasetoegang. |
| Botimage | `ghcr.io/missrinam80-besc/besc-discordbot@sha256:c6b7bf440b9e2428751acb0851104d095f15c7f4a2f4e472e72a3fdc853e5100`. |
| Gmail-verwerking boekingen | Minuuttimer `besc-event-slot-mails.timer` op CC-server; succesvolle HTTP 200 en live e-mailwerking door gebruiker bevestigd. |
| Ticketretentie | `besc-ticket-retention` eerder als actief en geslaagd bevestigd; beleid 180 dagen na sluiten. Dit is geen bewijs van een uitgevoerde V2-purge. |

De CC-image-ID is bij de laatste configuratiestap als ongewijzigd bevestigd; deze pagina leidt geen actuele image-digest af uit alleen de branchnaam. Repo's, lokale mappen, credentials, commits, PR's en deployments blijven fysiek gescheiden. De bot gebruikt uitsluitend de beperkte CC-API; MEE6 blijft verantwoordelijk voor moderatie en rollen.

## Live geaccepteerd

- Ticketing V2: normale intake voor gekoppelde en toegestane ongekoppelde accounts, privéthread, tekst-/keuzevragen, antwoordentranscript, berichten in beide richtingen, interne notities uitsluitend in CC, sluiten, dropdownreset en behoud van oude formulieredities. Zie het [gedetailleerde ticketverslag](../acceptatie/TICKETING-V2-DEV-20261016.txt).
- Slotboekingen: verificatie per e-mail, aanvraag, eigenaarmelding, voorlopige agenda, goedkeuring en annulering; mailwerking al eerder bevestigd. Daarna ook aanvraag, goedkeuring en annulering via Discord-DM en terugval naar e-mail bij geblokkeerde DM's.
- Annulering verwijdert de actieve boeking uit de eventagenda en geeft de capaciteit vrij; historie blijft behouden.
- Na uitschakelen van de slotworker: `/besc status`, `/besc account`, `/besc events`, Discord naar bestaand CC-ticket en extern CC-antwoord naar Discord werken volgens gebruiker.

## Afsluiting slottest

De testpagina van `TESTFIXTURE — Slot-DM-acceptatie` (event `66a8aea6-1a86-49f9-922a-fdad16d8a986`) is op 17 oktober via CC-webbeheer gesloten. Beide testboekingen stonden Geannuleerd, capaciteit 0/1 en alle getoonde berichten op verzonden. Geen testevent, historie of state-volume verwijderd.

De SELECT-controle van `2026-10-17T12:14:13.218457Z` toonde 12 verzonden berichten, geen onafgeronde Discordberichten en geen aandachtregels of afkapping. Daarna is de bot-slotworker uitgezet. CC bleef healthy; bot bleef verbonden. Beide stappen behielden image en overige instellingen; botclients, Caddy en bot-state-volume bleven behouden.

Veilige backupnamen uit de operatoruitvoer: `.env.production.backup-stop-slot-discord-20261017T121243977512Z` op CC en `bot.env.backup-stop-slotworker-20261017T121608581505Z` op botserver. Dit zijn geen bestanden in Git.

## Openstaande grenzen

Dit is beperkte DEV-acceptatie, geen productieacceptatie of volledige live foutinjectietest. De gebruiker sloeg de verlopen-ticketformuliertest over; aparte accounts voor beheer-only versus ticketmedewerker waren niet beschikbaar. Crash/antwoordverlies, exacte submitreplay, nieuwe parent met oude threads en echte V2-retentieverwijdering zijn niet afzonderlijk live bewezen.

Voor slots zijn afwijzings-DM, mentions, ontvanger ontkoppelen vóór/tussen claim en dispatch, harde crash en onzekere aflevering niet afzonderlijk live bewezen in deze ronde. Lokale tests vervangen dit bewijs niet. Deblokkeren van de testbot is gevraagd maar niet onafhankelijk bevestigd. Beide slotopties blijven uit totdat blijvende activering afzonderlijk is besloten.
