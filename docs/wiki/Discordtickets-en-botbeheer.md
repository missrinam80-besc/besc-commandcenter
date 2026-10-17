# Discordtickets en botbeheer

[← Wiki](README.md) · [Huidige DEV-status](Huidige-DEV-status.md)

## Tickets behandelen

**Mijn werkplek → Discordtickets** staat onder Goedkeuringen. De telling toont open tickets (`open`) in de eigen organisatie, uitsluitend voor medewerkers met ticketrechten. Het is geen persoonlijke ongelezen-teller; de telling vernieuwt met de bestaande navigatie-/laadcyclus, niet via een live abonnement. Nul wordt verborgen en grote aantallen tonen 99+.

Open een ticket voor antwoorden, interne notities, toewijzing en status. **Versturen naar Discord** maakt een extern antwoord en verzendopdracht; een interne notitie blijft uitsluitend in CC. Toewijzing geeft geen extra leesrecht. Admin/Bestuur en expliciet bevoegde actieve ticketmedewerkers gebruiken dezelfde `manageTickets`-controle in pagina, acties en datalaag.

Statussen: Open, In behandeling, Wacht op aanvrager en Gesloten. Een antwoord van de aanvrager hervat behandeling. Sluiten is definitief voor nieuwe gespreksberichten en laat de bot de privéthread vergrendelen/archiveren; voor een nieuwe vraag wordt een nieuw ticket geopend. Gesprekken en interne notities worden 180 dagen na sluiten verwijderd volgens de bewaartaak; Discordverwijdering loopt via de herstelbare deliveryketen.

Een toegelaten ongekoppeld Discordaccount kan een ticket maken zonder CC-account of eventrechten te krijgen. Een gekoppeld-only tickettype verlangt actuele account- en organisatiecontrole. Discordmoderators met Threads beheren kunnen privéthreads zien; privé betekent niet onzichtbaar voor zulke moderators.

## Beheer → Discordbot

Botbeheer gebruikt `manageDiscordBot`. Dat geeft op zichzelf geen ticketinzage. Geen aparte teammodule of mediabibliotheek: toewijzing gebruikt bestaande bevoegde ticketmedewerkers. Embeds ondersteunen titel, uitleg, kleur en voettekst; geen afbeeldingen.

Beheer tickettypes, tekst-/enkelvoudige-/meervoudige vragen en serverinrichting als concept. Controleer de preview en publiceer pas bewust een paneel op het gekozen kanaal. Concept opslaan heeft geen Discordeffect. Publicatie levert een onveranderlijke editie; een al geopend formulier behoudt zijn vraag-/optielabels. Uitschakelen en actuele toelatingsregels kunnen zo'n oude editie alsnog blokkeren.

De algemene serverintake, beschikbaarheid van een type en paneelpublicatie zijn afzonderlijke instellingen. Een type beschikbaar maken publiceert niets. Serverpauze en paneeluitschakeling moeten bewust worden gebruikt; neem hun actuele stand niet over uit een oude screenshot.

## Binding en herstel

De server moet de juiste organisatie, guild en application-ID hebben; het runtime-report controleert de applicationbinding. De configuratie levert ook bij lege/inactieve inrichting een geldige stabiele `configurationRevisionId`, geen nieuwe UUID bij iedere GET. Auth gebruikt de bestaande beperkte client; de API vertrouwt de bot om de echte interactionactor door te geven.

Controle-/publicatieopdrachten zijn `verify_server_admin`, `check_channel`, `publish_panel` en `disable_panel`. Controleer de bestaande wachtrij en eerdere blokkades vóór een nieuwe actie. `uncertain` betekent eerst het Discordeffect onderzoeken, niet blind herhalen. Nieuwe installatie-/kanaalcontroles maken opdrachten en zijn dus geen zuivere leesdiagnose. Maak geen tweede serverrecord om een bindingfout te omzeilen.

Bij diagnose: deel alleen opdracht-ID, soort, status, sequence en noodzakelijke kanaal-/paneelbinding; geen payloads, lease-tokens of inhoud. Het ontbrekende schema-USAGE-recht voor de servicelaag is in DEV hersteld; een algemene formulierfout rechtvaardigt geen ruimere botrechten.

## Technische bronnen

- [Ticketing V2-contract](../contracts/ticketing-v2.md) en [fixtures](../contracts/ticketing-v2.fixtures.json).
- [V1-protocol en retentie](handleidingen/TICKETING_V1_API.md); nog gebruikte transportregels, geen actuele V2-gebruikershandleiding.
- [Ticketacceptatie 16 oktober](../acceptatie/TICKETING-V2-DEV-20261016.txt).
- [Botdocumentatie](https://github.com/missrinam80-besc/besc-discordbot/tree/main/docs) in de aparte repository.

## Historie van de DEV-correcties

De bestaande migraties `20261015115523_discord_configuration_revision.sql`, `20261016062843_discord_channel_check_contract.sql`, `20261016083106_discord_ticket_intake_schema_access.sql` en `20261016102010_discord_ticket_intake_transcript.sql` ondersteunen respectievelijk stabiele configuratierevisies, correcte kanaalbinding, servicetoegang en het antwoordentranscript. De gebruiker heeft de toepassing/hertests in de ontwikkelchat bevestigd; deze documentatie-update voert ze niet opnieuw uit.
