# BESC Bucks en XP

[← Wiki](README.md)

Deze module is voorbereid in de ontwikkelbranch en nog niet op DEV uitgerold. De Discordbot wordt er daarna afzonderlijk op aangesloten. Automatisch verdienen blijft uit.

## Mijn overzicht

Onder **Mijn werkplek → BESC Bucks en XP** vind je je XP, level, beschikbare Bucks en gereserveerde Bucks. XP is niet besteedbaar. Gereserveerde Bucks horen bij beloningsaanvragen die nog op een beslissing wachten.

Alleen actieve leden met een actuele Discordkoppeling kunnen verdienen en beloningen aanvragen. Een gedeeld ticket openen zonder gekoppeld account geeft geen toegang tot deze module.

## Beloningen aanvragen

Kies op **Beloningen** een beschikbare beloning en klik **Beloning aanvragen**. De benodigde Bucks worden meteen gereserveerd. Bij onvoldoende beschikbaar saldo of voorraad wordt geen aanvraag vastgelegd. De naam en prijs van de beloning blijven bij de aanvraag bewaard, ook als de catalogus later verandert.

Onder **Mijn aanvragen** staan de status en eventuele reden. Een aanvraag met status Aangevraagd kun je annuleren; de reservering komt dan vrij. Bij afwijzen komen de Bucks eveneens vrij. Bij goedkeuren worden ze besteed. Afgehandeld betekent dat een beheerder de levering heeft geregistreerd.

Beslissingen zijn in deze versie op de pagina zichtbaar; er zijn nog geen automatische DM- of e-mailmeldingen over deze aanvragen.

## Beheer

Admins, bestuur en medewerkers met **BESC Bucks en XP beheren** zien extra tabbladen. Ticketmedewerkers en botbeheerders krijgen die bevoegdheid niet automatisch.

Op **Beheer** behandel je aanvragen, ken je handmatig punten toe, bekijk je saldi en beheer je de catalogus. Vermeld bij een handmatige toekenning altijd een reden. Een andere bevoegde beheerder moet je eigen aanvraag beoordelen. Een afwijzing vereist een reden.

Een nieuwe beloning start als concept, tenzij je bewust Beschikbaar voor aanvragen aanvinkt. Voorraad betekent het totale aantal beschikbare exemplaren, inclusief gereserveerde en al bestede beloningen. Laat voorraad leeg voor onbeperkt; nul maakt aanvragen onmogelijk. Gebruikte beloningen worden gedeactiveerd, niet uit de historiek verwijderd.

Op **Historiek** staan toekenningen, reserveringen, bestedingen en vrijgaven. Een onjuiste toekenning kun je met een reden terugboeken zolang het saldo dat toelaat. De oorspronkelijke regel blijft zichtbaar. Reeds bestede of gereserveerde Bucks kunnen niet via zo'n correctie onder nul komen.

## Verdienregels voorbereiden

Op **Verdienregels** stel je tekstberichten en voice apart in: server, kanalen, XP en Bucks per toekenning, wachttijd en daglimieten. Bij voice zijn ook minimum deelnemers en uitsluiten bij mute, deafen en AFK instelbaar. Voice wordt per volledige minuut geteld. De bot meet aanwezigheid; hoorbaar spreken wordt niet gemeten.

De kanaalselectie gebruikt Discord-kanaal-ID's. De bestaande botconfiguratie registreert momenteel tekstkanalen; voicekanalen worden bij het aansluiten van de bot gecontroleerd. Een rule opslaan activeert niets: de formulieractie houdt de regel uitgeschakeld en de aparte serverflag blijft uit. Er worden geen verdienbedragen voor je ingevuld.

Levelgrenzen zijn oplopende XP-aantallen. De eerste grens geeft level 1. Zonder ingestelde grenzen blijft iedereen op level 0. Daglimieten gebruiken UTC en gelden per persoon, activiteitstype en Discordserver voor de geselecteerde kanalen samen.

Twitch, Streamer.bot, XP- of saldomigratie uit andere bots en automatische roltoekenning vallen buiten deze eerste CC-stap.

Technische afspraken: [moduleontwerp](../contracts/bucks-xp-v1.md), [API-contract](../contracts/bucks-xp-api-v1.md) en [lokale testresultaten](../acceptatie/BUCKS-XP-V1-20261017.md).
