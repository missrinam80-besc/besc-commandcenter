# Fase 8 — haalbaarheid en uitvoeringsvolgorde

> Historische notitie. Dit document bewaart het ontwerp of de controle op de genoemde datum; het is geen actuele werkvoorraad. Zie de [wiki](../README.md) en [huidige releasewerkwijze](../Release-en-acceptatie.md).

Datum: 3 augustus 2026  
Scope: social analytics en publicatie, nieuwsbrieven, boekhouding, dark mode, AI Hub en kennisbank.

## Besluit

Fase 8 wordt niet als één grote integratie gebouwd. De veilige volgorde is:

1. publieke nieuwsbriefinschrijving en uitschrijving;
2. HTML-nieuwsbrieven met beheerde templates;
3. dark mode;
4. generiek social-account-, OAuth- en synchronisatiemodel;
5. YouTube analytics als eerste officiële platformkoppeling;
6. Meta voor Facebook, Instagram en Threads;
7. Twitch voor kanaal-, stream- en planningsdata;
8. LinkedIn alleen na toegang tot Community Management;
9. TikTok alleen na productgoedkeuring en audit;
10. X alleen nadat BESC een expliciet API-budget goedkeurt;
11. volledige boekhouding uitsluitend na validatie door de boekhouder.

AI Hub en kennisbank blijven bewust inactief totdat een concrete werkstroom, eigenaar en gegevensbron zijn vastgelegd.

## Social platformen

| Platform | Publicatie | Analytics | Toegang en kosten | Besluit |
|---|---|---|---|---|
| YouTube | Video- en resourcebeheer via Data API | Sterke kanaal- en videoanalytics | OAuth 2.0, standaardquota van 10.000 eenheden per dag | Eerste pilot |
| Facebook / Instagram | Publicatie voor beheerde pagina's en professionele Instagram-accounts | Account- en media-insights | Meta-app, OAuth, passende permissies en doorgaans app review | Tweede pilot, gecombineerd Meta-traject |
| Threads | Publicatie en post-insights | Views, likes, replies, reposts, quotes en shares | Meta-app en Threads-permissies | Meenemen in Meta-traject |
| Twitch | Streamplanning en kanaaldata | Geen algemeen organisch analyticsmodel zoals YouTube; specifieke analytics-endpoints zijn beperkt tot games/extensions | OAuth 2.0 en scopes per handeling | Alleen operationele sync in eerste versie |
| LinkedIn | Organisatieposts zijn ondersteund | Pagina-, follower-, post- en videoanalytics | Community Management is een beoordeeld product met development- en standard-tier | Pas starten na bevestigde toegang |
| TikTok | Direct Post ondersteunt video en foto | Geen algemene commerciële accountanalytics via de Content Posting API | `video.publish`, gebruikerstoestemming en audit; niet-geaudite clients publiceren privé | Niet bouwen vóór audittoegang |
| X | Posts maken en eigen statistieken lezen | Publieke en eigen organische metrics; private metrics zijn 30 dagen beschikbaar | Pay-per-use; reads en writes zijn betalend | Alleen na expliciet kostenbesluit |

### Gemeenschappelijk technisch model

Voor elk platform gebruikt BESC dezelfde interne laag:

- `social_accounts`: platform, externe account-ID, eigenaar, status en scopes;
- versleutelde tokens buiten gewone applicatietabellen;
- `social_sync_runs`: start, einde, cursor, resultaat en foutmelding;
- `social_metric_snapshots`: platformmetric, genormaliseerde metric, periode, bron-ID en ophaaltijd;
- idempotente synchronisatie zodat dezelfde meting niet dubbel wordt opgeslagen;
- auditlog voor koppelen, ontkoppelen, publiceren en opnieuw proberen;
- per account een kill switch en tokenvervaldatum;
- expliciet onderscheid tussen handmatige, geïmporteerde en API-metingen.

Publicatie blijft altijd een menselijke goedkeuringsstap houden. Een scheduler mag alleen reeds goedgekeurde content verwerken.

### Dataminimalisatie en eigenaarschap

- Alleen gegevens van door BESC beheerde of expliciet gekoppelde accounts worden opgehaald.
- Geen scraping of niet-officiële API's.
- Geen followerlijsten of individuele publieksprofielen opslaan als geaggregeerde statistieken volstaan.
- Originele platform-ID, bron, meetdefinitie, periode en ophaaltijd blijven bewaard.
- Verwijdering of ontkoppeling stopt nieuwe synchronisaties; bewaartermijnen worden door BESC vastgelegd.
- Tokens worden niet in browsercode, auditlogs of exports opgenomen.

