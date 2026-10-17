# Inbox en kosten indienen

[← Wiki](README.md)

## Inbox

Een inboxitem verzamelt een idee, verzoek of ingezonden kost vóór verdere verwerking. Aanmaken/bewerken gebruikt een eenvoudig formulier zonder de algemene dossiertabbladen. De detailfiche biedt omzetting naar ondersteunde werksoorten. Omzetten vraagt de bijbehorende rechten; alleen lezen of indienen geeft geen beheerrecht.

## Kost indienen

**Mijn werkplek → Kost indienen** opent een ingebed formulier op de pagina, zonder pop-up of dossiertabs. Vul omschrijving, positief bedrag met maximaal twee decimalen, kostdatum en indiener/begunstigde in. Leverancier, factuur-/bonnummer en toelichting kunnen worden toegevoegd. Een optioneel bewijsstuk is één PDF, JPG, PNG of WebP van maximaal 5 MB; de server controleert ook het bestandsformaat.

Indienen maakt eerst een inboxinzending, geen rechtstreeks boekhouditem en geen goedkeuring of betaling. De bijlage wordt afgeschermd bewaard en via een gecontroleerde route geopend; plaats geen publieke opslaglink in de chat.

Een medewerker met zowel `manageInbox` als `manageFinance` opent de inzending en kiest **Omzetten naar kostenitem**. De kostgegevens en het bewijsstuk blijven verbonden; een reeds omgezette inzending verwijst naar het bestaande kostenitem. Goedkeuring, betaling en verdere boekhoudkundige verwerking blijven afzonderlijke stappen. CC is geen vervanging voor het externe boekhoudpakket.

Technische bron: migratie `20261014120609_expense_inbox_intake.sql`. De [huidige DEV-status](Huidige-DEV-status.md) onderscheidt deployment en live acceptatie; de aanwezigheid van deze handleiding is geen nieuwe upload- of uitrolactie.
