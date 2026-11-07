# CA03 — lokale OAuth-terugkeercontrole

Deze vervolgmodule bouwt voort op de toestemmingskern uit PR #144. Zij staat standaard uit en is niet aan HTTP-routes of een echte Google-adapter gekoppeld. Er is geen nieuwe databasewijziging of live configuratie.

## Gebouwd en getest

- Iedere aanvraag krijgt een eigen state, browsernonce en PKCE-verifier met S256-challenge. Alleen de challenge gaat in het aanmeldverzoek; de verifier gaat uitsluitend naar de serverpoort voor codewisseling. Zie [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636).
- De aanvraag bindt aan organisatie, gebruiker en sessie uit een vertrouwde serverpoort, plus de afzonderlijke browsernonce. Een verkeerd gebonden antwoord wisselt geen code en trekt de legitieme aanvraag niet in.
- Aanvraaginhoud wordt met AES-256-GCM versleuteld en geauthenticeerd. Aanvraag-ID en revisie zijn authenticated additional data: kopiëren naar een andere ID, revisiewijzigingen, een verkeerde sleutel of gewijzigde bytes worden geweigerd. De sleutel wordt alleen via de serverconstructor aangeleverd, gekopieerd en niet opgeslagen.
- De opslagpoort vereist atomair vergelijken en vervangen per revisie. Daardoor kan slechts één callback de providerpoort bereiken, ook met twee coördinatoren. Testopslag is een gedeelde in-memory dubbel; een nieuwe instantie kan dezelfde versleutelde aanvraag lezen, maar dit bewijst geen herstartbestendige productieopslag.
- Aanvragen verlopen na vijf minuten. Afwijzing, annulering, verloop en fouten geven geen geslaagde koppeling terug. Een foutmelding van de provider en de autorisatiecode worden niet opgeslagen of doorgegeven.
- De bestaande toestemmingskern controleert de aanvraag nogmaals na de codewisseling en vóór activering. Bij annulering of verloop wordt lokaal ingetrokken; een laat token kan alleen via de bestaande afgeschermde opruimroute worden verwerkt. De database controleert daarnaast opnieuw de sessie, toestemming en generatie.
- De codewisseling krijgt de verifier en exact de vooraf geconfigureerde HTTPS-terugkeer-URI. De URI komt niet uit callbackparameters; credentials, querystrings en fragments zijn uitgesloten. Zie ook [Google webserver-OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

## Bewuste grenzen

Dit is een lokale protocolmodule, geen werkende browserkoppeling. Een productieadapter voor duurzame opslag met echte multi-worker-CAS, sleutelbeheer en rotatie, HTTP-aanmeld- en callbackroutes, CSRF-beveiliging van begin/annuleren en een veilige `HttpOnly; Secure; SameSite`-cookie ontbreken nog. Een echte Google-adapter moet de PKCE-parameters aantoonbaar gebruiken, providerlooptijden begrenzen en actuele projectisolatie verifiëren.

De opslagpoort bevat geen nieuwe SQL-adapter. De tests tonen echte lokale AES-GCM-eigenschappen aan, maar geen Vault-encryptie of duurzame opslag. De bestaande Vault- en providerpoorten zijn nog testdubbels. Er is geen automatische taak gestart.

Bij een onbekende opslag- of provideruitkomst meldt de module geen succes en probeert zij lokaal in te trekken. Dit garandeert geen opruiming na procesuitval of een volledig onbereikbare opslag. Ook opruiming van een grant met verkeerd kanaal of verkeerde scopes en herstel van achtergebleven `running`-aanvragen vereisen nog een duurzame compensatie-adapter. Die productievoorwaarden blijven open; deze stap claimt geen volledige tokenlevenscyclus.

De definitieve bewaartermijn, verwijdering, gedeelde inzage en de daadwerkelijke Google-projectscheiding zijn nog niet vastgesteld. Het bestaande gedrag en de beperkingen van [de lokale toestemmingskern](ca03-youtube-local-kernel.md) blijven gelden. Er zijn geen echte tokens vernieuwd of ingetrokken, geen accounts gekoppeld en geen migratie, uitrol of publicatie uitgevoerd.

## Lokale controle

`node --test tests/creator-youtube-oauth-attempt.test.mts tests/creator-youtube-kernel.test.mts` controleert de protocolgrens en integratie met de SQL-kern. De bestaande CA03-native CI-job voert de uitgebreidere kerntests uit; de algemene suite neemt de nieuwe protocoltests mee. Voor native PostgreSQL wordt uitsluitend een lege lokale wegwerpfixture gebruikt.

Gecontroleerd op 7 november 2026: 44 gerichte lokale proeven (19 protocolproeven en 25 kerntests), dezelfde 25 kerntests op PostgreSQL 17.11, vier bestaande echte transactieraces en alle 1.457 algemene tests geslaagd. TypeScript, ESLint en productiebuild slagen. De bouw meldt dezelfde 27 afhankelijkheidsbestanden buiten de uitvoermap door de bestaande gedeelde node_modules-koppeling; dit bewijst geen uitrolbare image. De lokale testcontainer is gestopt en automatisch verwijderd.
