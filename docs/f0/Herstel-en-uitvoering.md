# F0 herstel en uitvoering

Voorbereid op 21 oktober 2026. Dit document is een begrensd uitvoeringsplan, geen opdracht om nu de Cloud-database, servers of artikelstatussen te wijzigen. De volledige opbouwproef gebruikt uitsluitend synthetische fixtures.

## 1 Bewijs en afbakening

Er zijn 118 historische migraties ongewijzigd achter elkaar uitgevoerd op een nieuwe, geïsoleerde PostgreSQL 17.6-database in GitHub CI. De lokale PGlite-proef gebruikt PostgreSQL 18.3 en is daarom niet als gezaghebbende referentie voor de versiegebonden catalogusvergelijking gebruikt. Auth, Storage en Vault zijn in deze proef uitsluitend vormfixtures; hun dienstgedrag is hiermee niet geaccepteerd. Native pgcrypto wordt in het platform-schema geïnstalleerd vóór de oorspronkelijke migraties.

De platformfixture bevat de op DEV waargenomen public-schema-defaultgrants. Dit modelleert de bestaande omgeving voor de vergelijking; het is uitdrukkelijk geen voorstel om deze rechten op Cloud te verlenen. Vergelijking van metadata vervangt geen tests met echte rollen en platformdiensten.

De PostgreSQL-referentie en Cloud bevatten dezelfde gecontroleerde groepen:

| Groep | Aantal | Controle |
| --- | --- | --- |
| Tabellen | 118 | Kolommen, typen, nullability, defaults, identity/generated, expliciete kolomrechten, RLS en effectieve tabelrechten voor de drie API-rollen. |
| Constraints | 850 | Definities, validatie en uitstelbaarheid. |
| Indexen | 418 | Definitie, validiteit en gereedheid. |
| Triggers | 107 | Definitie en inschakeling. |
| Policies | 298 | Rollen, commando, permissiviteit en expressies, inclusief de relevante Storage-policies. |
| Functies | 143 | Identiteit, resultaat, eigenaar, taal, security-mode, search_path/configuratie, volatiliteit, strictness en execute-rechten. |
| Enums | 7 | Labels en volgorde. |
| View | 1 | Definitie, invoker-optie en rechten. |
| Sequences | 2 | Definitie en rechten; actuele tellers zijn runtimegegevens en worden niet gelijkgesteld aan een lege fixture. |
| Schematoegang | 2 | Public/private USAGE voor anon, authenticated en service_role. |

De gecontroleerde vergelijking heeft nul inhoudelijke metadata-afwijkingen. 132 functiebody's zijn na CRLF-normalisatie direct gelijk; bij elf andere zijn uitsluitend lexicaal gecontroleerde opmaak-/hoofdletterverschillen gevonden, met behoud van geciteerde tekst en identifiers. De optionele laatste PL/pgSQL-puntkomma is afzonderlijk toegestaan. Deze conservatieve lexicale vergelijking is geen algemeen bewijs van gedragsequivalentie.

Bronhashes van alle 118 migraties worden vergeleken met het native CI-bewijs. Alleen objectnamen vergelijken is onvoldoende. Ruwe Cloud-metadata en bedrijfsgegevens horen niet in Git; het bewijs bevat geen accountlijsten, contactgegevens, documenten of saldi. Het schema bevat wel bestaande brede platformgrants: die worden apart op doel en toegang beoordeeld vóór nieuwe privéverwerkingen.

## 2 De 34 historieregels indelen

Alle 34 versies staan in de bestaande [verschillenlijst](../wiki/Ecosysteem-basis-en-uitvoering.md). De indeling is nu:

| Klasse | Aantal | Behandeling |
| --- | --- | --- |
| Huidige schema-effecten equivalent; geen aangetroffen tegenstrijdige actuele backfillvoorwaarde | 33 | Voorwaardelijke kandidaten voor herstel van uitsluitend de historieregistratie, na verse preflight en opdracht. Geen bewijs dat iedere historische stap letterlijk is uitgevoerd. |
| Inhoudelijke seed-uitzondering: `20261001110000_seed_operational_guidelines` | 1 | Niet als uitgevoerd registreren. Vijf verwachte titels ontbreken; actuele concepten zijn afzonderlijk voorbereid. |

Actuele geaggregeerde controles: nul oude streamerrollen; nul ontbrekende accountcontactkoppelingen bij de gecontroleerde doelgroep; één geldige brondocumentlink en nul ontbrekende registerverwijzingen; nul financiële documentbronnen zonder financiële beperking; nul ontbrekende ticketserverbindingen; nul ontbrekende configuratierevisies; afgeschermde expense-proofs-bucket met de verwachte limiet. Gewijzigde beheerderslabels blijven behouden en worden niet als automatisch te overschrijven seeddata behandeld.

Deze controles beoordelen de huidige toestand. Ze exporteren geen bedrijfsrijen en reconstrueren geen volledige historische uitvoering. Indien tijdens de verse preflight een afwijking verschijnt, wordt de betrokken kandidaat teruggezet naar onderzoek; niet stilzwijgend een backfill starten.

