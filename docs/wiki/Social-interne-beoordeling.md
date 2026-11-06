# Interne beoordeling van socialberichten

Lokale implementatie van 6 november 2026. Nog niet op Cloud DEV toegepast of uitgerold. Dit voegt geen publicatiekoppeling toe.

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

Native PostgreSQL-concurrency en een visuele DEV-proef met twee eigen bevoegde accounts zijn nog niet uitgevoerd. De bestaande afspraak om de live proef met een tweede goedkeurder open te laten blijft behouden.

Voor Cloud DEV zijn aparte goedkeuring van migratie en uitrol nodig. Het lokale [releasemanifest](../../ops/social-internal-approval-release.json) legt die grenzen vast. Er zijn geen providerverzoeken, berichten, video's, e-mails of automatische synchronisaties toegevoegd.
