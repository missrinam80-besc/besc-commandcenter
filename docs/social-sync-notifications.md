# Persoonlijke socialwaarschuwingen

Een actieve beheerder of een actief bestuurslid krijgt in Command Center een persoonlijke melding als een automatisch gevolgd socialaccount een mislukte of gedeeltelijke uitvoering heeft, toegang is verlopen of de synchronisatie meer dan 30 minuten achterloopt op het ingestelde interval. Voor een account zonder eerdere synchronisatie begint dat interval bij het aanmaken van het account.

De eigen voorkeur **Socialsynchronisatie** staat standaard aan. Alleen aangesloten platforms met `sync_enabled` komen in aanmerking. Andere contactrollen of portaalrechten geven geen toegang tot deze meldingen. Bij verlies van bestuurs- of beheerdersrechten verbergt de leespolicy ook historische socialmeldingen.

De bestaande socialplanner controleert de meldingen na zijn normale batch, ook als geen accounts aan de beurt zijn. De bestaande persoonlijke meldingsrefresh bij het openen van Command Center controleert ze eveneens. Een dry-run of ongeautoriseerde cronaanroep schrijft geen meldingen. De meldingscontrole start zelf geen synchronisaties, vernieuwt geen toegangstokens en wijzigt geen kanaalinstellingen of quota.

Per account en ontvanger bewaart de database een incident. Herhaalde mislukte pogingen maken geen duplicaat en zetten een gelezen waarschuwing niet telkens opnieuw op ongelezen. Een ander probleem binnen hetzelfde incident werkt de tekst bij. Een aantoonbaar nieuwe geslaagde, actuele uitvoering werkt dezelfde melding één keer bij naar **hersteld**, met informatie-urgentie en opnieuw ongelezen. Een daaropvolgende storing opent een nieuw incident. Alleen opnieuw koppelen is geen bewijs van herstel; dat krijgt een afzonderlijke tekst. Uitgeschakelde of verwijderde bewaking sluit het incident met de tekst **niet actief**, niet **hersteld**.

Meldingen bevatten alleen de kanaalnaam en een vaste beschrijving van het probleem, met een link naar de bestaande integratielogs. Ruwe providerfouten, tokens en accountcredentials worden niet naar de persoonlijke melding gekopieerd.

De incidentcontrole gebruikt een transactieslot per ontvanger/account en een unieke meldingssleutel. De RPC is `SECURITY INVOKER`: gewone gebruikers blijven onder de bestaande RLS werken; alleen de bestaande service role kan voor alle bevoegde ontvangers controleren. De incidenttabel blijft in het private schema.

## Grenzen en release

Dit is een lokale implementatie. Migratie `20261106210000_social_sync_notifications.sql` moet vóór deze applicatieversie worden toegepast. Samenvoegen, migreren en DEV-uitrol vereisen afzonderlijk akkoord. De uitrol verandert geen bestaande socialintervallen of providercredentials. Oude onopgeloste problemen kunnen bij de eerste controle een melding opleveren.

Bij een gestopte planner ontstaan meldingen alsnog wanneer Command Center wordt geopend. Er is geen onafhankelijke achtergrondcontrole wanneer zowel de planner als Command Center uitvalt. Externe bewaking, e-mailwaarschuwingen en een volledige providerstoringproef vallen buiten deze wijziging.

Validatie: de volledige bestaande migratiereeks in een geïsoleerde PGlite-database; incidenten, herhaling, opt-out, rolverlies, organisatiegrenzen, herstel en nieuwe storing; de echte meldingenpagina en voorkeuractie met testgegevens; scheduler-authenticatie, dry-run, foutstatus en het ontbreken van extra providerverzoeken. Echte gelijktijdige PostgreSQL-sessies en live meldingsontvangst zijn afzonderlijke acceptatiepunten.
