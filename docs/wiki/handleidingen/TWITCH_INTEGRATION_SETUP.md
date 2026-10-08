# Twitch-integratie instellen

De Twitch-pilot bewaart uitsluitend operationele kanaaldata: accountidentiteit, live-status, huidig kijkersaantal en het aantal geplande streams. Er worden geen followerlijsten of individuele kijkersprofielen opgeslagen.

## Twitch Developer Console

1. Registreer een vertrouwelijke Twitch-app waarvan BESC eigenaar is.
2. Voeg als OAuth redirect URL toe:

   `http://localhost:3001/app/integraties/social/twitch/callback`

   Voeg later voor productie ook toe:

   `https://<jouw-command-center-domein>/app/integraties/social/twitch/callback`

3. Voeg lokaal en in Vercel toe:

```text
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
NEXT_PUBLIC_SITE_URL
SUPABASE_SECRET_KEY
CRON_SECRET
```

De huidige leesfuncties vereisen geen extra gebruikersscope. De app gebruikt wel de Authorization Code Grant zodat een refresh-token veilig server-side kan worden bewaard.

## Test

1. Registreer een Twitch-account onder **Beheer → Integraties → Social accounts**.
2. Klik **Koppel Twitch**.
3. Klik na terugkeer **Nu synchroniseren**.
4. Controleer de synchronisatierun en de officiële metingen onder **Rapportage → Social**.

Bij iedere sync valideert de server het Twitch-token. Een ongeldig toegangstoken wordt via het refresh-token vernieuwd. Tokens staan uitsluitend in Supabase Vault.
