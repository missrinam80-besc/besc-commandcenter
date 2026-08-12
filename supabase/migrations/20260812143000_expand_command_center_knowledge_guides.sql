do $$
declare
  org_record record;
  work_category_id uuid;
  process_category_id uuid;
  policy_category_id uuid;
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
      and om.role in ('admin','board')
    order by om.organization_id, case om.role when 'admin' then 0 else 1 end, om.joined_at
  loop
    insert into public.knowledge_categories (organization_id, name, description, color, sort_order, created_by)
    values
      (org_record.organization_id, 'Werken in Command Center', 'Praktische werkwijze voor inbox, taken, projecten, events en dossiers.', '#2563eb', 30, org_record.author_id),
      (org_record.organization_id, 'Processen en automatisaties', 'Overzicht van automatische workflows, menselijke controles en herstelacties.', '#f59e0b', 20, org_record.author_id),
      (org_record.organization_id, 'Beleid en afspraken', 'Interne afspraken rond rollen, rechten, archiveren en databeheer.', '#475569', 40, org_record.author_id)
    on conflict (organization_id, name) do update
      set description = excluded.description,
          color = excluded.color,
          sort_order = excluded.sort_order,
          updated_at = now();

    select id into work_category_id
    from public.knowledge_categories
    where organization_id = org_record.organization_id and name = 'Werken in Command Center' and deleted_at is null;

    select id into process_category_id
    from public.knowledge_categories
    where organization_id = org_record.organization_id and name = 'Processen en automatisaties' and deleted_at is null;

    select id into policy_category_id
    from public.knowledge_categories
    where organization_id = org_record.organization_id and name = 'Beleid en afspraken' and deleted_at is null;

    insert into public.knowledge_articles (
      organization_id, category_id, title, summary, body, article_type, status,
      tags, owner_id, review_due_date, published_at, created_by
    )
    values
      (
        org_record.organization_id, work_category_id,
        'Handleiding BESC Command Center',
        'Volledige startgids voor de dagelijkse werking in het Command Center.',
        $body$
# Doel

Het BESC Command Center is de centrale operationele werkplek voor de vzw. Gebruik de app voor opvolging, dossiers, taken, rapportage en koppelingen met Google Workspace.

# Dagelijkse routine

1. Start bij **Meldingen**.
2. Werk je persoonlijke acties af via **Mijn werk**.
3. Verwerk nieuwe input via **Inbox**.
4. Open daarna het juiste dossier: project, event, campagne, sponsor, contentitem of vergadering.

# Belangrijk principe

De app bewaart operationele data, statussen, relaties en metadata. Bestanden blijven in Google Drive. Kritische acties zoals e-mail verzenden, goedkeuren en publiceren blijven menselijk gecontroleerd.

# Wanneer gebruik je wat?

- **Inbox**: losse input die nog beoordeeld moet worden.
- **Taken**: concrete acties met eigenaar en deadline.
- **Projecten**: grotere trajecten met taken, documenten en voortgang.
- **Events**: activiteiten met datum, draaiboek, communicatie en Calendar-koppeling.
- **Campagnes**: sponsor-, marketing- of activatieflows.
- **Rapportage & KPI**: voortgang, resultaten, sponsorwaarde en exports.
$body$,
        'guide', 'published',
        array['handleiding','command-center','startgids'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, work_category_id,
        'Werken met Inbox',
        'Hoe je losse input beoordeelt, verwerkt en omzet naar concrete dossiers of taken.',
        $body$
# Waarvoor dient Inbox?

Inbox is de verzamelplek voor nieuwe input: ideeën, vragen, monday-historiek, losse opvolgingen en items die nog geen vaste plek hebben.

# Verwerkingsflow

1. Open het inboxitem.
2. Controleer bron, context en prioriteit.
3. Kies een bestemming:
   - taak
   - project
   - event
   - campagne
   - content
   - sponsor/community/vergadering
4. Voeg ontbrekende context toe.
5. Zet het item om en werk verder in het nieuwe dossier.

# Regels

- Laat niets langdurig in Inbox staan.
- Gebruik **Overige/Historiek** alleen als tijdelijke parkeerplek.
- Archiveer duplicaten of testitems.
- Maak een taak als er een concrete actie nodig is.
$body$,
        'guide', 'published',
        array['inbox','intake','workflow'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, work_category_id,
        'Werken met Taken',
        'Afspraken voor taken, eigenaars, deadlines, status en dossierkoppelingen.',
        $body$
# Definitie

Een taak is een concrete actie die iemand moet uitvoeren. Taken horen niet vaag te zijn.

# Goede taak

Een goede taak heeft:

- duidelijke titel
- eigenaar
- status
- deadline als die bekend is
- koppeling naar project, event, campagne of ander dossier wanneer relevant
- korte beschrijving of checklist

# Statusgebruik

- **Nieuw**: nog niet gestart.
- **Bezig**: actief in uitvoering.
- **Wachten op input**: geblokkeerd door iemand of iets anders.
- **Review**: klaar voor controle.
- **Afgerond**: klaar.
- **Gearchiveerd**: niet meer actief, wel historisch relevant.

# Actiepunten uit vergaderingen

Zet actiepunten uit vergaderingen om naar taken wanneer ze opvolging nodig hebben.
$body$,
        'guide', 'published',
        array['taken','actiepunten','planning'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, work_category_id,
        'Projecten beheren',
        'Hoe je projecten opzet, opvolgt, koppelt aan Drive en afrondt.',
        $body$
# Wanneer is iets een project?

Gebruik een project voor werk dat meerdere stappen, documenten, mensen of deadlines bevat.

# Projectopbouw

1. Maak het project aan.
2. Voeg eigenaar, status en prioriteit toe.
3. Koppel of maak een Google Drive-map.
4. Maak taken en mijlpalen.
5. Koppel relevante events, campagnes, content, sponsors of documenten.

# Voortgang

Gebruik projecttaken en mijlpalen om voortgang zichtbaar te maken. Gebruik het managementrapport voor achterstand, risico's en werkdruk.

# Afronden

Controleer of alle taken klaar zijn, documenten gekoppeld zijn en resultaten beschikbaar zijn. Archiveer het project wanneer het niet meer actief is.
$body$,
        'guide', 'published',
        array['projecten','drive','mijlpalen'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, work_category_id,
        'Events beheren',
        'Eventflow van voorbereiding tot Calendar-sync, draaiboek en evaluatie.',
        $body$
# Eventflow

1. Maak het event aan.
2. Vul datum, locatie, eigenaar en status in.
3. Maak een Drive-map met basisstructuur.
4. Koppel Calendar wanneer datum en tijd vastliggen.
5. Voeg taken, communicatie en draaiboek toe.
6. Evalueer na afloop.

# Drive-structuur

Eventmappen krijgen standaard onderdelen zoals Planning, Communicatie, Partners, Financiën en Evaluatie.

# Calendar

Gebruik automatische sync na opslaan. Hou de handmatige knop als hersteloptie.

# Annuleren

Geannuleerde events kunnen uit Google Calendar verwijderd worden als ze niet langer zichtbaar mogen zijn.
$body$,
        'guide', 'published',
        array['events','calendar','draaiboek'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, work_category_id,
        'Campagnes beheren',
        'Werkwijze voor sponsor-, marketing- en activatiecampagnes.',
        $body$
# Doel

Campagnes bundelen acties rond één boodschap, sponsor, event of communitydoel.

# Campagne-inhoud

Leg vast:

- doel
- eigenaar
- periode
- kanalen
- deliverables
- gekoppelde sponsor of partner
- contentitems en social posts
- KPI's

# Goedkeuring

Sponsorafspraken, content en documenten kunnen ter goedkeuring worden aangeboden. Leg wijzigingen en beslissingen vast.

# Evaluatie

Na afloop koppel je resultaten aan KPI's en sponsorwaarde. Gebruik dit voor rapportage richting bestuur en partners.
$body$,
        'guide', 'published',
        array['campagnes','sponsors','deliverables','kpi'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, process_category_id,
        'Google Drive-integratie',
        'Hoe Drive-mappen en documenten gekoppeld worden zonder bestanden naar Supabase te kopiëren.',
        $body$
# Principe

Google Drive blijft de plek waar bestanden staan. Het Command Center bewaart alleen links, metadata en dossierkoppelingen.

# Projecten en events

Voor projecten en events kan de app automatisch een Drive-map aanmaken onder de juiste modulemap.

# Documentregister

Het documentregister toont gekoppelde documenten, gegenereerde notulen, eventdossiers en sponsorrapporten. Ontbrekende documenten worden gesignaleerd.

# Rechten

Bestandsrechten blijven beheerd via Google Workspace. Controleer dus Drive-rechten wanneer iemand een document niet kan openen.

# Herstel

Als automatisch aanmaken faalt, koppel dan handmatig een bestaande Drive-map of probeer de herstelknop opnieuw.
$body$,
        'procedure', 'published',
        array['google-drive','documenten','workspace'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, process_category_id,
        'Google Calendar-integratie',
        'Hoe events en vergaderingen naar Google Calendar worden gesynchroniseerd.',
        $body$
# Wat wordt gesynchroniseerd?

Events en vergaderingen kunnen gekoppeld worden aan Google Calendar. De app bewaart de Calendar-link en externe ID.

# Automatische sync

Wanneer een gekoppeld event of vergadering wordt opgeslagen, werkt de app het kalenderitem automatisch bij.

# Handmatige sync

De handmatige synchronisatieknop blijft beschikbaar als hersteloptie bij foutmeldingen of tijdelijke Google-problemen.

# Annuleren en verwijderen

Geannuleerde items kunnen zichtbaar blijven als geannuleerd, of verwijderd worden uit Google Calendar wanneer dat nodig is.

# Controle

Controleer altijd datum, starttijd, eindtijd en titel voor je een item synchroniseert.
$body$,
        'procedure', 'published',
        array['google-calendar','events','vergaderingen'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, process_category_id,
        'Gmail-concepten en goedkeuringen',
        'Hoe e-mailconcepten worden gemaakt, goedgekeurd en pas daarna verstuurd.',
        $body$
# Principe

De app mag Gmail-concepten maken, maar verzending blijft menselijk gecontroleerd.

# Flow

1. Kies dossier en e-mailsjabloon.
2. Maak een Gmail-concept.
3. Controleer onderwerp, ontvangers, tekst en variabelen.
4. Leg het concept ter goedkeuring voor.
5. Na goedkeuring kan een bevoegde gebruiker verzenden.
6. Verzonden communicatie wordt bij het dossier geregistreerd.

# Gebruikssituaties

- sponsoropvolging
- eventcommunicatie
- uitnodigingen
- nieuwsbriefgerelateerde communicatie

# Fouten

Bij ontbrekende variabelen moet het sjabloon of dossier worden aangevuld voor je opnieuw probeert.
$body$,
        'procedure', 'published',
        array['gmail','communicatie','goedkeuringen'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, process_category_id,
        'Nieuwsbrieven',
        'Werken met mailinglijsten, inschrijvingen, goedkeuring en verzending.',
        $body$
# Mailinglijsten

Gebruik mailinglijsten om doelgroepen gescheiden te houden. Controleer toestemming en status van abonnees.

# Inschrijven en uitschrijven

Publieke inschrijving gebruikt dubbele bevestiging. Uitschrijven moet altijd mogelijk blijven.

# Nieuwsbrief maken

1. Maak nieuwsbrief aan.
2. Kies mailinglijst.
3. Schrijf inhoud en onderwerp.
4. Controleer HTML-preview en tekstfallback.
5. Vraag goedkeuring.
6. Verstuur pas na goedkeuring.

# Veiligheid

Gebruik BCC of gecontroleerde verzending. Registreer Gmail IDs en verzendstatussen.
$body$,
        'guide', 'published',
        array['nieuwsbrieven','mailinglijsten','communicatie'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, work_category_id,
        'Rapportage & KPI',
        'Gebruik van KPI’s, managementrapporten, CSV/PDF-export en sponsorwaarde.',
        $body$
# Doel

Rapportage geeft bestuur en teams inzicht in voortgang, werkdruk, resultaten en risico's.

# Belangrijkste overzichten

- maand- en jaaroverzichten
- projectvoortgang
- werkdruk en achterstallige taken
- event-, campagne- en contentresultaten
- financiële realisatie tegenover budget
- sponsorwaarde en deliverables

# KPI's

KPI's moeten een bron, periode, waarde en indien mogelijk doel hebben. Gebruik definities zodat metingen vergelijkbaar blijven.

# Export

Gebruik CSV/PDF-export voor bestuur, sponsors en archief. Controleer data vóór extern delen.
$body$,
        'guide', 'published',
        array['rapportage','kpi','management','export'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, process_category_id,
        'Acceptatieproces',
        'Hoe releaseacceptatie, rooktesten en export van acceptatierapporten verlopen.',
        $body$
# Doel

Het acceptatieproces bewijst dat een release veilig genoeg is om naar productie te gaan.

# Testen

Controleer login, rollen, kernmodules, Drive, Calendar, Gmail, nieuwsbrieven, rapportage en kritieke handelingen.

# Ronde starten

Start een acceptatieronde voor de juiste omgeving. Registreer checks als geslaagd, gefaald of geblokkeerd.

# Afronden

Een release is pas klaar wanneer blokkerende checks opgelost zijn of bewust geaccepteerd worden. Exporteer het acceptatierapport voor historiek.

# Handmatige test

Sommige zaken blijven handmatig: echte loginflows, e-mailbevestiging, Discord-login en externe platformchecks.
$body$,
        'procedure', 'published',
        array['acceptatie','release','rooktest'],
        org_record.author_id, current_date + 180, now(), org_record.author_id
      ),
      (
        org_record.organization_id, policy_category_id,
        'Rollen en rechten',
        'Uitleg over systeemrollen, finance rollen, portaaltoegang en custom rolprofielen.',
        $body$
# Systeemrollen

De vaste systeemrollen zijn:

- Admin
- Bestuur
- Member
- Vrijwilliger

Deze vormen de veilige basis van de app en worden niet rechtstreeks aangepast.

# Finance rollen

Finance rollen staan los van algemene rollen:

- expense submitter
- approver
- treasurer

# Custom rolprofielen

Maak custom rolprofielen om extra rechten toe te voegen aan een gebruiker zonder systeemrollen te wijzigen. Voorbeelden: Content lead, Eventcoördinator, Sponsor lead.

# Portaalgebruikers

Portaalgebruikers hebben geen interne `/app`-toegang. Ze zien alleen hun eigen sponsor- of streamerportaal.

# Veilig beheer

Wijzig rechten stapsgewijs. Test met een tweede account en verwijder nooit je eigen admin-toegang.
$body$,
        'policy', 'published',
        array['rollen','rechten','admin','portaal'],
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
