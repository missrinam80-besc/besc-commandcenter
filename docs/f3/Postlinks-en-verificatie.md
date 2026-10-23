# Postlinks en verificatie

Handmatige URL-invoer wordt eerst als kandidaat opgeslagen, zonder bereik of officiële verificatie te claimen. Alleen de voor de pilot gekozen platformparser wordt gebouwd. Alle overige URL's krijgen een duidelijke niet-ondersteundstatus, geen generieke scrape-fallback.

1. Alleen HTTPS op exact toegestane hosts, zonder gebruikersnaam/wachtwoord of interne/IP-host. Platformspecifieke route en onveranderlijke content-ID valideren. Unicode-lookalikes en host-suffixtrucs weigeren.
2. Trackingparameters verwijderen volgens parsercontract; semantisch noodzakelijke content-ID eerst veilig uitlezen. Geen alle-queryparameters-strippen vóór extractie, bijvoorbeeld bij YouTube-watchlinks. Shortlinks niet willekeurig volgen; alleen expliciet ondersteunde host/route veilig afhandelen.
3. Unieke contentidentiteit per organisatie + platform + content-ID. Unieke koppeling per campagne + contentidentiteit. Dezelfde post kan bij meerdere campagnes horen zonder unieke globale reach te claimen. Eén content-ID met strijdige creatorbinding leidt tot conflict/review.
4. Bewijslast scheiden: ingestuurde URL, zichtbaarheid, accountownership, campagnegeschiktheid en metriektoegang hebben aparte status. Een bereikbare URL bewijst de overige vier niet.
5. Reviewer beoordeelt de exacte kandidaatversie. URL/creator/campagne wijzigen maakt vorige verificatie ongeldig; retries met dezelfde request-ID schrijven geen dubbele audit of telling. Andere payload met dezelfde sleutel geeft conflict.
6. Private/verwijderde/onbereikbare post geeft een expliciete status met laatst gecontroleerde tijd. Geen permanente tombstone uit één timeout afleiden. Eerdere metingen blijven historisch herkenbaar binnen toegestane bewaring; het actuele rapport toont beschikbaarheid en uitsluiting.

Voorkom SSRF: geen automatische HTTP-aanvraag naar invoer-URL, arbitrary redirect, metadatahost of ondertekende Storage-link. Gebruik een officiële adapter met begrensde requests of menselijk vastgelegd bewijs. Bronbestanden en tekst zijn onbetrouwbare gegevens, geen instructies aan agent of backend. Filetype/omvang, veilige bestandsnaam, private opslag en bronrechten apart controleren als bijlagen nodig zijn.

Een handmatig bewijs krijgt bronlabel `manual` of `export`, datum, indiener en reviewstatus; nooit `official_api`. Een official_api-label vereist een werkelijk controleerbare adapter-/run-/accountreferentie. Hash ondersteunt integriteit, niet inhoudelijke waarheid.
