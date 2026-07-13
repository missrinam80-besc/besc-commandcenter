# Supabase koppelen

## 1. Project maken

Maak in Supabase een nieuw project in een Europese regio. Bewaar het databasewachtwoord in een wachtwoordmanager.

## 2. Database installeren

Open **SQL Editor**, plak de volledige inhoud van `supabase/migrations/20260712190000_initial_core.sql` en voer die één keer uit.

## 3. Applicatiesleutels instellen

Kopieer `.env.example` naar `.env.local`. Vul uit **Project Settings → API** in:

- `NEXT_PUBLIC_SUPABASE_URL`: Project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key, nooit de secret/service-role key
- `NEXT_PUBLIC_SITE_URL`: lokaal `http://localhost:3000`; later de Vercel-URL

## 4. Eerste beheerder activeren

1. Start de app en log één keer in via e-mail.
2. Open in Supabase **Table Editor → organization_members**.
3. Zoek jouw nieuwe rij en wijzig `status` naar `active` en `role` naar `admin`.
4. Log opnieuw in. Je hebt nu beheerderstoegang.

Nieuwe gebruikers krijgen automatisch `pending` en `volunteer`. Een beheerder moet hen later activeren.

## 5. Discord configureren

1. Maak in het Discord Developer Portal een applicatie `BESC Command Center`.
2. Open OAuth2 en voeg de Supabase callback-URL toe die Supabase toont bij **Authentication → Providers → Discord**.
3. Kopieer Discord Client ID en Client Secret naar die Supabase-provider en schakel hem in.
4. Voeg in Supabase bij **Authentication → URL Configuration** toe:
   - `http://localhost:3000/auth/callback`
   - later `https://jouw-vercel-domein/auth/callback`

## 6. E-mail configureren

Laat voor de eerste test e-mail OTP/magic links actief. Voor productie is eigen SMTP aanbevolen, omdat de ingebouwde maildienst limieten heeft.

## 7. Controle

Start `pnpm dev` en test achtereenvolgens:

1. e-mailinlog;
2. Discord-inlog;
3. wachtende gebruiker;
4. beheerder activeren;
5. inboxitem maken en omzetten naar taak;
6. taak starten en afronden;
7. project met Google Drive-link maken.
