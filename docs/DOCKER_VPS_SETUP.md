# BESC Command Center lokaal en op VPS draaien

Deze gids vertrekt van Windows en bouwt naar een latere VPS-deployment. De originele project-zip blijft onaangeraakt; werk altijd in een Git-branch.

## 1. Wat zit er nu in de repository?

- Webapp: Next.js 16 met React 19.
- Package manager: pnpm.
- Database/auth: Supabase, met SQL-migraties in `supabase/migrations`.
- Huidige lokale env-bestanden: `.env.local` en backups zitten in de uitgepakte map, maar `.gitignore` sluit `.env*` uit. Commit deze nooit.
- Discordbot: in deze repository staat nu geen aparte bot-code. Discord komt momenteel alleen terug als Supabase Auth-provider.

## 2. Minimale software op Windows

Installeer of controleer deze onderdelen:

1. Git
   - Nodig om wijzigingen veilig in branches te bewaren.
   - Controle: open PowerShell en voer `git --version` uit.

2. Node.js
   - Nodig als je de app rechtstreeks op Windows wil starten zonder Docker.
   - Deze repo gebruikt Node 24 in CI en in Docker.
   - Controle: `node --version`.

3. pnpm
   - Nodig voor installatie en scripts buiten Docker.
   - Controle: `pnpm --version`.

4. WSL2
   - Docker Desktop gebruikt dit op Windows.
   - Controle: open PowerShell als gewone gebruiker en voer `wsl --status` uit.
   - Staat WSL2 er nog niet op, installeer via: `wsl --install`.
   - Herstart daarna je pc.

5. Docker Desktop
   - Nodig voor containers.
   - Installeer Docker Desktop voor Windows.
   - Kies tijdens installatie voor WSL2.
   - Start Docker Desktop en wacht tot links onderaan staat dat Docker draait.
   - Controle in PowerShell: `docker --version`.

## 3. Veilige werkbranch maken

Als je zelf verder werkt:

```powershell
git checkout main
git pull
git checkout -b docker-vps-setup
```

Werk niet rechtstreeks op `main` zolang de Docker/VPS-opzet nog getest wordt.

## 4. Lokaal starten met Supabase CLI

De app heeft een volledige Supabase-stack nodig, niet alleen een losse PostgreSQL-database. De Supabase CLI start lokaal Auth, REST, Storage, Studio en Postgres in Docker.

Eerste keer:

```powershell
pnpm dlx supabase init
pnpm dlx supabase start
```

Na `supabase start` toont Supabase lokale waarden, waaronder:

- API URL, meestal `http://127.0.0.1:54321`
- anon key
- Studio URL, meestal `http://127.0.0.1:54323`

Kopieer daarna het voorbeeldbestand:

```powershell
Copy-Item .env.docker.example .env.local
```

Open `.env.local` en vul minstens in:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key uit supabase start>
NEXT_PUBLIC_SITE_URL=http://localhost:3001
```

De lokale Supabase-instellingen staan in `supabase/config.toml`.
Gebruik de Studio-pagina voor Auth Providers niet als enige bron van waarheid. Voor lokale ontwikkeling worden externe loginproviders, zoals Discord, via `supabase/config.toml` ingesteld.

### Discord-login lokaal voorbereiden

1. Open het Discord Developer Portal.
2. Maak een application aan voor lokale tests, bijvoorbeeld `BESC Command Center Local`.
3. Ga naar OAuth2.
4. Voeg deze redirect URL toe:

```text
http://127.0.0.1:54321/auth/v1/callback
```

5. Kopieer de Client ID en Client Secret.
6. Zet deze waarden lokaal in `.env` of in je lokale shell:

```env
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
```

7. Zet daarna in `supabase/config.toml` onder `[auth.external.discord]`:

```toml
enabled = true
```

8. Herstart Supabase zodat de providerconfiguratie geladen wordt.

Pas daarna de database opnieuw toe:

```powershell
pnpm dlx supabase db reset
```

Let op: `db reset` wist alleen je lokale Supabase database en bouwt hem opnieuw op vanuit `supabase/migrations`.

## 5. Webapp lokaal starten met Docker

Zorg dat Docker Desktop draait. Start daarna:

```powershell
docker compose up --build
```

Open daarna:

```text
http://localhost:3000
```

Stoppen kan met `Ctrl+C`. Alles opruimen zonder je database te wissen:

```powershell
docker compose down
```

## 6. Webapp lokaal starten zonder Docker

Dit blijft handig tijdens ontwikkeling:

```powershell
pnpm install
pnpm dev
```

Open daarna `http://localhost:3000`.

## 7. Voorbereiding VPS

Op de VPS heb je minimaal nodig:

- Ubuntu LTS
- Docker Engine
- Docker Compose plugin
- Git
- een domeinnaam die naar de VPS wijst

Voor productie gebruik je:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Voor je live gaat:

1. Maak `.env.production` op de VPS.
2. Zet daarin productie-Supabase waarden en `NEXT_PUBLIC_SITE_URL`.
3. Pas `ops/Caddyfile` aan:
   - vervang `admin@example.com` door je beheerdersmail;
   - vervang `commandcenter.example.com` door je echte domein.
4. Start opnieuw met `docker compose -f docker-compose.prod.yml up --build -d`.

## 8. Belangrijke beslissing voor later

Er zijn twee realistische routes voor productie:

- Supabase managed gebruiken voor database/auth/storage en alleen de webapp op je VPS draaien.
- Supabase volledig self-hosten op de VPS.

Voor een eerste VPS is managed Supabase technisch eenvoudiger en veiliger. Volledig self-hosted Supabase kan, maar vraagt extra beheer voor backups, upgrades, SMTP, secrets en beveiliging.