## 3 De kennisbank-uitzondering oplossen

Voorkeursvoorstel: de [vijf actuele concepten](Kennisbankconcepten.md) beoordelen en daarna als Concept invoeren via de normale contentwerkwijze, zonder bestaande artikelen te overschrijven. Geen publicatiedatum invullen en geen automatische publicatie activeren.

De oorspronkelijke migratie wordt behouden als historische bron. Haar schema-effect, de unieke titelindex, is aanwezig. Haar gepubliceerde startinhoud wordt niet als uitgevoerd voorgesteld. Na de inhoudskeuze moet expliciet worden besloten hoe deze oude seed in de definitieve migratiebaseline als vervangen/afgehandeld wordt verantwoord. Een nieuwe inhoudsaanpak is geen bewijs dat de oude seed is uitgevoerd.

Totdat die beslissing is vastgelegd, blijft deze versie buiten ieder history-repair-commando en blijft automatische brede migratie-uitrol geblokkeerd. Ook na herstel van de 33 andere registraties is het resterende verschil dus bewust zichtbaar. Geen `--include-all`, reset of squash inzetten om dit verschil weg te werken.

## 4 Uitvoeringspakket voor uitsluitend historieherstel

Doelomgeving: **Cloud Supabase DEV, project sjvzrsmrtcxxtmaxigtn**. Dit gebeurt niet in een Termius-sessie op de botserver. Er is geen toestemming voor nieuwe externe toegang nodig zolang de bestaande geautoriseerde verbinding wordt gebruikt; credentials horen niet in chat, scripts of Git.

1. Bevestig de exacte broncommit, migratiehashes en het doelsysteem. Controleer de geïnstalleerde CLI-versie en `migration repair --help` pas in de gekozen uitvoeromgeving; er is nog geen nieuwe CLI geïnstalleerd of verbinding opgeslagen.
2. Maak of controleer een recente afgeschermde handmatige back-up en exporteer het volledige bestaande migratieregister voor terugval. Controleer de bestaande bewijzen; geen automatische back-up instellen.
3. Voer de read-only inventaris, effectvergelijking en actuele gegevenscontroles opnieuw uit. De afhandeling van de 33 kandidaten moet overeenkomen met het goedgekeurde plan; de seed-uitzondering blijft uitgesloten.
4. Maak een exacte toestemmingslijst van uitsluitend de ontbrekende 33 versies. Reeds geregistreerde rijen, oorspronkelijke SQL-bestanden en bestaande bedrijfsgegevens worden niet gewijzigd.
5. Voer na expliciete opdracht alleen de goedgekeurde historiereparatie uit. De officiële operatie is `supabase migration repair [version] ... --status applied --linked`; dit registreert versies en voert hun SQL niet opnieuw uit. De gekoppelde projectidentiteit en versie-ondersteuning moeten vooraf aantoonbaar gecontroleerd zijn. Dit document levert bewust geen blind uitvoerbare versielus.
6. Controleer het register vóór/na: exact 33 bedoelde toevoegingen, alle 84 oude registraties behouden, de seed nog afwezig. Bij de huidige baseline is de verwachte tussenstand 117 geregistreerde versies en één gedocumenteerde uitzondering.
7. Vergelijk het schema opnieuw en controleer behoud van de betrokken bedrijfsgegevens binnen de uitvoeringsprocedure. Een nieuwe metadata-afwijking, onverwachte historieregel of onzekere verbinding betekent stoppen en inspecteren.

Terugval: gebruik de vóór-export om vast te stellen welke registraties door deze handeling zijn toegevoegd. Alleen die exact geïdentificeerde toevoegingen mogen na afzonderlijke terugvalbeslissing als reverted worden hersteld; geen appdata, oude registraties of migratiebestanden verwijderen. Bij onzekere uitkomst eerst opnieuw lezen. Historieherstel is geen rollback van een applicatie of databaseobject.

Bron: [officiële Supabase CLI-uitleg over migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair), geraadpleegd 21 oktober 2026. Zowel applied als reverted wijzigt het migratieregister; de inhoudelijke gevolgen moeten vooraf zijn vastgesteld.

## 5 Losse release van de meetcorrectie

Deze codecorrectie heeft geen database-migratie en kan apart worden beoordeeld. Na mergebesluit en groene imagebouw is het doel **CC-server BESCSRVDEV, map /opt/besc-dev/command-center**. Dit is een webdeploy met de bestaande procedure, gevolgd door health-/versiecontrole en de gerichte rapport-/CSV-/portalproeven uit het acceptatieverslag. Botserver BESCSRVDEV-02 wordt niet gewijzigd.

De productie-inrichting, websiteomschakeling, bevoegdheidstoekenning, vijf kennisbankconcepten en historieherstel zijn geen automatisch onderdeel van die webdeploy. Bij terugval naar de vorige webimage is geen dataconversie nodig. De bestaande uitgeschakelde rewardsfuncties en de behouden accountkoppelingen worden na de webdeploy gecontroleerd.
