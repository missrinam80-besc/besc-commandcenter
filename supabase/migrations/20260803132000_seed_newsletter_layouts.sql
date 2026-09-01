insert into public.email_templates(
  organization_id,name,category,subject_template,body_template,
  newsletter_variant,is_system
)
select id,'BESC eventnieuws','newsletter',
  '{{nieuwsbrief_titel}}',
  E'Beste {{contact_naam}},\n\n{{nieuwsbrief_inhoud}}\n\nWe kijken ernaar uit je te verwelkomen.\n\nMet vriendelijke groeten,\n{{afzender}}\n{{organisatie}}',
  'event',true
from public.organizations
on conflict do nothing;

insert into public.email_templates(
  organization_id,name,category,subject_template,body_template,
  newsletter_variant,is_system
)
select id,'BESC partnerupdate','newsletter',
  '{{nieuwsbrief_titel}}',
  E'Beste {{contact_naam}},\n\n{{nieuwsbrief_inhoud}}\n\nBedankt om samen met ons de Belgische creatorcommunity te versterken.\n\nMet vriendelijke groeten,\n{{afzender}}\n{{organisatie}}',
  'partner',true
from public.organizations
on conflict do nothing;

insert into public.email_templates(
  organization_id,name,category,subject_template,body_template,
  newsletter_variant,is_system
)
select id,'BESC korte update','newsletter',
  '{{nieuwsbrief_titel}}',
  E'{{nieuwsbrief_inhoud}}\n\nGroeten,\n{{afzender}}\n{{organisatie}}',
  'compact',true
from public.organizations
on conflict do nothing;
