# F1 acceptatie en DEV-draaiboek

Actuele bouwstatus en afwijkingen ten opzichte van het voorbereide contract: [implementatie en testbewijs](Implementatie-en-testbewijs.md). Dit document bewaart ook voorstellen en de afzonderlijke voorwaarden voor DEV/F2.


[F1-overzicht](README.md). Dit draaiboek bewaart de oorspronkelijke testvoorraad. De [62 proefgevallen](acceptatiegevallen.json) onderscheiden geïsoleerde dekking en live acceptatie; ze zijn niet allemaal live geslaagd. De actuele uitvoering en gerichte schermproeven staan in het [DEV-verslag van 22 oktober](../acceptatie/F1-DEV-20261022.md).

## 1 Benodigde fixtures en bewijs

Gebruik twee synthetische organisaties A/B met aparte personen, dossiers en bewijs. Label alle inhoud `TESTFIXTURE — NIET PUBLICEREN`. Rollen: admin zonder mandaat, actuele geverifieerde voorzitter, beëindigde voorzitter, administratieve behandelaar, financieel reviewer, redacteur, intern lid/vrijwilliger, eigen portaalaccount en andere persoon. Geen echte accounts raden of accountrechten aanmaken om een test groen te krijgen.

Basisobjecten: bekende en onbekende deadline; historisch completed dossier zonder uitvoeringsbeoordeling; governancebronrevisies 1/2; bewijs beschikbaar/vervangen/ingetrokken; geldige en ingetrokken doelverklaring; partner met esports- én eventrol; historische sponsor; event en nieuwsconcept. Testcontent heeft geen productiedomein, persoonsgegevens of echte wettelijke claims.

Per geval: broncommit, migratieversie/hashes, omgeving, actorsoort, synthetische organisatie, invoer/revisie, verwachte uitkomst, feitelijk resultaat en bewijsverwijzing. Bij weigering: geen gedeeltelijke positieve status, audit-succes, andere-organisatiegegevens of dubbel effect. Bij toestemming: precies de bedoelde mutatie, juiste actor/revisie en audit.

## 2 Automatische lagen

| Laag | Verplichte dekking |
| --- | --- |
| Node-/appunit | Statusovergangen, validatie, allowlist, foutfeedback, datum onbekend, datums/tijdzone, revisie-/hashbinding en terugtrekken van verleende scope. |
| Native PostgreSQL 17 | Nieuwe migraties vanaf lege fixture én F0-equivalente bestaande fixture; echte grants/RLS/RPC/trigger-tests met gescheiden JWT-/DB-rollen. Geen superuser als bewijs dat een normale rol juist is afgewezen. |
| Concurrency | Twee afzonderlijke echte verbindingen: mandaatintrekking versus besluit; bronvervanging versus review; toestemmingintrekking versus publicatie; dubbel request-ID. Bewijs welke bewerking eerst committe en dat de tweede opnieuw controleert. |
| HTTP/serveractions | Geauthenticeerde juiste/onjuiste rol, directe RPC, tabelwrite en generieke editor; CSRF/sessievoorwaarden waar van toepassing. Niet alleen de zichtbaarheid van een knop testen. |
| Bestaande regressies | Financiële/e-mailgoedkeuringen, accountcontacten, Discord-/Twitchidentiteit, tickets, persoonlijke Bucks, rapportselectie en F0-meetweergave. Geen live Discordactie als bijeffect van tests. |

Passende bestaande suite en generators lopen bij implementatie. De historische 976 F0-tests zijn geen resultaat van deze nieuwe proefgevallen. Nieuwe schema-/procesfeatures krijgen hun eigen betekenisvolle tests; deze voorbereiding voegt nog geen applicatietests of CI-job toe.

## 3 Gerichte DEV-volgorde

1. Controleer de exacte geïmplementeerde wijzigingsset, besluiten voor de betreffende live stap, verse Cloud-baseline en handmatige back-up. Geen testfixtures in Cloud zonder afzonderlijke toestemming.
2. Migreer/deploy volgens het [releaseplan](Schema-en-release.md), met exacte doelomgeving. Bewaar before/after en rollbackkeuze. Een geslaagde imagebouw is geen migratie- of gebruikersacceptatie.
3. F1.1: controleer een expliciet aangewezen testbinding; verkeerde organisatie, dubbele binding, veranderd account en verlopen mandaat falen. Een admin zonder mandaat kan niet formeel beslissen.
4. F1.2: begin met onbekende termijn; leg regel-/toepasselijkheidsbron vast; dien bewijsrevisie 1 in; review en formele beslissing afzonderlijk. Vervang of trek bewijs in: historie blijft, actuele bewijsstatus vraagt herbeoordeling. Oud completed dossier blijft administratief.
5. F1.3: persoon ziet alleen eigen vastgestelde doeltekst/scope; intrekken blokkeert dat doel onmiddellijk in de centrale operatie. Ander doel en andere persoon blijven behouden. Controleer queued/replay-verwerking met synthetische acties.
6. F1.4: bevestig esports/eventrollen, kies concrete campagnebijdrage, controleer relatie en rapport. Historische sponsor en portaaltoegang blijven behouden; niet-sponsor krijgt geen sponsor-default of extra inzage.
7. F1.5: event en nieuws naar intern voorbeeld; verboden veld/HTML/URL geweigerd. Keur precies revisie 1 goed, wijzig bron naar revisie 2 en bevestig dat nieuwe goedkeuring nodig is. Intrekken verhindert later gebruik; er is nog geen publieke websiteketen geaccepteerd.
8. Herhaal gevoelige routes met admin-zonder-mandaat, vrijwilliger en organisatie B. Zoek-/link-/export-/notificatieprojecties bevatten geen vertrouwelijke titels of URLs voor die acteurs.
9. Controleer smal scherm, toetsenbord, focus, foutmeldingen, light/dark mode en lange labels. Toon bevoegdheids-/bewijsstatus in gewone taal; geen schema- of tokeninformatie in gebruikersschermen.
10. Linda bevestigt de praktische werking per onderdeel. Leg resterende beperkingen expliciet vast; stop bij afwijking en inspecteer de actuele toestand vóór een retry. Maak alleen toegestane synthetische testinhoud via de gecontroleerde route ongedaan; verwijder geen auditbewijs.

## 4 Stopcriteria en F1-poort

Stop de betreffende live stap bij: verkeerde tenant/actor, onvoldoende formele binding, ontbrekende doel-/publicatiebeslissing, onverwachte schema/history-drift, brede onbeoordeelde grant, onbehouden oude gegevens, verloren audit, niet-reproduceerbare bewijsversie of onbewezen terugval. Geen globale ‘goed genoeg’ wanneer één beschermde route nog een omweg biedt.

F1-DEV gereed vereist I01–I09, G01–G12, C01–C09, D01–D05, P01–P07, U01–U10, R01–R04 en E01–E06 met passende bewijslagen, of een expliciet buiten scope gehouden geval dat de beloofde F1-keten niet ondergraaft. Een `planned`, `blocked` of synthetisch resultaat wordt niet naar `live_accepted` omgezet zonder bewijs.

De F2-overdracht bevat het publicatiecontract, goedgekeurde publieke velden/actoren, voorbeeldrevisies en open hosting-/cachebesluiten. Het bewezen F1-resultaat is een interne gedeelde werkstroom, geen publieke lancering, juridische conformiteitsverklaring of volledige ecosysteemacceptatie.
