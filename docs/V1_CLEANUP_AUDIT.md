# V1 cleanup- en structuuraudit

Datum: 10 september 2026.

Dit document houdt bij wat lokaal al klaarstaat, wat nog moet gebeuren voor een eerste volledig werkende versie en welke opruimacties pas na akkoord uitgevoerd mogen worden.

## Huidige basis

- Projectlocatie: `D:\BESC\Command Center`.
- Lokale app: `http://localhost:3001`.
- Lokale Supabase API: `http://127.0.0.1:54321`.
- Lokale Supabase Studio: `http://127.0.0.1:54323`.
- Branch voor het werk: `docker-vps-setup`.
- GitHub remote: `missrinam80-besc/besc-commandcenter`.

## Reeds getest

- Beheerder kan inloggen.
- Vrijwilliger kan inloggen.
- Sponsorportaal-testaccount werkt.
- Portaalgebruiker krijgt geen interne `/app`-toegang.
- Gebruikersbeheer is getest: activeren, rol wijzigen en toegang intrekken.
- Rechtenbeheer is getest: custom rol aanmaken, toewijzen en verwijderen.
- Discord-login en Discord-accountkoppeling werken.
- Google Workspace-koppeling werkt.
- YouTube OAuth en sync werken.
- Twitch OAuth en sync werken.
- Facebook/Instagram via Meta werken.
- Threads en X worden bewust niet gebruikt in V1.

## Module-indeling

De applicatie is al opgesplitst in herkenbare functionele modules via `src/app/app/*`:

- Mijn werkplek: home, taken, inbox, kalender, goedkeuringen, meldingen.
- Planning en uitvoering: projecten, events, campagnes, social planning.
- Relaties en communicatie: community, sponsors, communicatie.
- Content en publicatie: content, nieuwsbrieven, shop, AI Hub.
- Organisatie: vergaderingen, administratie, financiën, documenten, kennisbank.
- Inzichten: rapportage, management, social inzichten, sponsorrapportage, creator-/streamerrapportage.
- Beheer: gebruikers, rechten, integraties, activiteit, archief en historiek.

De modules zijn voldoende apart voor V1. Er is bewust gedeelde code voor generieke modulepagina's, formulieren, rechten, integraties en rapportage. Dat is correct: het voorkomt dubbele logica en maakt de app beter onderhoudbaar.

## Nog te doen voor V1

- Kernmodules met echte testdata volledig nalopen: aanmaken, bewerken, koppelen, archiveren en waar toegestaan verwijderen.
- Rapportage en exports testen: CSV, PDF, sponsorrapport, eventrapport en streamer/creatorrapport.
- Communicatie en nieuwsbrieven end-to-end testen: sjabloon, nieuwsbrief, inschrijving, bevestiging, uitschrijving en BCC.
- Acceptatiepagina volledig invullen met bewijs per test.
- Productievariabelen voorbereiden voor VPS of Vercel.
- Definitieve domeinnaam en HTTPS-configuratie bepalen.
- Backup- en restoreprocedure volgen en minstens een restore-test uitvoeren.
- Beslissen of Monday-importhistoriek actief bewaard blijft in de app of alleen als archief.

## Opruimkandidaten

Deze bestanden zijn kandidaat voor opruiming, maar worden niet verwijderd zonder expliciet akkoord:

- `public/file.svg`
- `public/globe.svg`
- `public/next.svg`
- `public/vercel.svg`
- `public/window.svg`

Deze lijken standaard Next.js-starterbestanden. De app gebruikt momenteel `public/besc-logo.png`.

De map `monday-export/output` bevat lokale export- en analysebestanden. Deze map staat correct in `.gitignore` en wordt niet naar GitHub gestuurd. Niet verwijderen zolang de Monday-migratie of historische controle nog nuttig kan zijn.

De scripts in `monday-export/build` zijn migratiehulpmiddelen. Bewaar ze voorlopig totdat beslist is dat Monday-import definitief afgesloten is.

Historische roadmapdocumenten zoals `docs/feedback-roadmap-2026-08-03.md` en `docs/phase-8-feasibility-2026-08-03.md` kunnen later naar `docs/archive` worden verplaatst. Dat is opruiming van documentstructuur, geen functionele wijziging.

## Technische aandachtspunten

- `.env.local` en andere echte env-bestanden worden genegeerd door Git.
- `.env.example` en `.env.docker.example` blijven bewust in Git als veilige voorbeelden.
- De lokale devcontainer draait op poort `3001`, omdat poort `3000` eerder bezet was.
- Een productiebouw in de devcontainer moet expliciet met productieomgeving gebeuren. Gebruik bij twijfel liever de Docker-productiecheck:

```powershell
docker build --target runner -t commandcenter-web:production-check .
```

## Aanbevolen volgende ronde

1. Update de eerste-releasechecklist met de integraties die intussen effectief getest zijn.
2. Werk de resterende kernmoduletests af en leg de resultaten vast in de releasechecklist.
3. Maak lokaal een eerste databasebackup volgens `docs/BACKUP_EN_RESTORE.md`.
4. Ruim starterassets op na expliciet akkoord.
5. Maak daarna een release-kandidaatbranch of pull request naar `main`.
