# Documenten en Drive

[← Wiki](README.md)

Onder **Organisatie → Documenten & Drive** (`/app/documenten`) staat het centrale register van documentlinks, naast de bestaande Drive-/gegenereerde documentregistraties. Het register bewaart verwijzingen; toevoegen uploadt of kopieert het bestand niet en verleent geen toegang tot het externe document.

Zoek op label en open het document of de gekoppelde fiche. De registerlijst heeft pagina's van 50 documenten. Bevoegde beheerders kunnen centraal een label en volledige HTTP(S)-link toevoegen. In een materiaalfiche kun je op **Documenten** meerdere gelabelde links opnemen of bestaande documenten selecteren, bijvoorbeeld facturen, herstelbonnen en een website. Nieuwe links uit ondersteunde fichevelden/koppelingen verschijnen automatisch in het centrale register.

De databank hergebruikt binnen dezelfde organisatie dezelfde genormaliseerde URL. Ondersteunde Google Drive/Docs-linkvarianten met hetzelfde bestand-ID worden samengebracht. Dat is URL-deduplicatie, geen inhoudsanalyse: een bestand met een andere onbekende URL wordt niet automatisch als hetzelfde document herkend. Controleer het bestaande register voordat je een nieuwe registratie maakt.

Een document kan aan meerdere fiches hangen. Een fichekoppeling verwijderen verwijdert niet het externe bestand. Drive-mappen ontkoppelen is een afzonderlijke actie via de [fiche-editor](Dossiers-aanmaken-en-bewerken.md#drive-map-ontkoppelen). Google-dossiergeneratie, goedkeuring en openen van bestanden blijven afzonderlijke acties met hun bestaande rechten. Een registervermelding is geen bewijs van inhoudelijke goedkeuring of een geslaagde Google-koppeling.

Technische bron: migratie `20261012125922_central_document_registry.sql`. Bestaande registraties blijven behouden; migraties niet opnieuw als nieuwe wijziging uitvoeren omdat deze handleiding is bijgewerkt.
