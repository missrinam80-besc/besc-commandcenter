# CA03 — lokale opvang van YouTube-providerantwoorden

Deze stap bouwt een expliciet versleuteld ontvangstlog voor de **codewisseling tijdens de persoonlijke YouTube-aanmelding**. Het antwoord wordt vastgelegd voordat de bestaande kern kanaal, scopes en activering afhandelt. De koppeling en het ontvangstlog staan standaard uit en zijn niet aan HTTP-routes, Google of een automatische taak gekoppeld. Geen migratie of serverinstelling is gewijzigd.

## Volgorde en herstel

1. De coördinator controleert de oorspronkelijke eigenaar, organisatie, sessie, browser en state. De kern controleert de echte aanvraag en de projectisolatiepoort. Het ontvangstlog legt daarna een eenmalige reservering vast, vóór de providerpoort wordt aangeroepen.
2. Het teruggegeven antwoord wordt beperkt tot tokenvelden en kleine noodzakelijke bindingsvelden en onder de bestaande sleutelring versleuteld opgeslagen. Ruwe providerfouten en extra velden, zoals een ongebruikt `id_token`, worden niet in het ontvangstlog bewaard. Het oorspronkelijke antwoord gaat alleen intern naar de kern voor de bestaande strikte validatie.
3. Pas na bevestigde opslag mag de kern activeren. Daarna wordt de toepassingsbevestiging in het ontvangstlog vastgelegd, vóór de aanvraag als volledig afgerond wordt bevestigd. Onzekerheid over één van deze bevestigingen geeft geen succes terug.
4. Na een onderbreking wordt een opgeslagen antwoord alleen voor intrekking en opruiming gebruikt. Er is **geen** herstelpad dat de autorisatiecode opnieuw inwisselt, een opgeslagen token alsnog activeert of publiceert.
5. Eerst wordt de koppeling lokaal ingetrokken. Een geldig opgevangen antwoord kan vervolgens achter de ingetrokken koppeling in de bestaande afgeschermde SQL-opruimroute worden geplaatst. De bestaande kern trekt het token in en controleert de actuele database-uitkomst. Hiervoor is geen nieuwe SQL-functie of bevoegdheid toegevoegd.

Het ontvangstlog bindt aan aanvraag, link, eigenaar-/sessiehash, browserhash en statehash. Een afgeleid ID in een afzonderlijke naamruimte bindt de versleuteling aan het ontvangstbestand; een aanvraagbestand kan niet als ontvangstbewijs worden verwisseld. Het log gebruikt dezelfde atomische revisieopslag, maar de proeven houden sleutelring, aanvragen en antwoorden in aparte privémappen.

## Wat een onderbreking betekent

| Onderbreking | Uitkomst na herstart |
| --- | --- |
| Tijdens de provideroproep of vóór publicatie van het antwoordbestand | Er is alleen een reservering: externe uitkomst onbekend, geen token verzonnen en geen tweede codewisseling. |
| Na publicatie, vóór opslagbevestiging of vóór activering | Het antwoord blijft leesbaar voor opruiming; de aanmelding wordt niet hervat. |
| Na een SQL-commit waarvan de bevestiging verloren ging | Intrekking en hercontrole, zonder opnieuw te activeren. De oorspronkelijke historie blijft behouden. |
| Tijdens intrekking of vóór de bevestiging daarvan | Versleutelde opruimintentie en antwoord blijven beschikbaar; expliciet herstel kan dezelfde intrekking opnieuw controleren. |
| Bij een ontbrekende sleutel of beschadigde ciphertext | Geen antwoord vrijgegeven, geen vervangende sleutel en geen verzonnen succes. |

Een laat antwoord na annulering wordt alsnog versleuteld opgevangen, maar uitsluitend voor opruiming. Een gewijzigd of opnieuw aangeboden antwoord overschrijft geen eerder ontvangen credential. Meerdere processen kunnen dezelfde aanvraag niet opnieuw naar de provider sturen.

