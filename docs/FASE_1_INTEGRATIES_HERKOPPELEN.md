# Fase 1 — integraties herkoppelen

Status: voorbereiding gestart op 18 september 2026
Doel: alle actieve integraties gecontroleerd opnieuw verbinden vóór echte data-import en gebruikersacceptatie.

## Veiligheidsregels

- Werk eerst in lokaal of DEV, nooit rechtstreeks in productie.
- Noteer alleen status, datum, omgeving en bewijs; nooit tokens of secrets.
- Gebruik de publishable Supabase-key in de browser. Gebruik de Supabase secret/service-role key uitsluitend server-side.
- Registreer callback-URL's exact; een afwijkende slash, poort of hostname veroorzaakt OAuth-fouten.
- Na elke OAuth-koppeling controleren: accountidentiteit, scopes, tokenopslag, auditregistratie en disconnect.
- Voer synchronisaties minstens tweemaal uit om idempotentie te bevestigen.

## Volgorde

| Stap | Integratie | Waarom eerst/nu | Status |
|---|---|---|---|
| 1 | Supabase project, Auth, Storage en RLS | basis voor alle andere koppelingen | [ ] |
| 2 | Discord/Auth | login en roltesten | [ ] |
| 3 | Google Workspace | Drive, Calendar en documentflows | [ ] |
| 4 | Gmail | communicatie en nieuwsbrieven | [ ] |
| 5 | YouTube | social OAuth en inzichten | [ ] |
| 6 | Meta/Facebook/Instagram | social OAuth en inzichten | [ ] |
| 7 | Twitch | creator-/streamerdata | [ ] |
| 8 | Vercel cron | dagelijkse social synchronisatie | [ ] |
| 9 | AI Gateway | alleen wanneer de afgesproken AI-flow nodig is | [ ] |

Threads, X, LinkedIn en TikTok blijven beslispoorten en worden niet opnieuw gekoppeld voor V1.

## 1. Supabase basis

- [ ] juiste DEV- of lokale Supabase-project geselecteerd;
- [ ] `NEXT_PUBLIC_SUPABASE_URL` gecontroleerd;
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` gecontroleerd;
- [ ] `SUPABASE_SECRET_KEY` server-side ingesteld;
- [ ] `SUPABASE_URL_SERVER` alleen ingesteld waar de runtime dat vereist;
- [ ] nieuwste migraties toegepast;
- [ ] Auth callback naar `/auth/callback` werkt;
- [ ] Storage-bucket en avatar/documentrechten werken;
- [ ] Security Advisor gecontroleerd;
- [ ] RLS gecontroleerd voor gewone gebruiker, beheerder en portaalgebruiker.

Bewijs: login, logout, wachtwoord-/magic-linkflow, één beveiligde mutatie en één afgeschermde directe URL.

## 2. Discord/Auth

Benodigde configuratie:

- [ ] Discord provider actief in de juiste Supabase-omgeving;
- [ ] Client ID en secret in de providerconfiguratie;
- [ ] callback geregistreerd: `http://127.0.0.1:54321/auth/v1/callback` voor lokaal, plus de DEV/productievariant;
- [ ] toegestane URL's bevatten `/auth/callback`;
- [ ] Discord-login getest;
- [ ] Discord-account koppelen en ontkoppelen getest;
- [ ] gebruiker zonder actieve membership blijft geblokkeerd of wachtstatus zien.

## 3. Google Workspace

Controleer service-account/domain-wide delegation en de volgende servervariabelen:

- [ ] `GOOGLE_OAUTH_CLIENT_ID`;
- [ ] `GOOGLE_OAUTH_CLIENT_SECRET` veilig als Docker secret/server environment ingesteld;
- [ ] `GOOGLE_OAUTH_REFRESH_TOKEN` veilig als Docker secret/server environment ingesteld;
- [ ] `GOOGLE_OAUTH_USER_EMAIL`;
- [ ] `GOOGLE_CLOUD_PROJECT_ID`;
- [ ] `GOOGLE_SHARED_DRIVE_ID`;
- [ ] `GOOGLE_DRIVE_ROOT_FOLDER_ID`;
- [ ] `GOOGLE_CALENDAR_ID`;
- [ ] `GOOGLE_TEMPLATE_MINUTES_ID`;
- [ ] `GOOGLE_TEMPLATE_SPONSOR_REPORT_ID`;
- [ ] `GOOGLE_TEMPLATE_EVENT_ID`;
- [ ] `GOOGLE_TEMPLATE_SPONSOR_PITCHDECK_ID` indien pitchdecks in scope zijn;
- [ ] `GOOGLE_TEMPLATE_EVENT_PITCHDECK_ID` indien pitchdecks in scope zijn.
- [ ] geen service-accountkey, Vercel OIDC-token of Workload Identity Pool vereist;

Functionele rooktest:

