do $$
declare
  org_record record;
  start_category_id uuid;
  process_category_id uuid;
  policy_category_id uuid;
begin
  for org_record in
    select distinct on (om.organization_id)
      om.organization_id,
      om.user_id as author_id
    from public.organization_members om
    where om.status = 'active'
      and om.role in ('admin','board')
    order by om.organization_id, case om.role when 'admin' then 0 else 1 end, om.joined_at
  loop
    insert into public.knowledge_categories (organization_id, name, description, color, sort_order, created_by)
    values
      (org_record.organization_id, 'Start hier', 'Basisuitleg voor nieuwe en bestaande gebruikers van het Command Center.', '#dc2626', 10, org_record.author_id),
      (org_record.organization_id, 'Processen en automatisaties', 'Overzicht van automatische workflows, menselijke controles en herstelacties.', '#f59e0b', 20, org_record.author_id),
      (org_record.organization_id, 'Werken in Command Center', 'Praktische werkwijze voor inbox, taken, projecten, events en dossiers.', '#2563eb', 30, org_record.author_id),
      (org_record.organization_id, 'Beleid en afspraken', 'Interne afspraken rond rollen, rechten, archiveren en databeheer.', '#475569', 40, org_record.author_id),
      (org_record.organization_id, 'FAQ en probleemoplossing', 'Korte antwoorden op terugkerende vragen en bekende fouten.', '#16a34a', 50, org_record.author_id)
    on conflict (organization_id, name) do update
      set description = excluded.description,
          color = excluded.color,
          sort_order = excluded.sort_order,
          updated_at = now();

    select id into start_category_id
    from public.knowledge_categories
    where organization_id = org_record.organization_id and name = 'Start hier' and deleted_at is null;

    select id into process_category_id
    from public.knowledge_categories
    where organization_id = org_record.organization_id and name = 'Processen en automatisaties' and deleted_at is null;

    select id into policy_category_id
    from public.knowledge_categories
    where organization_id = org_record.organization_id and name = 'Beleid en afspraken' and deleted_at is null;

    if not exists (
      select 1 from public.knowledge_articles
      where organization_id = org_record.organization_id
        and title = 'Start hier: werken met BESC Command Center'
        and deleted_at is null
    ) then
      insert into public.knowledge_articles (
        organization_id, category_id, title, summary, body, article_type, status,
        tags, owner_id, review_due_date, published_at, created_by
      )
      values (
        org_record.organization_id,
        start_category_id,
        'Start hier: werken met BESC Command Center',
        'Basisgids voor gebruikers: waar je start, hoe je werkt en welke modules waarvoor dienen.',
        $guide$
# Doel

BESC Command Center is de centrale werkplek voor BESC. De app vervangt monday en Notion voor de BESC-werking en bewaart alleen operationele data, metadata en links. Documenten en rechten blijven in Google Workspace.

# Dagelijkse start

1. Open **Meldingen** voor deadlines, achterstallige taken, ontbrekende notulen en dossiers die aandacht vragen.
2. Open **Mijn werk** voor je actieve taken, goedkeuringen en opvolgingen.
3. Verwerk nieuwe input vanuit **Inbox**.
4. Werk vanuit het juiste dossier: project, event, campagne, sponsor, contentitem of vergadering.

# Basisflow

Nieuwe informatie komt eerst in **Inbox**. Vanuit daar zet je iets om naar een taak, project, event, campagne, sponsor, contentitem, vergadering of kennisartikel. Zodra iets is omgezet, blijft de bron zichtbaar in historiek en werk je verder in het doelrecord.

# Taken

Een taak is een concrete actie. Gebruik taken voor werk dat iemand moet uitvoeren, opvolgen of afronden. Taken kunnen gekoppeld worden aan projecten, events, campagnes, documenten en andere dossiers.

# Projecten

Een project is een groter werkpakket met taken, documenten, budget, beslissingen en voortgang. Koppel een Google Drive-map aan het project zodra er documenten nodig zijn.

# Events en vergaderingen

Events kunnen automatisch naar Google Calendar worden gesynchroniseerd. Vergaderingen krijgen notulen, actiepunten en besluiten. Actiepunten kunnen worden omgezet naar taken.

# Goedkeuringen

Content, kosten, sponsorafspraken en documenten kunnen ter goedkeuring worden voorgelegd. De beslissing is altijd menselijk: goedkeuren, wijzigingen vragen of weigeren.

# Archiveren en verwijderen

Gebruik archiveren voor afgeronde of historische informatie die later nog nuttig kan zijn. Gebruik verwijderen alleen voor fouten, duplicaten of testdata.

# Waar staat wat?

- **Mijn werkplek**: persoonlijke werkvoorraad, inbox, kalender en goedkeuringen.
- **Planning & uitvoering**: projecten, events, campagnes en social planning.
- **Relaties & communicatie**: community, sponsors en communicatie.
- **Content & publicatie**: content, shop, nieuwsbrieven en AI Hub.
- **Organisatie**: vergaderingen, vzw-administratie, financien en kennisbank.
- **Inzichten**: rapportage en KPI.
- **Beheer**: documenten, integraties, historiek en activiteit.
$guide$,
        'guide',
        'published',
        array['handleiding','command-center','start-hier','onboarding'],
        org_record.author_id,
        current_date + 180,
        now(),
        org_record.author_id
      );
    end if;

    if not exists (
      select 1 from public.knowledge_articles
      where organization_id = org_record.organization_id
        and title = 'Processen en automatisaties in BESC Command Center'
        and deleted_at is null
    ) then
      insert into public.knowledge_articles (
        organization_id, category_id, title, summary, body, article_type, status,
        tags, owner_id, review_due_date, published_at, created_by
      )
      values (
        org_record.organization_id,
        process_category_id,
        'Processen en automatisaties in BESC Command Center',
        'Overzicht van de belangrijkste automatische processen, menselijke controles en herstelknoppen.',
        $processes$
# Principe

Automatisering ondersteunt het werk, maar verstuurt of publiceert niets kritisch zonder menselijke controle. Handmatige knoppen blijven beschikbaar als hersteloptie.

# Huidige processen

## Account en toegang

Nieuwe gebruikers kunnen aanmelden via e-mail of Discord. Toegang tot de app blijft afhankelijk van lidmaatschap en goedkeuring. Beheerrechten staan onder **Beheer**.

## Inbox naar werk

Inboxitems kunnen worden omgezet naar taken of dossiers. Niet-toegewezen monday-historiek blijft tijdelijk onder historiek of overige tot iemand beslist waar het hoort.

## Taken en actiepunten

Actiepunten uit vergaderingen kunnen worden omgezet naar taken. Taken kunnen gekoppeld worden aan bestaande projecten of andere dossiers.

## Google Drive

Projecten en events kunnen automatisch een Drive-map krijgen onder de juiste modulemap. Supabase bewaart alleen links en metadata; bestanden blijven in Google Drive.

## Google Calendar

Events en vergaderingen kunnen naar Google Calendar worden gesynchroniseerd. Bij bewaren worden gekoppelde kalenderitems automatisch bijgewerkt. Geannuleerde items kunnen ook uit de kalender worden verwijderd.

## Documenten

Notulen, eventdossiers en sponsorrapporten worden centraal getoond in het documentregister. Ontbrekende documenten worden gesignaleerd.

## Goedkeuringen

Content, kosten, sponsorafspraken en documenten kunnen ter goedkeuring worden aangeboden. De werkvoorraad toont openstaande beslissingen voor bestuur en vrijwilligers.

## Meldingen

Meldingen signaleren deadlines, achterstallige taken, sponsoropvolging, events zonder draaiboek of Calendar-koppeling, en vergaderingen zonder notulen of open actiepunten.

## E-mail

De app kan Gmail-concepten maken voor sponsoropvolging, eventcommunicatie en uitnodigingen. Verzenden blijft menselijk. Verzonden communicatie wordt bij het juiste dossier geregistreerd.

## Nieuwsbrieven

Nieuwsbriefinschrijvingen volgen double opt-in en uitschrijven. Mailinglijsten en campagnes worden vanuit de nieuwsbriefmodule beheerd.

## Rapportage

Rapportage bundelt projectvoortgang, werkdruk, KPI, financien, sponsorwaarde en exporteerbare CSV/PDF-overzichten.

# Herstelacties

Gebruik handmatige synchronisatieknoppen wanneer Drive, Calendar of Gmail tijdelijk faalt. Controleer daarna het dossier en het documentregister.
$processes$,
        'procedure',
        'published',
        array['automatisatie','processen','drive','calendar','gmail','goedkeuringen'],
        org_record.author_id,
        current_date + 180,
        now(),
        org_record.author_id
      );
    end if;

    if not exists (
      select 1 from public.knowledge_articles
      where organization_id = org_record.organization_id
        and title = 'Rollen, rechten en databeheer'
        and deleted_at is null
    ) then
      insert into public.knowledge_articles (
        organization_id, category_id, title, summary, body, article_type, status,
        tags, owner_id, review_due_date, published_at, created_by
      )
      values (
        org_record.organization_id,
        policy_category_id,
        'Rollen, rechten en databeheer',
        'Basisafspraken voor toegang, beheerrechten, archiveren, verwijderen en documentopslag.',
        $policy$
# Rollen

De eerste werkrollen zijn beheerder, bestuur, vrijwilliger en lid. Beheerders en bestuur beheren de kernmodules. Vrijwilligers krijgen toegang tot de onderdelen waarvoor ze werken.

# Toegang

Een account maken betekent niet automatisch toegang tot BESC-data. De gebruiker moet actief lid zijn van de organisatie in het Command Center.

# Documenten

Bestanden blijven in Google Drive. De app bewaart alleen links, metadata, statussen en koppelingen naar dossiers. Google Workspace blijft de bron voor documentrechten.

# Archiveren

Archiveer afgeronde of historische dossiers. Zo blijven rapportage en historiek beschikbaar zonder dat actieve lijsten vervuilen.

# Verwijderen

Verwijder alleen testdata, fouten en duplicaten. Bij twijfel: archiveer.

# Historiek

Historische monday-data blijft beschikbaar. Betekenisvolle records worden stap voor stap omgezet naar de juiste module.
$policy$,
        'policy',
        'published',
        array['rechten','rollen','databeheer','archief'],
        org_record.author_id,
        current_date + 180,
        now(),
        org_record.author_id
      );
    end if;

    if not exists (
      select 1 from public.knowledge_articles
      where organization_id = org_record.organization_id
        and title = 'Snelstart per module'
        and deleted_at is null
    ) then
      insert into public.knowledge_articles (
        organization_id, category_id, title, summary, body, article_type, status,
        tags, owner_id, review_due_date, published_at, created_by
      )
      values (
        org_record.organization_id,
        start_category_id,
        'Snelstart per module',
        'Korte wegwijzer voor waar je welk soort BESC-werk beheert.',
        $modules$
# Mijn werkplek

Gebruik **Mijn werk** voor taken die jij moet uitvoeren. Gebruik **Inbox** voor losse input die nog niet verwerkt is. Gebruik **Goedkeuringen** voor beslissingen die wachten op bestuur, finance of verantwoordelijken.

# Planning en uitvoering

Gebruik **Projecten** voor grotere trajecten. Gebruik **Events** voor activiteiten met datum, planning, draaiboek en Calendar-koppeling. Gebruik **Campagnes** voor sponsor- of marketingacties. Gebruik **Social planning** voor concrete publicaties.

# Relaties en communicatie

Gebruik **Community & vrijwilligers** voor mensen, rollen en onboarding. Gebruik **Sponsors & CRM** voor organisaties, contactmomenten en sponsorwaarde. Gebruik **Communicatie** voor Gmail-concepten, verstuurde communicatie en sjablonen.

# Content en publicatie

Gebruik **Content** voor blogs, video's, scripts en publicatievoorbereiding. Gebruik **Shop & merchandise** voor producten, assets en lanceringen. Gebruik **Nieuwsbrieven** voor mailinglijsten, inschrijvingen en goedgekeurde verzendingen.

# Organisatie

Gebruik **Vergaderingen & besluiten** voor agenda, notulen, besluiten en actiepunten. Gebruik **VZW-administratie** voor formele documenten en deadlines. Gebruik **Financien** voor budgetten, kosten, inkomsten en bewijsstukken. Gebruik **Kennisbank** voor procedures en handleidingen.

# Beheer en inzichten

Gebruik **Rapportage & KPI** voor managementoverzichten. Gebruik **Documenten & Drive** voor gekoppelde documenten. Gebruik **Integraties** voor externe koppelingen. Gebruik **Historiek**, **Archief** en **Activiteit** om terug te kijken.
$modules$,
        'guide',
        'published',
        array['snelstart','modules','navigatie','handleiding'],
        org_record.author_id,
        current_date + 180,
        now(),
        org_record.author_id
      );
    end if;
  end loop;
end $$;
