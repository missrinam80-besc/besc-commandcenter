# F1 partnerrollen en publicatiecontract

[F1-overzicht](README.md). Voorstellen voor interne F1-functionaliteit en de latere F2-consument. Er is geen nieuw publiek endpoint, nieuw domein of actieve websiteclient aangemaakt.

## 1 Partnerorganisaties en bijdragen

`partners` blijft het organisatieregister. Voorgestelde `partner_roles` bevat organisatie, partner, rolcode, geldigheid, status, eventuele bewijsreferentie en provenance. Eerste rollenlijst ter vaststelling: `sponsor`, `esports`, `community`, `event`, `education`, `social_impact`. Dat zijn rollen van organisaties; geen omzetting van bestaande persoonsrollen.

Een `record_relationships`-relatie tussen campagne/event en partner benoemt de concrete bijdrage en haar herkomst. Voorbeelden: een esportsorganisatie kan een eventinhoudelijke bijdrage leveren; een sponsor kan uitsluitend voor een bepaalde campagne sponsor zijn. Een algemene rol geeft geen contract, portaaltoegang, inzage in financiën of publicatiegoedkeuring.

### Compatibele overgang

1. Alleenlezende aantallen van `partner_type`, actuele relaties en gebruikte API-clients vastleggen. Geen contactgegevens of contractinhoud exporteren voor deze inventaris.
2. Bestaande `partner_type` en sponsorrelaties behouden. Toon `legacy_classification` als herkomst; nog niet als nieuw bevestigde rol.
3. `create_campaign_bundle` schrijft momenteel een sponsorrelatie bij partnerselectie. Nieuwe operatie vereist de expliciete bijdrage, controleert dezelfde organisatie en schrijft campagne/deliverables/relatie atomair.
4. Oude functie mag na overgang geen ongekozen sponsorrelatie blijven produceren. Voorstel: versiegebonden nieuwe operatie; oude operatie blijft compatibel voor campagneaanmaak zonder partner, en weigert een nieuwe partnerkoppeling met gerichte melding ‘kies bijdrage’. Nieuwe UI en servervalidatie worden in dezelfde release getest.
5. De generieke editor, relatieregelwijzigingen en directe inserts vallen onder dezelfde guard. Een ingevoerde `partner_id` alleen is onvoldoende; onverwachte velden worden geweigerd.
6. Rapporten en sponsorportal behouden geautoriseerde historische sponsorselectie. Een nieuw bevestigde rol wordt expliciet geselecteerd; geen volledige vervanging van portaalfilters door ‘alle partners’. Nieuwe niet-sponsorrelaties worden niet als sponsorwaarde of sponsorbereik opgeteld.

Uiteindelijk vervangen van `partner_type` of herclassificatie van bestaande relaties is een afzonderlijke beoordeelde gegevenswijziging, geen F1-backfill op basis van een naam, domein of vermoedens.

## 2 Interne revisielevensloop

Voorgesteld object `publication_revisions` bevat organisatie, brontype/-ID/-revisie, taal, slug, schemaversie, canonieke publieke payload/hash, maker en tijdstip. Een ingediende payload is onveranderlijk. Toestemmings-/mediarechtenreferenties zijn intern en worden nooit meegestuurd in publieke payload.

Voorstel voor werkstatussen: `draft`, `in_review`, `changes_requested`, `approved_for_publication`, `superseded`, `withdrawn`. Redactiewijziging maakt een nieuwe conceptrevisie; oude goedkeuring verwijst uitsluitend naar de oude hash/revisie. Een nieuwe algemene contentgoedkeuring mag geen losse revisie automatisch klaarzetten. `approved_for_publication` in F1 betekent interne gereedheid, geen bewijs dat iets al op de website staat.

Een F2-publicatiepointer selecteert later één goedgekeurde revisie en bevat publicatieperiode en intrekking. Die pointer krijgt geen willekeurige JSON die de revisiecontrole passeert. Bij bronarchivering, ingetrokken benodigd doel of ontbrekende mediarechten wordt de relevante publicatie ongeldig. Alleen een nieuwe expliciete beslissing kan opnieuw vrijgeven; een replay van een oud verzoek kan dat niet.

F1 levert interne preview en contractproeven. F2 bewijst de echte publieke read-route, staging, periodieke weergave en cache-intrekking. Een preview vereist interne toegang en wordt niet via een onbeveiligde permanente link gedeeld.

## 3 Veldselectie en veilige inhoud