- [ ] Drive-map voor een dossier vinden of aanmaken;
- [ ] document koppelen zonder bestanden onnodig te kopiëren;
- [ ] Calendar-event maken met correcte tijdzone en eindtijd;
- [ ] vergaderdocument genereren/openen;
- [ ] PDF- of rapportexport controleren;
- [ ] foutmelding bij ontbrekende configuratie is begrijpelijk.

## 4. Gmail

- [ ] Gmail API/domeindelegatie voor `gmail.compose` actief;
- [ ] `GOOGLE_GMAIL_SENDER` ingesteld en geldig;
- [ ] afzender is toegestaan door Workspace;
- [ ] concept maken vanuit een dossier;
- [ ] BCC toepassen;
- [ ] goedkeuring vereist vóór verzending;
- [ ] verzonden Gmail-ID wordt geregistreerd;
- [ ] testmail naar een intern testadres verzonden;
- [ ] geen verzending mogelijk voor een niet-goedgekeurde status.

## 5. YouTube

- [ ] YouTube Data API v3 actief;
- [ ] YouTube Analytics API actief;
- [ ] OAuth consent screen en testgebruiker ingesteld;
- [ ] client-ID en secret ingesteld;
- [ ] callback geregistreerd op `/app/integraties/social/youtube/callback`;
- [ ] `NEXT_PUBLIC_SITE_URL` klopt voor de gekozen omgeving;
- [ ] account koppelen;
- [ ] kanaalidentiteit controleren;
- [ ] handmatige sync uitvoeren;
- [ ] officiële metingen in rapportage controleren;
- [ ] tokenrefresh simuleren of controleren;
- [ ] account ontkoppelen.

## 6. Meta/Facebook/Instagram

- [ ] Meta-app en Business-account geselecteerd;
- [ ] `META_APP_ID` ingesteld;
- [ ] `META_APP_SECRET` server-side ingesteld;
- [ ] `META_GRAPH_API_VERSION` expliciet ingesteld;
- [ ] `SUPABASE_SECRET_KEY` beschikbaar voor server-side credentialopslag;
- [ ] callback geregistreerd op `/app/integraties/social/meta/callback`;
- [ ] minimale vereiste scopes goedgekeurd;
- [ ] BESC-pagina en Instagramaccount geselecteerd;
- [ ] account koppelen;
- [ ] sync uitvoeren;
- [ ] Facebook- en Instagrammetingen controleren;
- [ ] audit en quota controleren;
- [ ] account ontkoppelen.

## 7. Twitch

- [ ] confidential Twitch-app gebruiken;
- [ ] `TWITCH_CLIENT_ID` ingesteld;
- [ ] `TWITCH_CLIENT_SECRET` server-side ingesteld;
- [ ] callback geregistreerd op `/app/integraties/social/twitch/callback`;
- [ ] account koppelen;
- [ ] tokenvalidatie controleren;
- [ ] sync uitvoeren;
- [ ] kanaalstatus, kijkersaantal en geplande streams controleren;
- [ ] refresh-tokenpad testen;
- [ ] account ontkoppelen.

## 8. Cron en automatische sync

Voor Docker/VPS: volg [Automatische social synchronisatie op de VPS](SOCIAL_SYNC_VPS.md). De Vercel-planning start geen taken op de VPS.

- [ ] `CRON_SECRET` ingesteld in DEV/productie;
- [ ] `/api/cron/social-sync` accepteert alleen de juiste Bearer-token;
- [ ] route weigert ontbrekende of foute token;
- [ ] VPS-timer (of Vercel cron bij Vercel-hosting) staat op de bedoelde omgeving;
- [ ] handmatige gecontroleerde aanroep uitgevoerd;
- [ ] tweede aanroep maakt geen dubbele metingen;
- [ ] mislukte connector wordt gelogd zonder secrets te tonen;
- [ ] quota en laatste sync zijn zichtbaar voor beheer.

## 9. AI Gateway — optioneel voor V1

- [ ] eigenaar en toegestane AI-flow vastgelegd;
- [ ] `VERCEL_OIDC_TOKEN` of `AI_GATEWAY_API_KEY` ingesteld;
- [ ] kostenlimiet en providerkeuze vastgelegd;
- [ ] geen gevoelige data naar de AI-flow zonder expliciete afspraak;
- [ ] foutmelding bij ontbrekende configuratie gecontroleerd.

## Integratierooktest-rapport

```text
Datum:
Tester:
Omgeving:
Commit/image:
Integratie:
Actie:
Resultaat: geslaagd / mislukt / n.v.t.
Account of testobject:
Bewijslink/screenshot:
Foutmelding:
Vervolgactie/eigenaar:
```

## Klaar-criterium

De integratiefase is klaar wanneer Supabase/Auth, Google Workspace, Gmail en de actieve social-integraties in dezelfde omgeving zijn gecontroleerd, minstens één echte testflow per integratie slaagt, een dubbele sync geen duplicaten veroorzaakt en alle ontbrekende configuratie bewust als optioneel of als releaseblokkerend is gemarkeerd.
