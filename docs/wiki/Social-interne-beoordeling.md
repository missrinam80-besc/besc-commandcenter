# Interne beoordeling van socialberichten

Implementatie van PR #138, op 6 november 2026 afzonderlijk goedgekeurd en uitgerold naar Cloud DEV als versie `74f7a37`, met migratie `20261106220010`. Dit voegt geen publicatiekoppeling toe.

## Werkwijze

1. Een beheerder of bestuurslid bewaart tekst, kanaalvarianten en het gewenste planningsmoment in Social planning.
2. Via **Ter beoordeling voorleggen** ontstaat één open aanvraag in de bestaande werkvoorraad Goedkeuringen, module Social planning. De volledige ingediende versie wordt bewaard.
3. Tijdens de beoordeling zijn inhoud, kanaalvarianten en archivering geblokkeerd. Een andere bevoegde goedkeurder kan goedkeuren, wijzigingen vragen of weigeren. Bij wijzigingen of weigering is een toelichting verplicht.
4. Na wijzigingen of weigering kan het bericht opnieuw worden voorgelegd. Elke ronde blijft met aanvrager, beoordelaar, tijdstippen, toelichting en ingediende versie zichtbaar in de fiche.
5. Na goedkeuring kan dezelfde versie als gepland worden geregistreerd. Inhoudelijke wijzigingen, inclusief planning, koppelingen en kanaalvarianten, vereisen opnieuw beoordeling. Terugzetten van oude tekst herstelt de oude goedkeuring niet.

## Rechten en bescherming

- Indienen volgt de bestaande bevoegdheid om de organisatie te beheren: actieve beheerders en bestuursleden. Er worden geen rollen toegewezen.
- Beslissen volgt de bestaande goedkeuringsbevoegdheid: actieve beheerder of bestuurslid met de functie Goedkeurder. Een uitsluitend financiële bevoegdheid geeft geen socialgoedkeuring.
- De aanvrager kan de eigen aanvraag niet beslissen, ook niet als beheerder.
- De database controleert dit ook bij rechtstreekse API-aanvragen en bij opslag via de gezamenlijke dossiereditor. Aanvraag en bronstatus veranderen in dezelfde transactie.
- Ingediende momentopnamen, afgeronde besluiten en de versievolgorde kunnen niet door de gebruiker worden herschreven. Organisatiegrenzen en bestaande RLS blijven gelden. De vijf nieuwe functies gebruiken invokerrechten en een vaste lege zoekroute; anonieme uitvoering is ingetrokken.
- Oude registratiestatussen worden niet achteraf als formele goedkeuring geaccepteerd. Er is geen automatische wijziging van bestaande dossiers; een nieuwe aanvraag blijft nodig voor de nieuwe workflow.

## Verificatie en open acceptatie

De nieuwe databaseproeven bouwen alle migraties op in een geïsoleerde PGlite-database en gebruiken echte rollen, policies, triggers en de dossier-RPC. Schermproeven renderen de echte component en testen de echte serveractie met afgeschermde afhankelijkheden. Bestaande werkvoorraad-, audit-, dossierfout- en opslagcontroles blijven slagen.

De 14 databaseproeven slagen ook op een aparte lokale PostgreSQL 17.11-database. Daarnaast slagen zeven proeven met echte gelijktijdige verbindingen en gecontroleerde wachtrijen: dubbele aanvragen, tegenstrijdige besluiten, hoofdtekst wijzigen tijdens goedkeuring, kanaaltekst wijzigen vóór indiening, kanaaltekst wijzigen tijdens goedkeuring, variant verwijderen vóór indiening en beoordelaarsrechten intrekken vóór een wachtend besluit. Historie en momentopnamen blijven daarbij behouden. De nieuwe CI-controle herhaalt beide testbestanden op een eigen tijdelijke database; deze uitbreiding is lokaal voorbereid en nog niet op GitHub uitgevoerd.

De DEV-werkvoorraad is na uitrol alleen-lezen gecontroleerd. Er zijn daarbij geen socialberichten of goedkeuringsaanvragen gemaakt. Een volledige visuele DEV-proef met twee eigen bevoegde accounts blijft open; de eerdere afspraak om te wachten op een tweede goedkeurder blijft behouden.

Het [releasemanifest](../../ops/social-internal-approval-release.json) bewaart de oorspronkelijke grens: samenvoegen en imagebouw geven geen toestemming voor migratie of uitrol. Die twee stappen zijn daarna apart goedgekeurd en uitgevoerd. Deze aanvullende testwijziging voegt geen migratie, uitrol, providerverzoek, bericht, video, e-mail of automatische synchronisatie toe.
