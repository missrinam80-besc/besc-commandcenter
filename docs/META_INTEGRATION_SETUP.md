# Meta-integratie instellen

De eerste Meta-pilot ondersteunt Facebook-pagina's en professionele Instagram-accounts via de officiële Graph API. Persoonlijke Instagram-accounts worden niet ondersteund.

Threads gebruikt een afzonderlijke OAuth-stroom, maar schrijft naar hetzelfde beveiligde account-, synchronisatie- en metricmodel.

## Meta-app

1. Maak of gebruik een Meta Business-app waarvan BESC eigenaar is.
2. Activeer Facebook Login for Business en de Instagram Graph API.
3. Voeg deze exacte geldige OAuth redirect URI toe:

   `https://<jouw-command-center-domein>/app/integraties/social/meta/callback`

4. Vraag alleen de scopes die de app gebruikt:
   - Facebook: `pages_show_list`, `pages_read_engagement`, `read_insights`
   - Instagram: bovenstaande scopes plus `instagram_basic`, `instagram_manage_insights`
5. Voor accounts die niet als approl of testaccount zijn toegevoegd, is Advanced Access en mogelijk App Review nodig.

## Vercel-variabelen

Voeg voor Development, Preview en Production toe:

```text
META_APP_ID
META_APP_SECRET
META_GRAPH_API_VERSION
THREADS_APP_ID
THREADS_APP_SECRET
NEXT_PUBLIC_SITE_URL
SUPABASE_SECRET_KEY
CRON_SECRET
```

`META_APP_SECRET` en `SUPABASE_SECRET_KEY` zijn uitsluitend servervariabelen en mogen nooit het voorvoegsel `NEXT_PUBLIC_` krijgen. Vul bij `META_GRAPH_API_VERSION` bewust de actieve versie uit het Meta-dashboard in; de applicatie kiest geen mogelijk verouderde versie voor je.

Voeg voor Threads als redirect URI toe:

`https://<jouw-command-center-domein>/app/integraties/social/threads/callback`

De Threads-pilot vraagt alleen `threads_basic` en `threads_manage_insights`. Publicatiescope wordt pas toegevoegd wanneer de menselijke goedkeurings- en publicatieworkflow gebouwd wordt.

## Account koppelen

1. Registreer onder **Beheer → Integraties → Social accounts** een Facebook- of Instagram-account.
2. Als meerdere pagina's worden beheerd, vul vooraf het externe pagina-ID of Instagram-account-ID in.
3. Klik **Koppel via Meta** en keur de gevraagde scopes goed.
4. Voer **Nu synchroniseren** uit.
5. Controleer de run en de officiële metingen onder **Rapportage → Social**.

Tokens worden via de bestaande server-only RPC in Supabase Vault opgeslagen. Supabase bewaart in publieke tabellen alleen accountmetadata, synchronisatieruns en geaggregeerde meetwaarden.

## Beperkingen van de pilot

- Facebook Insights kan per paginatype, permissie en API-versie verschillen. Profielmetingen blijven bewaard wanneer Insights niet beschikbaar is; de run krijgt dan status `partial`.
- Instagram vereist een professioneel account dat aan een beheerbare Facebook-pagina is gekoppeld.
- Publiceren blijft buiten deze pilot. De roadmap vereist eerst een menselijke goedkeuringsstap voor geplande content.
