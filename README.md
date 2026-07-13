# BESC Command Center

Eerste werkende basis voor release 0.1: Home, Inbox, Taken en Projecten.

## Lokaal starten

1. Kopieer `.env.example` naar `.env.local` en vul de Supabase-waarden in.
2. Voer de SQL-migratie in `supabase/migrations` uit op een Supabase-project.
3. Schakel e-mail en Discord in onder Supabase Auth Providers. Voeg `/auth/callback` toe aan de redirect allow list.
4. Start met `pnpm dev`.

## Huidige staat

De dashboard-UI bevat representatieve voorbeelddata om de informatiearchitectuur te beoordelen. De Supabase SSR-clients, OAuth-callback en beveiligde kernmigratie zijn aanwezig. De volgende iteratie verbindt de schermen met echte data en voegt inloggen plus accountgoedkeuring toe.

## Configuratie

Volg [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) om de database, e-mailauthenticatie, Discord en de eerste beheerder te configureren.
