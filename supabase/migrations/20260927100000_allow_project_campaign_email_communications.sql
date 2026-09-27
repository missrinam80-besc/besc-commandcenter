alter table public.email_communications
  drop constraint if exists email_communications_entity_type_check;
alter table public.email_communications
  add constraint email_communications_entity_type_check
  check (entity_type in ('partner','event','meeting','project','campaign'));

alter table public.email_communications
  drop constraint if exists email_communications_communication_type_check;
alter table public.email_communications
  add constraint email_communications_communication_type_check
  check (communication_type in ('sponsor_follow_up','event_communication','invitation','project_update','campaign_update'));

alter table public.email_templates
  drop constraint if exists email_templates_entity_type_check;
alter table public.email_templates
  add constraint email_templates_entity_type_check
  check (entity_type is null or entity_type in ('partner','event','meeting','project','campaign'));
