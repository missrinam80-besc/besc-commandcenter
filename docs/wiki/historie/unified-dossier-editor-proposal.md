# Voorbereiding: één dossiereditor

> Historische notitie. Dit document bewaart het ontwerp of de controle op de genoemde datum; het is geen actuele werkvoorraad. Zie de [wiki](../README.md) en [huidige releasewerkwijze](../Release-en-acceptatie.md).

Status: goedgekeurd op 8 oktober 2026; editor en opslagfunctie geïmplementeerd en lokaal getest. Cloud DEV is nog niet gemigreerd of gedeployed. Zie de [gebruikshandleiding](../Dossiers-aanmaken-en-bewerken.md) voor de uiteindelijke werkwijze. Dit document bewaart het goedgekeurde ontwerp.

## Werkwijze

- Aanmaken: een ruime pop-up met alle tabbladen van de fiche.
- Bewerken: rechtstreeks op de fiche, met één bewerkstand voor alle tabbladen.
- Eén knop **Alles opslaan** verzamelt gewijzigde fichevelden, nieuwe en gewijzigde onderdelen en aangevraagde verwijderingen. Tabwissels behouden de invoer.
- Annuleren verwerpt de invoer na bevestiging. Mislukte opslag behoudt de invoer.
- Goedkeuren, betalen, publiceren en externe synchronisatie blijven expliciete acties met hun bestaande bevoegdheden.

## Precies voorgesteld bereik

De vaste catalogus in `src/lib/dossier-editor-catalog.ts` bevat 22 modellen: taken, projecten, events, campagnes, sponsors, communitycontacten, social posts, content, vergaderingen, inbox, kennisartikelen, budgetten, kosten, inkomsten, producten, merchlanceringen, materialen, nieuwsbrieven, verenigingsleden, bestuursmandaten, wettelijke deadlines en administratieve documenten.

Per model staan daar de toegestane velden en onderdelen, de relatie met het hoofddossier en de vereiste bevoegdheid. De veldmetadata wordt gecontroleerd tegen de bestaande migraties. Organisatie, auditgegevens en willekeurige tabelnamen zijn geen bewerkbare velden. Dit bereik betreft dossiergegevens; integratiegeheimen, gebruikersrechten en organisatie-instellingen krijgen geen algemene schrijfroute.

## Goedgekeurde gezamenlijke opslag

Het voorstel voegt een nieuwe database-opslagfunctie toe die de hoofdfiche en alle aangeleverde onderdelen in één transactie opslaat. Een fout draait de volledige wijziging terug. Dit is een nieuw schrijfoppervlak voor ingelogde gebruikers, ook wanneer bestaande rechten behouden blijven.

Voor uitvoering moeten de volgende beperkingen aantoonbaar gelden:

1. Vaste servercatalogus voor dossiermodellen, tabellen en velden; geen door de gebruiker gekozen SQL-identifiers of generieke interne schrijfhelpers met toegankelijke uitvoerrechten.
2. Uitvoering onder de rechten van de aangemelde gebruiker, met bestaande rijbeveiliging en aanvullende bevoegdheidscontrole voor elk onderdeel. Geen service-role of verhoogde rechten om opslag mogelijk te maken.
3. Organisatie en dossierrelaties worden server-side gecontroleerd. Elk bestaand onderdeel moet werkelijk bij dit dossier horen. Nieuwe relaties mogen geen organisatiegrenzen overschrijden.
4. Een gewijzigde oorspronkelijke versie geeft een conflict en overschrijft geen recentere wijziging. Bij een fout in één onderdeel wordt niets opgeslagen.
5. Financiële controles, identiteitskoppelingen, taakmeldingen, kennisrevisies en bestaande validatietriggers blijven intact. De bundel kan geen betaal-, publicatie- of goedkeuringsstap omzeilen.
6. Nieuwe opslag wordt eerst getest op foutrollback, rollen, cross-organisatiepogingen, gelijktijdige wijzigingen en behoud van bestaande relaties. Daarna pas aansluiten op de schermen.

De automatische goedkeuringscontrole heeft de eerdere SQL-voorstellen geweigerd vanwege het brede schrijfoppervlak. De gebruiker heeft dit specifieke opslagvoorstel daarna goedgekeurd. De migratie voegt uitsluitend de vaste opslagfunctie toe; kalenderacties blijven expliciet en afzonderlijk.

## Uitwerking en acceptatie

Eventtaken, inkomende dossierrelaties en kennisrevisies zijn meegenomen. Documentregistraties behouden hun identiteit en verliezen bij handmatige bronwijziging oude verificatiemetadata. Materialen en VZW-registers gebruiken een inline editor op hun bestaande pagina. Goedkeuren, betalen, publiceren/verzenden en kalenderopvolging blijven afzonderlijke acties.

De lokale tests bewijzen wijzigingsbundeling, schermstructuur en databaseopslag onder bestaande rechten. Ze bewijzen geen volledige werking op Cloud DEV of externe integraties. Na merge, migratie en deployment volgt de live acceptatie.
