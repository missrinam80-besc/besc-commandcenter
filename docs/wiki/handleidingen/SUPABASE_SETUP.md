# Supabase koppelen

De bestaande DEV-app gebruikt Cloud Supabase. Onderstaande installatie is voor een **nieuw, leeg project**; voer de initiële installatie niet opnieuw op Cloud DEV uit. Voor een afzonderlijke lokale omgeving: [Docker/Supabase lokaal](DOCKER_VPS_SETUP.md).

## 1. Project maken

Maak in Supabase een nieuw project in een Europese regio. Bewaar het databasewachtwoord in een wachtwoordmanager.

## 2. Database installeren

Installeer de volledige keten onder `supabase/migrations` in volgorde, via de Supabase CLI op het bedoelde nieuwe project. Alleen `20260712190000_initial_core.sql` uitvoeren is onvoldoende voor de huidige app: latere migraties bevatten onder meer modules, rechten en gezamenlijke dossieropslag.

Controleer bij een bestaande omgeving eerst welke migraties en schemawijzigingen daadwerkelijk aanwezig zijn. SQL uitvoeren in de SQL Editor registreert niet automatisch de CLI-migratiehistoriek. Zie [repositoryonderhoud](../Repositoryonderhoud.md); reset geen bestaande omgeving om de historie gelijk te trekken.

## 3. Applicatiesleutels instellen

Kopieer `.env.example` naar `.env.local`. Vul uit **Project Settings → API** in:

- `NEXT_PUBLIC_SUPABASE_URL`: Project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key, nooit de secret/service-role key
- `NEXT_PUBLIC_SITE_URL`: lokaal `http://localhost:3000`; op DEV `https://cc-dev.belgianstreamerscommunity.be`

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
   - op DEV `https://cc-dev.belgianstreamerscommunity.be/auth/callback`

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


EINDE
