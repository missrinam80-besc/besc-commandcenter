# AC01/AC02 — gerichte DEV-voorcontrole, 5 november 2026

Deze voorcontrole is geen volledige ecosysteemacceptatie of productie-goedkeuring. Live controles waren alleen-lezen: geen loginformulier ingediend, e-mail verzonden, botactie uitgevoerd, schema gewijzigd of bedrijfsgegeven aangepast.

## Actuele baseline

| Onderdeel | Hoofdcommit | Laatste CI |
| --- | --- | --- |
| Command Center | `7ddcfd2eb212ae11af43b54eeeee628ad8aa8c8a` | kwaliteitscontrole 42064959907; imagebouw 42064959850 geslaagd |
| Website | `3f270dadd052236aa28903d9e73ce5e4d6a4dfc4` | kwaliteit 42039297797; imagebouw 42039297802 geslaagd |
| Discordbot | `f71f0ea2f5b7507c16c030439802c021b22c16c2` | botchecks 41718939246; imagebouw 41719297421 geslaagd |

Runtime-images zijn afzonderlijk uitgelezen: CC `sha256:9e0bfc8afbe40122dc58e4080e52a18f160f57a7c3197b2b047242d7df8d8da9`, website `sha256:7a60e242ff9ace7a230ae7a7d0a4eb261752c5ea5264b691602471042288e1a7`, bot `sha256:c254e2b0bd598438dac1d837fcf0f53acfc8521f52474b501dba97febad9efbb`. Beide webapps healthy; bot running. Geen herstart uitgevoerd tijdens deze voorcontrole.

Cloud DEV: 146 migratieregistraties, nieuwste `20261105154724`, 197 tabellen in public/private, drie Storage-buckets en drie objecten. Betaalde agentuitvoering is gepauzeerd: dispatch vereist een expliciete niet-gepauzeerde controlerij, die ontbreekt.

## Nieuwe controle-uitkomsten

- Elf gerichte databasecontroles geslaagd, binnen een read-only transactie. Geen via anon/authenticated leesbare of beschrijfbare applicatietabellen zonder RLS aangetroffen in de gecontroleerde catalogusselectie. Geen volledige databasebeveiligingsaudit afgeleid uit deze selectie.
- Directe toegang tot operations_state en publication_admin_access geweigerd. Anonieme statuslezing, ontbrekende of niet-bestaande sessie en een andere organisatie geweigerd; bestaande actieve admin met echte sessie toegestaan. Dit bewijst niet alle rollen en organisatiescenario's.
- Tien HTTP-controles geslaagd. Afgeschermde routes verwijzen naar aanmelden; drie gecontroleerde API-routes weigeren ontbrekende credentials met 401. Website blijft noindex, robots weigert crawlen, sitemap heeft geen pagina-items.
- Echte aanmeldschermen bekeken op 1440 en 390 pixels: geen horizontale overflow of JavaScript-pageerrors; documenttaal, hoofdheading en beeld-alt aanwezig. Websitevelden zijn gelabeld.
- Vier CC-velden hadden een zichtbaar label zonder programmatische koppeling: login-e-mail, login-wachtwoord, recovery-e-mail en magic-link-e-mail. Deze wijziging koppelt ze via unieke id/htmlFor-paren. De bestaande drie registratievelden blijven omsluitend gelabeld. Lokale browserproef bevestigt voor alle zeven velden de labels en focus na labelklik op beide schermbreedtes. Geen wijziging van auth-acties, veldenamen, registratiebeleid, mailverzending of visuele opmaak.
- HSTS en framebescherming ontbreken in de gemeten antwoorden; nosniff ontbreekt bij CC-login. Beleid voor applicatie-inbedding en headers moet afzonderlijk worden beoordeeld. Er is geen exploitatie vastgesteld en in deze wijziging is geen headerbeleid aangepast.
- Tijden van eenmalige HTTP-metingen varieerden circa 0,1–2,8 seconden. Dit is geen belastingproef of Core Web Vitals-meting.

## Herstelbaarheid en vervolg

De afgeschermde off-server kopie van 25 oktober is opnieuw gecontroleerd: alle 13 oorspronkelijke hashes kloppen. De bestaande netwerkloze database/Storage/Vault- en botstateproeven blijven geldig voor die toenmalige kopie. Dat is geen bewijs van herstel van de huidige omgeving: historie is inmiddels van 137 naar 146 gegaan. De lokale Docker-engine was tijdens de voorcontrole niet actief; geen nieuwe herstelproef uitgevoerd.

Eerstvolgende herstelmijlpaal: een actuele eenmalige kopie van database/Auth/Storage, runtimeconfiguratie en botstate; daarna herstel in een geïsoleerde omgeving zonder externe workers of mail/Discord-effecten. Consistente botstate vraagt een gecontroleerde korte schrijfpauze of aantoonbaar equivalente consistente snapshot. Hiervoor wordt afzonderlijk concrete uitvoering voorbereid. Geen dagelijkse back-uptaak ingesteld.

Volledige account-/rolwissels, echte providerketens, exports/meldingen, fout/retry-scenario's, volledige WCAG-toets, ingelogde mobiele schermen en volledige app/Auth/mail/Discord-herstelketen blijven open. Behouden F1–F5-varianten worden niet op basis van deze voorcontrole afgevinkt. Privacyteksten en bewaarbehandeling, onafhankelijke off-hostbewaking, benoemde vervanging en productieomgeving blijven afzonderlijke open punten.

Ruwe technische bewijzen en vier live schermafbeeldingen staan buiten de repository onder `work/AC01-20261105/`. Ze bevatten geen credentials of sessie-ID's. Geen nieuwe volledige back-up of brondata in Git opgenomen.