## Nieuwsbrieven

### Publieke inschrijving

Haalbaar binnen Next.js en Supabase, mits:

- een aparte publieke route zonder toegang tot de interne mailinglijst;
- expliciete, niet vooraf aangevinkte toestemming;
- opslag van toestemmingsversie, tijdstip, bron en technische bewijsgegevens;
- dubbele bevestiging via een eenmalige, gehashte token;
- rate limiting en botbescherming;
- geen melding of een adres al bestaat;
- privacyverklaring naast het formulier.

### Uitschrijven

Iedere nieuwsbrief krijgt een unieke, niet-radenbare uitschrijflink. Uitschrijven moet onmiddellijk, eenvoudig en kosteloos kunnen. De applicatie bewaart de uitschrijfstatus en verzendt nooit opnieuw naar dat lijstlid zonder nieuwe aantoonbare inschrijving.

### HTML en afbeeldingen

De bestaande Gmail-goedkeuringsflow blijft behouden. De uitbreiding krijgt:

- responsive HTML met een platte-tekstvariant;
- meerdere beheerde templates;
- afbeeldingen via publiek bereikbare, door BESC beheerde URL's;
- alt-tekst en vaste maximale afbeeldingsbreedte;
- voorbeeldweergave vóór goedkeuring;
- sanitizing van HTML;
- absolute links;
- verzending in beheersbare batches.

Gmail blijft geschikt voor de huidige beperkte doelgroep, maar is geen volwaardig bulkmailplatform. Bij structureel groter volume volgt een apart besluit over een gespecialiseerde verzenddienst.

## Volledige vzw-boekhouding

De huidige financiële module blijft operationele administratie: budgetten, kosten, inkomsten, documenten, goedkeuringen en realisatie. Voor een wettelijk boekhoudsysteem ontbreken nog gevalideerde regels rond onder meer rekeningenstelsel, openingsbalans, boekingsperiodes, onwijzigbare journaalposten, btw, afschrijvingen, afsluiting en officiële uitvoer.

Daarom wordt geen grootboek gebouwd voordat de BESC-boekhouder schriftelijk heeft bevestigd:

- welk Belgisch boekhoudregime van toepassing is;
- welke rapporten en bewaartermijnen verplicht zijn;
- of een erkend boekhoudpakket de juridische bron moet blijven;
- welke import- en exportformaten nodig zijn;
- wie boekingen mag corrigeren en periodes mag afsluiten.

Tot dat moment blijft Command Center een dossier- en goedkeuringslaag, niet de wettelijke boekhouding.

## Dark mode

Technisch laag risico en zonder externe afhankelijkheden. De uitvoering gebruikt:

- CSS design tokens voor achtergrond, tekst, randen, kaarten en statussen;
- systeemvoorkeur als standaard;
- persoonlijke keuze licht/donker/systeem op de accountpagina;
- opslag in het bestaande gebruikersprofiel;
- contrastcontrole voor BESC-rood, geel, tabellen, formulieren en meldingen;
- geen afzonderlijke componentvarianten per thema.

## Bronnen

- [YouTube Data API en quota](https://developers.google.com/youtube/v3/getting-started)
- [YouTube Analytics en Reporting APIs](https://developers.google.com/youtube/reporting)
- [Meta Instagram API-documentatie](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Meta Threads API-documentatie](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api)
- [LinkedIn Community Management](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview)
- [TikTok Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started/)
- [Twitch API-reference](https://dev.twitch.tv/docs/api/reference)
- [X API-prijzen](https://docs.x.com/x-api/getting-started/pricing)
- [X metrics](https://docs.x.com/x-api/fundamentals/metrics)
- [Belgische Gegevensbeschermingsautoriteit: direct marketing](https://dataprotectionauthority.be/burger/thema-s/marketing/mijn-rechten)
- [Europese Commissie: geldige toestemming](https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/legal-grounds-processing-data/grounds-processing/when-consent-valid_en)
- [Gmail API-quota](https://developers.google.com/workspace/gmail/api/reference/quota)

## Acceptatie voor iedere platformpilot

- BESC heeft aantoonbaar recht op het gekoppelde account;
- minimale scopes zijn gedocumenteerd en goedgekeurd;
- tokenopslag, intrekken en vernieuwen zijn getest;
- bron, meetdefinitie, periode en syncmoment zijn zichtbaar;
- mislukte synchronisatie veroorzaakt geen dubbele gegevens;
- kostenlimiet en quota-alarm zijn ingesteld;
- handmatige invoer blijft als hersteloptie beschikbaar;
- productiepublicatie vereist menselijke goedkeuring.