| Type | Toegestane publieke velden in voorstel | Altijd buiten deze payload |
| --- | --- | --- |
| Event | Publiek ID, slug, taal, titel, samenvatting, gereinigde beschrijving, begin/einde/tijdzone, gekozen publieke locatie, toegestane media met alt-tekst/credits, goedgekeurde inschrijflink. | Crew, bezoekersgegevens, slotboekingen, interne planning, budgetten, contactpersonen en bronnotities. |
| Nieuws | Publiek ID, slug, taal, titel, samenvatting, gereinigde tekst, media/alt/credits, publicatiedatum en toegestane auteursweergave. | Interne redactie, privécontact, mailconcept, reviewnotities en bewijsstukken. |
| Partner, contract voor vervolg | Publiek ID, naam, bevestigde publieke rollen, goedgekeurd logo/beschrijving/links. | E-mail, contactpersoon, contract, bedragen, interne rolonderbouwing en accountbinding. |

Allowlist per type; onbekende velden geven validatiefout in plaats van automatisch doorgeven. Gebruik geen `select *` of vrije bronserialisatie. Verplichte inhoud ontbreekt? Interne revisie kan concept blijven, maar niet als publicatiegereed gelden. Bron zonder start/eindgegevens krijgt geen verzonnen evenementdatum. Geen gelijktrekken van BESC en GameGear-organisatie-/merkcontext.

Gereinigde inhoud weigert actieve HTML/scripts, gevaarlijke URL-schema's, embedded tracking en onbedoelde privébestandslinks. Alleen toegestane publieke media of gecontroleerd afgeleide bestanden, geen kopie van een private signed URL met willekeurige looptijd. Een URL-allowlist is geen algemene serverfetchbevoegdheid.

## 4 Voorgesteld leescontract voor F2

Contractnaam `besc-publication-v1`. Voorgestelde routes voor de implementatiebespreking: `GET /api/v1/publications/events` en `GET /api/v1/publications/news`, plus detail op publieke slug/taal. **Nog niet bestaand of geactiveerd.** De site-/organisatiemapping ligt server-side; een bezoeker kiest geen intern `organization_id` of brondossier-ID om privédata op te halen.

Lijst bevat alleen op dat moment geldige publicaties, stabiel geordend met begrensde cursorpaginering. Detail geeft dezelfde veldselectie. Niet vrijgegeven, ingetrokken, buiten publicatieperiode of onbekend levert een generiek niet-beschikbaar resultaat zonder private metadata. Interne revisie-ID's, audit, account-ID's en bron-/bewijsverwijzingen staan niet in de publieke payload. Een openbare serverroute vraagt geen databasekey van de websitebrowser.

Synthetische contractvorm, niet te publiceren:

```json
{
  "schema_version": "besc-publication-v1",
  "type": "event",
  "public_id": "TESTFIXTURE-NIET-PUBLICEREN-001",
  "revision": 1,
  "slug": "testfixture-niet-publiceren",
  "locale": "nl-BE",
  "title": "TESTFIXTURE — NIET PUBLICEREN",
  "summary": "Uitsluitend contracttest.",
  "body": {"format": "sanitized_html", "value": "<p>Uitsluitend contracttest.</p>"},
  "starts_at": "2030-01-01T12:00:00Z",
  "ends_at": "2030-01-01T13:00:00Z",
  "timezone": "Europe/Brussels",
  "location_label": "TESTFIXTURE",
  "registration_url": "https://example.invalid/inschrijven",
  "media": [],
  "published_at": "2030-01-01T10:00:00Z"
}
```

Hash-/ETag-inhoud is gebaseerd op de goedgekeurde payload en schema-/revisieversie. Schemawijzigingen zijn expliciet versiegebonden; een consument krijgt geen onverwacht privéveld of nieuwe betekenis onder dezelfde versie. F1 levert fixtures voor event/nieuws plus negatieve velden/HTML/URL-/revisiegevallen; de getoonde datum is geen BESC-evenement.

## 5 Intrekking en caches

Voorstel P06 uit F0: maximaal 60 seconden van succesvolle centrale intrekking tot afwezigheid in alle door BESC beheerde publieke projecties. Dit is nog te accepteren en te meten in F2, geen reeds behaalde SLA.

- Intrekken schrijft eerst de centrale ongeldigheid. Ook lijsten, detail, feed, zoekindex, sitemap, afgeleide media en edge-/browsercache vallen onder het uiteindelijke contract.
- Een servercontrole van de actuele publicatiepointer blijft vereist bij cachevernieuwing. Een ETag/304 mag een ingetrokken versie niet opnieuw bevestigen.
- TTL en invalidatie hebben samen een aantoonbare bovengrens; offline serviceworker of CDN met langere stale-weergave is niet toegestaan onder dit voorstel. Onbekende/gedegradeerde geldigheid toont niet beschikbaar.
- Herhaalde invalidatieverzoeken zijn veilig; fouten zijn zichtbaar en leiden tot waarschuwing, geen stilzwijgende herpublicatie.
- Reeds gedownloade bestanden, schermafbeeldingen en externe kopieën vallen buiten deze technische terugroepgarantie. Externe verwijdering krijgt een afzonderlijke opvolging waar nodig.

Er wordt in F1 geen hosting gekocht, site aangemaakt, DNS omgezet, Google Sites verwijderd of botcommando geregistreerd.
