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
