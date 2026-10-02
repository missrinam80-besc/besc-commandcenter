# Automatische social synchronisatie op de DEV-VPS

De Vercel-planning in `vercel.json` draait niet op een Docker-VPS. Deze VPS gebruikt een systemd-timer. De bestaande Vercel-configuratie blijft behouden voor eventuele Vercel-omgevingen; activeer niet beide planners voor dezelfde omgeving.

De timer controleert **elke 15 minuten** of accounts aan de beurt zijn. Alleen dan worden platformen opgehaald. Een accountinterval van 1440 minuten geeft ongeveer dagelijkse synchronisatie (maximaal circa 15 minuten later). Dit voorkomt dat een vaste dagelijkse start een account overslaat doordat de vorige run enkele seconden later eindigde. `Persistent=true` zorgt voor een inhaalcontrole na downtime. De scripts gebruiken de bestaande webcontainer en lezen `CRON_SECRET` daar rechtstreeks. Het geheim staat niet in de unit, commandoregel of logs. Een lock voorkomt gelijktijdige scriptuitvoering.

## 1. Eerst code uitrollen

Deze bestanden moeten eerst gecommit/gepusht en naar `main` gemerged zijn. Wacht tot de Docker-build op GitHub groen is. Daarna op de VPS:

```bash
cd /opt/besc-dev/command-center
git pull --ff-only origin main && bash deploy-dev.sh
```

Stop bij een Git/deployfout. Installeer geen timer zolang de nieuwe route niet draait.

## 2. Configuratie controleren

Gebruik hetzelfde Compose-bestand als `deploy-dev.sh`. Controleer de `COMPOSE_FILE`-instelling met `grep -n COMPOSE_FILE deploy-dev.sh`. Het synchronisatiescript gebruikt standaard `docker-compose.server.yml` en stopt als dit ontbreekt. Voor een ander bestand stel je `BESC_COMPOSE_FILE` in, ook in de systemd-service via een `Environment=`-regel.

```bash
docker compose -f docker-compose.server.yml exec -T web node -e 'console.log(process.env.CRON_SECRET ? "CRON_SECRET ingesteld" : "CRON_SECRET ontbreekt")'
```

Bij ontbrekend geheim: zoek via `grep -A 3 env_file docker-compose.server.yml` welk env-bestand jouw deployment gebruikt (op deze DEV-server `.env.production`). Open dat met `nano`, voeg `CRON_SECRET=` met een zelf gegenereerd sterk willekeurig geheim toe (bijvoorbeeld `openssl rand -hex 32`), sla op en voer `docker compose -f docker-compose.server.yml up -d --no-deps --force-recreate web` uit. Vervang de bestandsnaam in alle commando's als je deployment een ander Compose-bestand gebruikt. Gebruik geen `NEXT_PUBLIC_`-variabele. Deel het geheim niet in chat of screenshots. Controleer opnieuw met bovenstaand commando.

In **Social accounts**: schakel Automatische synchronisatie in voor de gewenste verbonden accounts. Gebruik voor dagelijkse cijfers een interval van 1440 minuten als dat instelbaar is. Een recent handmatig gesynchroniseerd account wacht tot zijn interval verstreken is.

## 3. Veilig testen zonder platformaanroepen

```bash
bash ops/run-social-sync.sh --check-auth
bash ops/run-social-sync.sh --dry-run
```

Verwacht: beveiliging OK (401 zonder token). De dry-run geeft `considered` (actieve auto-sync accounts), `due` (nu aan de beurt) en `dryRun:true`. Geen nieuwe runs of metingen. Verkeerde tokens worden ook geweigerd; dit is lokaal getest.

Bij `considered:0`: controleer de automatische instelling en verbonden status. Bij `due:0`: wacht tot het interval verstreken is. Dit is geen fout. Voor een gecontroleerde test kun je tijdelijk het interval op 15 minuten zetten en die tijd sinds de laatste sync laten verstrijken; zet daarna je gewenste interval terug.

## 4. Timer installeren

Uitvoeren als root, zoals bij je eerdere deployments. Deze units verwijzen specifiek naar `/opt/besc-dev/command-center`; gebruik ze niet ongewijzigd voor een andere omgeving.

Als deze unitnamen al bestaan: bewaar ze eerst voordat je ze vervangt.

```bash
install -m 644 ops/besc-social-sync.service /etc/systemd/system/besc-social-sync.service
install -m 644 ops/besc-social-sync.timer /etc/systemd/system/besc-social-sync.timer
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/besc-social-sync.service /etc/systemd/system/besc-social-sync.timer
```

Stop als verify een fout geeft.

## 5. Een echte geplande run testen

Dit haalt echte platformcijfers op voor accounts die aan de beurt zijn:

```bash
systemctl start besc-social-sync.service
journalctl -u besc-social-sync.service -n 30 --no-pager
systemctl start besc-social-sync.service
journalctl -u besc-social-sync.service -n 30 --no-pager
```

Eerste run: `ok:true`, `failed:0`, `partial:0`, en `succeeded` hoger dan nul als er accounts due waren. Controleer in de app een nieuwe **scheduled** run, nieuwste ophaaldatum en cijfers onder Socialrapportage. Tweede onmiddellijke run: normaal `due:0`, geen extra metingen voor dezelfde accounts. De unieke databaseconstraint op account + geplande tijdvaksleutel beschermt ook dubbele connectorruns; de live concurrentietest is hiermee niet vervangen.

Bij `partial` of `failed` stopt de service met een foutstatus; controleer het account en de synchronisatiehistoriek. Geen automatische retries: dezelfde tijdvaksleutel kan een herhaling overslaan. Na herstel kun je handmatig synchroniseren of wachten op het volgende geplande tijdvak.

## 6. Dagelijkse planning inschakelen

Na succesvolle test:

```bash
systemctl enable --now besc-social-sync.timer
systemctl list-timers besc-social-sync.timer --no-pager
```

Een inhaalrun kan direct bij het activeren starten. Controleer morgen, zonder op Nu synchroniseren te klikken, de nieuwe scheduled run en Socialrapportage. Daarmee is de automatische end-to-end test afgerond; lokale tests bewijzen niet dat je VPS-timer daadwerkelijk draait.

Uitschakelen indien nodig: `systemctl disable --now besc-social-sync.timer` (verwijdert geen data).

## Technische controles

- De route vereist Bearer-authenticatie en antwoordt met `Cache-Control: no-store`.
- Alleen verbonden, niet verwijderde accounts met `sync_enabled=true` worden geselecteerd.
- Accounts worden gepagineerd; de batchlimiet van acht geldt pas na de intervalcontrole.
- Het VPS-script verwerkt resterende batches, begrensd op twintig batches.
- Partial is niet langer succeeded; mislukte/gedeeltelijke runs geven HTTP 503.
- De bestaande unieke runconstraint blijft intact; geen nieuwe migratie nodig.

Bron voor timer-/inhaalgedrag: [systemd timer documentatie](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html).
