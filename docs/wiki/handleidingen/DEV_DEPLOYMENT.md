# DEV-uitrol

[← Ontwikkeling en beheer](../Ontwikkeling-en-beheer.md)

De acceptatieomgeving draait op BESCSRVDEV, met Cloud Supabase als database, Auth en Storage. De app staat op [cc-dev.belgianstreamerscommunity.be](https://cc-dev.belgianstreamerscommunity.be). Caddy verzorgt HTTPS; de webcontainer luistert intern op poort 3000.

## Van wijziging naar DEV

1. Controleer de code en maak een GitHub-PR.
2. Merge na akkoord en wacht op de geslaagde GitHub-imagebouw van `ghcr.io/missrinam80-besc/besc-commandcenter:dev`.
3. Voer alleen eventuele nieuwe, gecontroleerde migraties op Cloud DEV uit. Zie [repositoryonderhoud](../Repositoryonderhoud.md).
4. Werk de servercheckout bij wanneer ops-scripts of configuratiebestanden zijn gewijzigd. Bouw geen gewijzigde appcode op de server.
5. Deploy via Termius op de bestaande server:

```bash
cd /opt/besc-dev/command-center
bash deploy-dev.sh
```

Het script gebruikt `docker-compose.server.yml`, bewaart de actieve image voor rollback, haalt de GitHub-image op en wacht op een gezonde webcontainer. Controleer daarna de live schermen en functies die gewijzigd zijn.

## Configuratie en planning

De bestaande `.env.production` staat afgeschermd buiten Git en wordt door de webservice ingelezen. Het wijzigen van configuratie vereist dat de webcontainer opnieuw wordt aangemaakt. Deel de inhoud niet in chat of Git.

De social planner staat los van de image-uitrol. Zie [systemd-planning](SOCIAL_SYNC_VPS.md) voor de service, timer en controles zonder synchronisatie.

Gebruik de [releasecontrole](../Release-en-acceptatie.md) voor verdere acceptatie. GitHub bewaart code en migraties; gegevens en uploads hebben een afzonderlijke back-up nodig.

## Serverdoelen en configuratie zonder code-uitrol

Deze handleiding geldt uitsluitend voor **CC-server BESCSRVDEV**, `/opt/besc-dev/command-center`. De bot op **BESCSRVDEV-02 / 104.248.194.147**, `/opt/besc-discordbot`, heeft een eigen repo, Compose-project, credentials en image. Niet dezelfde opdrachten op beide servers uitvoeren.

Voor een alleen-configuratiewijziging: bestaande instellingen veilig uitlezen, beveiligde backup maken en uitsluitend de goedgekeurde variabele of het ene clientrecord wijzigen. Hermaak alleen web met dezelfde image, zonder pull; controleer healthy, image-ID, exacte overige instellingen en behoud van Caddy. Gebruik daarvoor geen volledige code-deploy. Zie [gedateerde eindstand](../Huidige-DEV-status.md).

De slotmailtimer `besc-event-slot-mails.timer` staat los van de sociale timer en van de bot-slotworker. Behoud beide planningen en geheimen bij updates. Wijzig geen timer als onderdeel van een willekeurige webconfiguratieherlaadactie.
