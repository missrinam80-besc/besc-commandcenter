# BESC Command Center

Interne werkplek voor BESC vzw met ledenbeheer, planning, projecten, events, campagnes, content, sponsors, communicatie, rapportage, social inzichten en portalen.

## Lokale ontwikkelomgeving

De aanbevolen lokale setup draait op Windows met Docker Desktop en lokale Supabase:

1. Werk vanuit `D:\BESC\Command Center`.
2. Vul `.env.local` op basis van `.env.docker.example`.
3. Start Supabase lokaal.
4. Start de webapp met Docker Compose.
5. Open de app op `http://localhost:3001`.

Gebruik `docs/DOCKER_VPS_SETUP.md` voor de volledige beginnershandleiding.

## Configuratie

Belangrijke gidsen:

- `docs/SUPABASE_SETUP.md`
- `docs/GOOGLE_WORKSPACE_SETUP.md`
- `docs/YOUTUBE_INTEGRATION_SETUP.md`
- `docs/TWITCH_INTEGRATION_SETUP.md`
- `docs/META_INTEGRATION_SETUP.md`
- `docs/EERSTE_RELEASE_CHECKLIST.md`
- `docs/V1_CLEANUP_AUDIT.md`

Secrets horen nooit in Git. Gebruik lokaal `.env.local` en later op de VPS of in Vercel echte productievariabelen.

## Kwaliteitscontrole

Gebruik voor afgeronde wijzigingen minimaal:

```powershell
pnpm test
pnpm run lint
pnpm run build
```

Voor de productiecontainer:

```powershell
docker build --target runner -t commandcenter-web:production-check .
```
