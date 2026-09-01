alter table public.email_templates
  add column newsletter_variant text not null default 'besc'
    check (newsletter_variant in ('besc','event','partner','compact')),
  add column default_hero_image_url text,
  add column default_hero_image_alt text;

alter table public.newsletters
  add column template_variant text not null default 'besc'
    check (template_variant in ('besc','event','partner','compact')),
  add column preheader text,
  add column hero_image_url text,
  add column hero_image_alt text,
  add column body_html text;

comment on column public.newsletters.body_html is
  'Door de server gegenereerde, gecontroleerde HTML-snapshot; geen vrij ingevoerde HTML.';
