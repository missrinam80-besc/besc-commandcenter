update public.email_templates
set body_template = E'Beste,\n\n{{nieuwsbrief_inhoud}}\n\nMet vriendelijke groeten,\n{{afzender}}\n{{organisatie}}\n\nWil je geen berichten meer ontvangen? Antwoord op deze e-mail met ''uitschrijven''.',
    updated_at = now()
where is_system
  and category = 'newsletter'
  and name = 'BESC nieuwsbrief'
  and body_template like '%{{contact_naam}}%';
