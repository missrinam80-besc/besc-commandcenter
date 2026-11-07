# CA03 — lokale YouTube-toestemming en intrekking

Deze stap levert een servermodule, een **niet toegepaste** migratie en geïsoleerde tests. Er zijn geen OAuth-routes, echte provideradapter, beheerknoppen of automatische taken toegevoegd. De module staat standaard uit. Bestaande organisatiekoppelingen en openbare socialrapportage veranderen niet.

## Geteste keten

1. Een aangemelde, geverifieerde actieve gebruiker geeft zelf expliciete toestemming voor één kanaal, geselecteerde video's, een meetperiode, doel, einddatum en bewaartermijn. De eigenaar komt uit de actuele sessie. Herhaalde verzoeken met dezelfde sleutel veranderen de toestemming niet.
2. Een eenmalige autorisatiereservering bindt de aanvraag aan de eigenaar, sessie en een gehashte willekeurige state. Kanaal en beide alleen-lezen scopes moeten overeenkomen. Een vertrouwde serverpoort moet eerst afzonderlijke Google-projectisolatie bevestigen.
3. Alleen serverfuncties kunnen tokenwaarden via Vault verwerken. De vijf private tabellen geven clients, andere leden en beheerders geen directe lees- of schrijfrechten. De eigenaarrespons en auditregels bevatten geen tokens. Meetgegevens blijven buiten de organisatiebreed leesbare socialtabellen.
4. Tokenvernieuwing bewaart een vervangend refresh-token of behoudt het bestaande wanneer de provider geen nieuw token geeft. Meetwaarden onderscheiden nul van ontbrekend; eenheden en meetvenster blijven expliciet.
5. Intrekking blokkeert lokaal direct de toegang en nieuwe opslag. Providerintrekking heeft een afzonderlijke status: nog te doen, mislukt of voltooid. Een fout wordt niet als voltooid gemeld en kan opnieuw worden geprobeerd.
6. Een laat autorisatie- of refreshantwoord na intrekking mag alleen achter de ingetrokken koppeling worden vastgehouden voor opruiming. Het herstelt geen toegang. Late meetgegevens worden geweigerd. PostgreSQL-lockproeven controleren deze volgorde met werkelijk gelijktijdige transacties.

## Bewijs en grenzen

- 22 ketentests op PGlite én 22 op PostgreSQL 17.11; 4 afzonderlijke gelijktijdigheidsproeven.
- De provider en Vault zijn expliciete testdubbels. Dit bewijst de rechten-, opslag- en transactieketen, **geen echte Google-koppeling of Vault-versleuteling**.
- De eerste stap is uitsluitend voor de eigenaar; gedeelde inzage is niet gebouwd. Eén niet ingetrokken koppeling per organisatie/kanaal voorkomt overname via een tweede eigenaar.
- Er is geen automatische verwijdertaak. Einddatums beperken toegang; een echte bewaartermijn en verwijderbeleid moeten nog worden vastgesteld.
- Een echte adapter vereist nog projectisolatiecontrole, browser-/callbackbeveiliging inclusief PKCE, begrensde providerlooptijden en duurzame opruiming bij afgebroken, verlopen of afgewezen autorisatie. De huidige compensatie is specifiek getest voor lokale intrekking. Een verkeerde kanaal-/scope-uitkomst wordt geweigerd, maar de eventuele externe grant wordt hier nog niet duurzaam opgeruimd.
- De expliciete projectisolatiepoort is een lokale voorwaarde, geen controle van de huidige Google-inrichting. Google-intrekking kan grants voor dezelfde gebruiker binnen hetzelfde project raken; alleen een ander client-ID is onvoldoende. Zie [Google OAuth-intrekking](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke).
- De migratie verwijst naar [Supabase Vault](https://supabase.com/docs/guides/database/vault). Controle van de werkelijke extensie, rechten en encryptie blijft nodig vóór een afzonderlijk goedgekeurde live toepassing.

## Lokaal opnieuw controleren

Voer `node --test tests/creator-youtube-kernel.test.mts` uit. Voor PostgreSQL: gebruik een lege wegwerpdatabase `besc_f1_fixture` op `127.0.0.1`, PostgreSQL 17, `F1_NATIVE_TEST=1` en lokale fixturegegevens. Voer daarna `node tests/creator-youtube-concurrency.mjs` uit. De nieuwe CI-taak gebruikt een eigen database zonder Cloud-toegang.

`ops/creator-youtube-local-release.json` bewaart de exacte SQL-hash en alle live toestemmingen op `false`. Het migratieaantal 150 → 151 is een verwachting op basis van de eerdere baseline, geen nieuwe live controle. Vóór eventuele toepassing is een nieuwe inventaris nodig. Deze lokale stap omvat geen push, PR, merge, migratie, uitrol of publicatie.