Bij een verkeerd kanaal, verkeerde scopes of een verlopen token mag de herstelpoort het opgevangen credential na lokale intrekking proberen in te trekken, maar niet opslaan als actieve toegang. Als de bestaande SQL-opruimvoorwaarden niet kunnen worden bevestigd, blijft de uitkomst `pending`, ook na een succesvolle providerintrekking. Een onbekende, mislukte of wegens projectisolatie geblokkeerde uitkomst wordt evenmin als `complete` gemeld.

## Grenzen en gegevensbescherming

Dit lost niet het onvermijdelijke gat op tussen externe afgifte/ontvangst en de eerste duurzame lokale vastlegging. Bij uitval in dat gat, onbereikbare schijf of een niet ondersteund antwoord blijft de externe grant onbekend. Er is nog geen echte providerreconciliatie of beperkte beheerprocedure om dat gat definitief af te sluiten. Er zijn geen echte tokens ontvangen of ingetrokken.

De proeven gebruiken nagebootste provider- en Vault-antwoorden. De projectisolatiepoort is een vertrouwde lokale voorwaarde, geen controle van de huidige Google-inrichting. Een echte adapter moet bevestigde, al ingetrokken en onzekere intrekkingsantwoorden correct onderscheiden. Intrekking kan binnen een Google-project bredere grants van dezelfde gebruiker raken; de [Google-documentatie](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke) blijft daarom bepalend voor de toekomstige inrichting.

De lokale sleutelring ondersteunt voor dit doel maximaal 32 KiB plaintext en 64 KiB versleutelde bestandsinhoud; gewone aanmeldrecords behouden hun eigen kleinere limiet. De grootste ondersteunde proef bevat twee ASCII-testtokens van elk 8192 tekens. Te grote of ongeldige antwoorden worden niet afgekapt: de uitkomst blijft onbekend. De hoofdsleutelbron, backup, bewaartermijn, vernietiging en schijflimieten blijven open. Ook een volledig verwerkt antwoord blijft versleuteld in revisiehistorie aanwezig; er is geen automatische verwijdering.

Dit ontvangstlog wordt alleen door de eigenaargebonden coördinator gebruikt. Er is geen nieuwe browser-API, beheerdersomweg of scanner. De herstelpoort accepteert alleen opgevangen antwoorden uit die gecontroleerde keten en mag niet als algemene intrekkings-API worden blootgesteld. Bestaande tokenvernieuwing en metingen zijn in deze stap niet van een nieuw ontvangstlog voorzien. Er zijn geen extra synchronisaties gestart.

De [opslaggrenzen](ca03-youtube-local-recovery.md), [sleutelgrenzen](ca03-youtube-local-keyring.md) en benodigde toekomstige HTTP-/cookiebeveiliging blijven gelden. Procesuitval is getest; bescherming tegen stroomuitval, schijfrollback en verlies van de hoofdsleutel wordt niet geclaimd.

## Lokale controle

`node --test tests/creator-youtube-provider-inbox.test.mts tests/creator-youtube-kernel.test.mts tests/creator-youtube-oauth-attempt.test.mts tests/creator-youtube-keyring.test.mts tests/creator-youtube-durable.test.mts`

De proeven controleren echte procesbeëindiging rond ontvangst en opruiming, gelijktijdige processen, sleutelrotatie, ontbrekende/beschadigde opslag, maximale tokenlengten, vertraagde antwoorden, verloren SQL-bevestigingen en de bestaande eigenaar-/toestemmingsgrenzen. Alleen eigen synthetische tijdelijke testmappen worden opgeruimd.

Op 7 november 2026 slagen alle 113 gerichte proeven en 1.526 algemene tests. De 24 ontvangstproeven, 21 sleutelproeven en 14 opslagproeven slagen op Windows en in een netwerkloze Linux-container. De 35 kerntests slagen ook op PostgreSQL 17.11; vier bestaande echte transactieraces blijven groen. TypeScript, ESLint en de lokale productiebuild slagen. De bouw meldt dezelfde 27 afhankelijkheidsbestanden buiten de uitvoermap door de bestaande gedeelde node_modules-koppeling; dit is geen validatie van een uitrolbare image.
