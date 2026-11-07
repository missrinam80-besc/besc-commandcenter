# CA02: lokale controle van campagnebijdragen

Gecontroleerd op 7 november 2026, uitsluitend met fictieve gegevens in geïsoleerde lokale databases. Geen Cloud- of serverwijzigingen, providerophaalacties, echte deelname, publicatie of activering van campagneflags.

## Resultaat

- Een ingediende bron is een kandidaat. Alleen een onafhankelijke, actueel bevoegde campagnebeoordelaar kan de bijdrage verifiëren of afwijzen. Een bronlink maakt geen meting of bereikcijfer aan.
- YouTube- en Twitch-linkvarianten worden zonder netwerkverzoek ontleed naar een vaste platformidentiteit en bron-URL. Onveilige hosts, credentials, dubbele YouTube-ID-parameters en niet-HTTPS-invoer worden geweigerd.
- Herhaalde links leveren dezelfde bijdrage op. Een identiek verzoek wordt eenmaal verwerkt; hergebruik van hetzelfde verzoek-ID met andere inhoud geeft een conflict. Een herhaalde inzending na verificatie behoudt de bestaande beoordeling. Een andere creator kan dezelfde bron niet overnemen.
- Voorzitter-, editor-, admin- of lezerstoegang geeft op zichzelf geen beoordelingsrecht. Ook een beoordelaar mag een eigen of zelf ingediende bijdrage niet goedkeuren. Ingetrokken rechten en deelname blokkeren verdere beoordeling.
- Opeenvolgende beoordelingen behouden actor, tijdstip, verwachte revisie, beslissing en volledige onderbouwing in de afgeschermde `campaign_receipts`, met bijbehorende `campaign_events`. Clients kunnen deze tabellen niet rechtstreeks lezen, vervalsen, aanpassen of verwijderen. Een fout bij het toevoegen van een gebeurtenis draait beoordeling, revisie en ontvangstregistratie gezamenlijk terug.
- Op PostgreSQL 17.11 accepteren twee gelijktijdige tegengestelde beoordelingen precies één beslissing. Gelijktijdig herhalen van één verzoek krijgt dezelfde ontvangstregistratie. Een beoordeling die achter een intrekking wacht, wordt na die intrekking geweigerd.

## Lokale reparatie

`runCampaignPilot` controleert nu ook of de campagneantwoordwaarde een geldige aanduiding voor proef/echt bevat. Een ontbrekend antwoord geeft een gecontroleerde foutmelding. Opslag wordt alleen bevestigd met een geldig resultaat-ID; bij een bestaande bijdrage moet dit het aangevraagde ID zijn. Een leeg, ongeldig of afwijkend antwoord krijgt geen succesmelding en vernieuwt de pagina niet.

De regressietests tonen de oorspronkelijke foutpaden en controleren de reparatie. De bestaande actieproef gebruikt nu een realistisch antwoord met resultaat-ID. Een aparte, nog niet uitgevoerde GitHub-job is voorbereid voor de 13 native databasegevallen en drie gelijktijdigheidsproeven. Er zijn geen SQL-, schema- of rechtenwijzigingen nodig.

## Bewijsgrens

98 gerichte lokale tests slagen, waaronder 17 nieuwe actiegevallen, 13 nieuwe databasegevallen en twee extra rendergevallen. Dezelfde 13 databasegevallen en drie gelijktijdigheidsproeven slagen op een tijdelijke PostgreSQL 17.11-container; die is daarna verwijderd.

De historie hierboven is technisch gecontroleerd in de private ontvangst- en gebeurtenisregistratie. Het bestaande campagnepaneel toont de actuele status, beschikbaarheid en revisie; het biedt nog geen volledige tijdlijn met eerdere beoordelingsredenen. De centrale Activiteit-uitbreiding voor campagneopleveringen van PR #140 is een afzonderlijke functie en wordt hier niet gelijkgesteld aan die private tijdlijn.

Een volgende lokale aanvulling bouwt de [beoordelingshistorie in het campagnepaneel](Campagnebijdragen-beoordelingshistorie.md). Die aanvulling is nog niet op Cloud DEV toegepast of uitgerold; de vorige alinea beschrijft de eerdere/live situatie van PR #141.

Volledige live CA02-acceptatie blijft open. Die vraagt afzonderlijk akkoord voor een afgebakende proef en een eigen account van een onafhankelijke beoordelaar. Lokale testrollen zijn geen toekenning van echte toegang. Bestaande live testregistraties zijn ongewijzigd.
