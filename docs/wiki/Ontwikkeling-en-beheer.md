# Ontwikkeling en beheer

[← Wiki-startpagina](README.md)

De huidige acceptatieomgeving is DEV op de VPS met Cloud Supabase. De lokale Docker/Supabase-handleiding beschrijft een afzonderlijke lokale ontwikkelomgeving. Voor uitrollen geldt: GitHub → imagebouw → serverdeploy → live controle.

GitHub bewaart code en documentatie; databasegegevens en uploads hebben een afzonderlijke back-up nodig. De PDF-controle en nieuwe uploads in de lokale Storage-herstelomgeving vallen volgens het DEV-scopebesluit van 7 oktober 2026 buiten de huidige acceptatie. De back-uphandleiding blijft beschikbaar voor later gebruik.

## Handleidingen

- [Editorbestanden, migraties en repositoryonderhoud](Repositoryonderhoud.md)

- [DEV_DEPLOYMENT](handleidingen/DEV_DEPLOYMENT.md)
- [BESC bot-API en DEV-leesacceptatie](handleidingen/BESC_BOT_API_READ.md)
- [Supabase koppelen](handleidingen/SUPABASE_SETUP.md)
- [BESC Command Center lokaal en op VPS draaien](handleidingen/DOCKER_VPS_SETUP.md)
- [Backup en restore](handleidingen/BACKUP_EN_RESTORE.md)

## Bot en boekingen beheren

Zie [actuele DEV-status](Huidige-DEV-status.md), [Discordbotbeheer](Discordtickets-en-botbeheer.md) en het [slotcontract](../contracts/event-slot-bookings.md). Termius op **BESCSRVDEV**, `/opt/besc-dev/command-center`, beheert CC; Termius op **BESCSRVDEV-02 / 104.248.194.147**, `/opt/besc-discordbot`, beheert uitsluitend de bot. Een databasecontrole hoort in **DEV Supabase SQL Editor**, een fichewijziging in **CC-webbeheer**.

Een configuratieherlaadactie is geen code-uitrol: maak een beveiligde backup, wijzig uitsluitend de benoemde instelling, hermaak de eigen service met dezelfde lokale image zonder pull en controleer instellingen en gezondheid/verbinding. Gebruik hiervoor niet automatisch `deploy-dev.sh`. Toon nooit volledige Compose/env-uitvoer. Behoud botclientvelden en het duurzame bot-state-volume.

De bestaande `besc-event-slot-mails.timer` verwerkt op de CC-server elke minuut mails via de beveiligde cronroute; behoud Gmail-configuratie en `CRON_SECRET`. De botworker is hiervan onafhankelijk. Bij afsluiten van een DM-test: CC-keuze uit, wachtrij uitsluitend met SELECT controleren, open/onzekere effecten afhandelen en pas daarna worker uit. Geen claim-RPC voor diagnose, geen journalreset of blind herverzenden.
