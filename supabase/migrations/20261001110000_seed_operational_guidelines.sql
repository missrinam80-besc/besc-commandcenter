do $$
declare
  org_record record;
  work_category_id uuid;
begin
  create unique index if not exists knowledge_articles_org_title_active_idx
    on public.knowledge_articles(organization_id, title)
    where deleted_at is null;

  for org_record in
    select distinct on (om.organization_id)
      om.organization_id,
      om.user_id as author_id
    from public.organization_members om
    where om.status = 'active'
      and om.role in ('admin', 'board')
    order by om.organization_id,
      case om.role when 'admin' then 0 else 1 end,
      om.joined_at
  loop
    insert into public.knowledge_categories (
      organization_id, name, description, color, sort_order, created_by
    )
    values (
      org_record.organization_id,
      'Werken in Command Center',
      'Praktische richtlijnen voor dossiers, communicatie en publicatie.',
      '#2563eb',
      30,
      org_record.author_id
    )
    on conflict (organization_id, name) do update
      set description = excluded.description,
          updated_at = now();

    select id into work_category_id
    from public.knowledge_categories
    where organization_id = org_record.organization_id
      and name = 'Werken in Command Center'
      and deleted_at is null;

    insert into public.knowledge_articles (
      organization_id, category_id, title, summary, body, article_type,
      status, tags, owner_id, review_due_date, published_at, created_by
    )
    values
      (
        org_record.organization_id, work_category_id,
        'Richtlijnen Projecten en Campagnes',
        'Werkwijze voor het aanmaken, opvolgen en afronden van projecten en campagnes.',
        $body$
# Richtlijnen Projecten en Campagnes

## Basisregel

Een project is het bredere initiatief of de samenwerking. Een campagne is een afgebakende communicatie- of activatieperiode binnen een project. Koppel projecten, campagnes, events, sponsors, content en taken rechtstreeks aan elkaar.

## Project aanmaken

Vul titel, status, prioriteit, eigenaar, start- en einddatum, beschrijving, doel en relevante relaties in. Gebruik bij voorkeur de naamgeving `[Werknaam] – [doel of samenwerking] – [jaar]`.

Workflow: **Idee → Gepland → Actief → Geblokkeerd of Actief → Afgerond**.

## Campagne aanmaken

Vul titel, campagnetype, status, prioriteit, gekoppeld project, sponsor of partner, start- en einddatum, doel, doelgroep, kanalen, verantwoordelijke, deliverables en evaluatie in. Gebruik de bestaande types Social campagne, Partnercampagne, Sponsoractivatie, Giveaway, Crowdfunding, Eventpromo, Streamactivatie of Blogcampagne.

## Briefing

Beschrijf doel, doelgroep, kernboodschap, kanalen, benodigde assets, goedkeurder en planning. Bewaar de definitieve briefing in het campagnedossier.

## Taken en evaluatie

Een deliverable is het beloofde resultaat; een taak is de concrete actie om dat resultaat te maken. Sluit af met uitgevoerde acties, resultaten, feedback, leerpunten en vervolgacties.

Workflow voor externe communicatie: **Concept → Interne controle → Goedkeuring → Publicatie → Evaluatie**.
        $body$,
        'guide', 'published',
        array['projecten','campagnes','briefing','workflow'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, work_category_id,
        'Richtlijnen Content en Social Posts',
        'Werkwijze voor contentbriefings, kanaalvarianten, Canva-assets, goedkeuring en evaluatie.',
        $body$
# Richtlijnen Content en Social Posts

## Basisinformatie

Kies het juiste contenttype: Idee, Blog, Social post, Short/Reel, YouTube-video, Livestream, Podcast, Tutorial, Review, Nieuwsbrief, Communitypost, Partnerpost of Eventpromo. Vul titel, briefing, contenttype, status, prioriteit, project of campagne, hoofdkanaal, publicatiemoment en goedkeuringsstatus in.

Gebruik de statusworkflow: **Idee → Research → Concept → Productie → Review → Goedgekeurd → Gepland → Gepubliceerd**.

## Social briefing

Beschrijf doel, doelgroep, kernboodschap, call-to-action, kanaal, timing, asset en goedkeurder. Maak per kanaal een passende variant; kopieer niet automatisch dezelfde tekst naar alle platformen.

## Canva en controle

Canva blijft extern. Registreer de juiste Canva- of Drive-link, versie en datum. Controleer feiten, namen, data, links, sponsorvermeldingen, beeldrechten, spelling, call-to-action en publicatiemoment vóór goedkeuring.

## Publicatie en evaluatie

Publiceer pas na geregistreerde goedkeuring. Voeg na publicatie de publicatielink, datum, bereik of andere beschikbare resultaten en vervolgacties toe.
        $body$,
        'guide', 'published',
        array['content','social','canva','publicatie'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, work_category_id,
        'Richtlijnen Events en Sponsorcommunicatie',
        'Werkwijze voor eventdossiers, Google Calendar, Drive, sponsorafspraken en Gmail-opvolging.',
        $body$
# Richtlijnen Events en Sponsorcommunicatie

## Eventdossier

Vul naam, type, status, start- en eindmoment, locatie of online-aanduiding, verantwoordelijke, verwachte deelnemers, project, doel, beschrijving en prioriteit in.

Workflow: **Idee → Planning → Bevestigd → Productie → Live → Nazorg → Afgerond**. Bij annulering blijft de historiek bewaard en wordt duidelijk vastgelegd wat met de Calendar-afspraak gebeurt.

Gebruik de Drive-mapstructuur **Planning / Communicatie / Partners / Financiën / Evaluatie**. Synchroniseer pas naar Calendar wanneer naam, start en einde definitief zijn en controleer daarna datum, tijdzone, locatie en dubbele afspraken.

## Sponsorafspraken

Registreer sponsor, contactpersoon, gekoppeld project/event/campagne, tegenprestatie, bedrag of waarde, looptijd, verplichte vermeldingen, deadlines en bewijsstukken. Maak concrete taken aan.

## Sponsorcommunicatie

Gebruik: **Voorbereiden → Gmail-concept → Interne controle → Goedkeuring → Verzenden → Opvolgen**. Controleer ontvangers, onderwerp, sponsornaam, vraag, deadline, links, communicatiesoort en opvolgdatum. Verzend nooit een testmail als echte communicatie.

Rond af met opkomst, resultaten, uitgevoerde sponsorverplichtingen, feedback, financiële afronding, publicatielinks en vervolgacties.
        $body$,
        'guide', 'published',
        array['events','sponsors','google-calendar','gmail'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, work_category_id,
        'Richtlijnen Shop en Merchandise',
        'Werkwijze voor producten, merchandise-lanceringen, assets, verkoopcontrole en evaluatie.',
        $body$
# Richtlijnen Shop en Merchandise

## Product en lancering

Een product is één verkoopbaar item. Een lancering is de planning en communicatie rond één of meerdere producten. Koppel producten aan de juiste lancering, campagne en het juiste project.

## Product

Vul productnaam, productfamilie, type, status, prijs, stijl, leverancier, producent, project, campagne, platformen, beschrijving en Canva-, Drive-, preview- of shoplink in. Maak onderscheid tussen Stream Graphics Shop en fysieke merchandise.

Productworkflow: **Idee → Ontwerp → Klaar → Gepubliceerd**.

## Lancering

Vul titel, collectie, status, lanceringsdatum, timing, project, campagne, partner of producent, beschrijving en Drive-map in.

Lanceringworkflow: **Idee → Planning → Productie → Ingepland → Live → Afgerond**.

## Controle

Controleer prijs, voorraad of levering, shoplink, afbeeldingen, beschrijving, voorwaarden, merkrichtlijnen, assets en goedkeuring. Koppel communicatie, inkomsten, kosten en bewijsstukken aan het juiste dossier. Evalueer verkochte aantallen, inkomsten, kosten, feedback en vervolgproductie.
        $body$,
        'guide', 'published',
        array['shop','merchandise','producten','lancering'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, work_category_id,
        'Richtlijnen Nieuwsbrieven',
        'Werkwijze voor mailinglijsten, toestemming, nieuwsbriefopmaak, Gmail-goedkeuring en verzending.',
        $body$
# Richtlijnen Nieuwsbrieven

## Mailinglijsten en toestemming

Geef elke lijst een duidelijke naam, status, beschrijving en eventueel publieke URL-code. Gebruik aparte lijsten voor verschillende doelgroepen. Registreer per ontvanger e-mailadres, naam, status, bron en toestemmingsgrondslag.

Publieke inschrijving gebruikt dubbele bevestiging: **Inschrijving → Bevestigingsmail → Bevestiging → Actief**. Een uitgeschreven of onbestelbaar adres wordt niet opnieuw gebruikt zonder nieuwe aantoonbare inschrijving.

## Nieuwsbrief

Vul mailinglijst, interne titel, onderwerpregel, preheader, opmaakvariant, afbeelding met alt-tekst, tekst en links in. Beschikbare varianten zijn BESC-nieuws, Eventuitnodiging, Partnerupdate en Korte update.

Controleer mobiel gebruik, links, afbeeldingen, tekst, afzender, doelgroep, uitschrijfmogelijkheid en partnervermeldingen.

## Verzending

Workflow: **Concept → Controle → Gmail-concept → Goedkeuring → Verzenden → Historiek**. Nieuwsbrieven worden in BCC verzonden. Een tweede bevoegde persoon keurt goed; de opsteller keurt niet de eigen nieuwsbrief goed.

Registreer na verzending datum, lijst, aantal ontvangers, bounces, reacties en opvolgacties.
        $body$,
        'guide', 'published',
        array['nieuwsbrieven','mailinglijsten','toestemming','gmail'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      )
    on conflict (organization_id, title) where deleted_at is null do update
      set category_id = excluded.category_id,
          summary = excluded.summary,
          body = excluded.body,
          article_type = excluded.article_type,
          status = excluded.status,
          tags = excluded.tags,
          owner_id = excluded.owner_id,
          review_due_date = excluded.review_due_date,
          published_at = coalesce(public.knowledge_articles.published_at, excluded.published_at),
          updated_at = now();
  end loop;
end $$;
