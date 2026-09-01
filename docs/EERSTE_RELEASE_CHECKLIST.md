# Eerste release checklist

Deze checklist is het vaste vertrekpunt voor de eerste volledig werkende versie van het BESC Command Center.

## 1. Lokale basis

- [x] Project staat op de D-schijf: `D:\BESC\Command Center`.
- [x] Docker Desktop werkt.
- [x] Webapp draait lokaal via Docker op `http://localhost:3001`.
- [x] Supabase draait lokaal.
- [x] Lokale database is bijgewerkt met de nieuwste migraties.
- [x] Adminaccount werkt.
- [x] Vrijwilligersaccount werkt.
- [x] Sponsorportaal-testaccount werkt.
- [x] Test-sponsor `GameGear` bestaat lokaal.

## 2. Rollen en toegang

- [x] Admin kan inloggen en de interne app openen.
- [x] Vrijwilliger kan inloggen met beperkte interne toegang.
- [x] Portaalgebruiker komt in het sponsorportaal terecht.
- [ ] Controleren dat portaalgebruiker geen interne `/app`-toegang krijgt.
- [ ] Gebruikersbeheer testen: gebruiker activeren, rol wijzigen, toegang intrekken.
- [ ] Rechtenbeheer testen: custom rol aanmaken, toewijzen en terug verwijderen.

## 3. Kernmodules

Test per module minimaal: openen, record aanmaken, record bewerken, archiveren/verwijderen waar toegestaan.

- [ ] Inbox
- [ ] Taken
- [ ] Projecten
- [ ] Events
- [ ] Campagnes
- [ ] Content
- [ ] Community
- [ ] Sponsors
- [ ] Vergaderingen
- [ ] Documenten
- [ ] Communicatie
- [ ] Nieuwsbrieven
- [ ] Financien
- [ ] Shop
- [ ] Kennisbank
- [ ] Rapportage
- [ ] Meldingen
- [ ] Archief
- [ ] Acceptatie
- [ ] Integraties

## 4. Rapportage en exports

- [ ] Rapportagepagina opent zonder fout.
- [ ] Managementrapportage opent zonder fout.
- [ ] CSV-export werkt.
- [ ] PDF-export werkt waar voorzien.
- [ ] Sponsorrapport werkt met testdata.
- [ ] Eventrapport werkt met testdata.
- [ ] Creator-/streamerrapport werkt met testdata.

## 5. Communicatie en nieuwsbrieven

- [ ] E-mailsjabloon aanmaken.
- [ ] E-mailsjabloon gebruiken in communicatieflow.
- [ ] Nieuwsbrief aanmaken.
- [ ] Nieuwsbriefvoorbeeld bekijken.
- [ ] Publieke inschrijving testen.
- [ ] Bevestigingsflow testen.
- [ ] Uitschrijfflow testen.
- [ ] Controleren dat BCC-adressen correct worden behandeld.

## 6. Externe koppelingen

Deze onderdelen zijn pas volledig klaar zodra de externe accounts en API-toegang ingesteld zijn.

- [ ] Discord login/provider configureren.
- [ ] Google Drive configureren.
- [ ] Google Docs configureren.
- [ ] Google Calendar configureren.
- [ ] Gmail configureren.
- [ ] YouTube OAuth/API configureren.
- [ ] Meta/Facebook/Instagram configureren.
- [ ] Threads configureren.
- [ ] Twitch configureren.

## 7. Docker en VPS

- [x] Dockerfile aanwezig.
- [x] Lokale docker-compose aanwezig.
- [x] Productie docker-compose aanwezig.
- [x] Caddy-configuratiebestand aanwezig.
- [ ] Definitieve domeinnaam kiezen.
- [ ] `ops/Caddyfile` invullen met echt domein en beheerdersmail.
- [ ] Productie `.env.production` voorbereiden.
- [ ] Beslissen: managed Supabase of self-hosted Supabase op VPS.
- [ ] VPS installeren: Ubuntu LTS, Docker, Docker Compose, Git.
- [ ] Project naar VPS overzetten.
- [ ] Productiecontainer bouwen.
- [ ] HTTPS controleren.

## 8. Backups en beheer

- [ ] Databasebackupstrategie kiezen.
- [ ] Handmatige lokale backup testen.
- [ ] Restore-test uitvoeren.
- [ ] Updateprocedure vastleggen.
- [ ] Admin-noodprocedure vastleggen.
- [ ] Secretsbeheer documenteren.

## 9. Kwaliteitscontrole

Voor iedere grotere wijziging:

- [ ] `pnpm test`
- [ ] `pnpm run lint`
- [ ] `pnpm run build`
- [ ] `docker compose up --build`
- [ ] Korte browsercontrole
- [ ] Commit maken
- [ ] Push naar GitHub

## 10. GitHub-afspraak

- Werk gebeurt op een aparte branch.
- Elke afgeronde stap krijgt een duidelijke commit.
- Elke afgeronde stap wordt naar GitHub gepusht.
- `main` blijft de stabiele bron.
- Grote wijzigingen gaan via een pull request naar `main`.
