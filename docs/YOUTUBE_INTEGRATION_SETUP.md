# YouTube-integratie instellen

De Command Center gebruikt een OAuth 2.0-webserverflow. Een serviceaccount kan niet namens een gewoon YouTube-kanaal werken. Accountmetadata staat in `public.social_accounts`; toegangstokens en refresh-tokens staan versleuteld in Supabase Vault.

## 1. Google Cloud voorbereiden

1. Open hetzelfde Google Cloud-project dat voor BESC wordt gebruikt.
2. Schakel **YouTube Data API v3** en **YouTube Analytics API** in.
3. Controleer het OAuth-toestemmingsscherm en voeg de bevoegde BESC-beheerder als testgebruiker toe zolang de app in teststatus staat.
4. Maak een OAuth-client van het type **Web application**.
5. Voeg deze geautoriseerde redirect-URI's toe:
   - lokaal: `http://localhost:3001/app/integraties/social/youtube/callback`
   - productie: `https://<productiedomein>/app/integraties/social/youtube/callback`

Officiële documentatie:

- [OAuth 2.0 voor YouTube-webserverapps](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps)
- [YouTube-kanaal ophalen](https://developers.google.com/youtube/v3/guides/implementation/channels)
- [YouTube Analytics reports.query](https://developers.google.com/youtube/analytics/reference/reports/query)

## 2. Servervariabelen toevoegen

Voeg lokaal en in Vercel toe:

```text
SUPABASE_SECRET_KEY=
GOOGLE_YOUTUBE_CLIENT_ID=
GOOGLE_YOUTUBE_CLIENT_SECRET=
NEXT_PUBLIC_SITE_URL=http://localhost:3001
CRON_SECRET=
```

`SUPABASE_SECRET_KEY` is de geheime serversleutel van het gekoppelde Supabase-project. Geen van deze waarden mag `NEXT_PUBLIC_` krijgen, behalve de al bestaande publieke site-URL.

## 3. Eerste koppeling testen

1. Open **Beheer → Integraties → Social accounts**.
2. Registreer een YouTube-account.
3. Klik **Koppel YouTube** en geef alleen leesrechten.
4. Controleer of het kanaal als **Verbonden** verschijnt.
5. Klik **Nu synchroniseren**.
6. Controleer de geslaagde run en het aantal verwerkte meetpunten.

## 4. Dagelijkse synchronisatie

Wanneer **Automatische synchronisatie** op het account is ingeschakeld, roept Vercel dagelijks om 04:15 UTC de beveiligde cronroute aan. `CRON_SECRET` moet in Vercel bestaan; Vercel stuurt dit automatisch als Bearer-token mee. Op het Hobby-plan blijft de planning bewust beperkt tot eenmaal per dag.

De eerste sync bewaart drie actuele kanaaltotalen en maximaal acht geaggregeerde kernmetingen voor de laatste 28 volledige dagen. Publiceren is in deze pilot niet toegestaan.
