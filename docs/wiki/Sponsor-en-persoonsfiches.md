# Sponsor- en persoonsfiches

De fiches verdelen informatie over zes tabbladen. Naam, type, status en Bewerken blijven bovenaan. Wisselen gebruikt de bestaande appnavigatie; na opslaan keert de actie terug naar het actieve tabblad. Annuleren van het bewerkvenster sluit dat venster op hetzelfde tabblad. Dossieracties bevat archiveren, herstellen en verwijderen met de bestaande bevestiging.

## Sponsorbedrijven

| Tabblad | Informatie |
|---|---|
| Algemeen | Bedrijfsnaam, algemeen e-mailadres, website, sector, notities, primaire contactpersoon en volgende opvolging. |
| Contactpersonen | Individuele personen, functie bij het bedrijf, primaire contactpersoon en koppeling met een centraal contact of gebruikersaccount. |
| Samenwerking | Samenwerkingstype, geschatte waarde, afspraken en voorwaarden, goedkeuring van de sponsorafspraak. |
| Opvolging | Opvolgdatum, notities, contactmomenten en volgende acties. |
| Gekoppelde dossiers | Campagnes en content met directe sponsorkoppeling, plus expliciete relaties naar projecten, events, taken en andere dossiers. |
| Documenten & rapporten | Drive-map, contractlink, gekoppelde bestanden, referentielinks en sponsorrapportage. |

Een sponsor is een bedrijf. De persoonsfiche is de bron voor naam en e-mail van een gekoppelde contactpersoon. De functie bij het bedrijf en de CRM-historie blijven bij de sponsor. Contactpersoon toevoegen en Koppeling wijzigen openen afzonderlijke formulieren. Eenzelfde persoon kan meerdere bedrijven vertegenwoordigen. Er worden geen personen op naam automatisch samengevoegd.

## Community & vrijwilligers

| Tabblad | Informatie |
|---|---|
| Algemeen | Naam, handle, e-mail, Discord, taal en profielnotities. Badges verwijzen naar profiel, intake en account. |
| Profiel & inzetbaarheid | Contactrollen, vaardigheden, interesses, beschikbaarheid, platformen en Streamteamniveau. |
| Intake & ontwikkeling | Contactstatus als intakefase, onboardingstatus, checklist, coaching en training. |
| Inzet & dossiers | Inzet bij projecten en events, toegewezen accounttaken, sponsorbedrijven waarvoor de persoon contactpersoon is, en expliciete dossierrelaties. |
| Account & toegang | Gebruikersaccount, accountstatus, approl en bestuursfuncties. Admin kan portaaltoekenningen bekijken en naar Gebruikers & toegang gaan. |
| Documenten & koppelingen | Drive-map, gekoppelde Google-documenten en referentielinks. Streamerrapportage verschijnt bij de contactrol Streamteam. |

Intakestap toevoegen en Inzet toevoegen openen hun formulier. Inzet verwijst rechtstreeks naar het bijbehorende event of project. Sponsorbedrijven worden getoond vanuit de centrale persoonskoppeling op de CRM-contactpersoon; een afzonderlijke CRM-accountkoppeling is niet automatisch een persoonskoppeling. Verwijderde sponsorbedrijven worden niet getoond.

Contactstatus en contactrollen zijn afzonderlijk van accountstatus en rechten. Een gebruikersaccount koppelen activeert geen lidmaatschap en verleent geen portaaltoegang. Admin en Bestuur kunnen de contactfiche onderhouden. Apprechten en portaaltoegang worden uitsluitend door Admin beheerd. Zie [Rollen en profielen](Rollen-en-profielen.md).

## Documenten en uitrol

Documenten blijven in Google Drive. Koppelen registreert de bestaande bestandsmetadata; het Command Center bewaart geen tweede bestandskopie. Referentielinks en documenten staan apart van dossierrelaties. De bestaande Google-toegangsrechten blijven gelden.

Voer vóór deployment migratie `20261008074044_community_contact_documents.sql` uit op Cloud DEV. Deze staat documentregistraties op persoonsfiches toe en weigert koppelingen naar ontbrekende, verwijderde of organisatievreemde personen. De bestaande toegangsregels blijven actief. De overige tabbladindeling vereist geen datamigratie.

Controleer na deployment beide fiches in licht en donker thema, wisselen van tabbladen, opslaan/annuleren, accountkoppeling, sponsorrelaties en documentkoppeling. Een laadfout wordt als fout weergegeven; ontbrekende gegevens worden niet als bevestigd ingevuld voorgesteld.
