begin;
-- Extend the fixed allowlist without changing the already deployed migration.
do $$
declare definitions jsonb;
begin
 definitions:=private.dossier_choice_catalog()||'[ {"key":"event_schedule_items.kind","table":"event_schedule_items","field":"kind","defaultValue":"program","values":[{"value":"program","label":"Programma"},{"value":"stream","label":"Stream"},{"value":"runbook","label":"Draaiboek"},{"value":"shift","label":"Crew / vrijwilliger"}]} ]'::jsonb;
 execute format('create or replace function private.dossier_choice_catalog() returns jsonb language sql immutable set search_path='''' as %L',format('select %L::jsonb',definitions::text));
end $$;
revoke all on function private.dossier_choice_catalog() from public,anon,authenticated;

-- Transactional table lock keeps all other writes out during trusted initial seeding.
alter table public.dossier_choice_options disable trigger guard_dossier_choice_option;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position,is_default)
select o.id,'event_schedule_items.kind',v.value,v.label,v.position,v.value='program'
from public.organizations o cross join (values
 ('program','Programma',0),('stream','Stream',1),('runbook','Draaiboek',2),('shift','Crew / vrijwilliger',3)
) as v(value,label,position) on conflict do nothing;
insert into public.dossier_choice_options(organization_id,set_key,value,label,position)
select distinct organization_id,'event_schedule_items.kind',kind,'Bestaande waarde: '||kind,1000
from public.event_schedule_items where kind is not null and kind ~ '^[a-z0-9_]{1,80}$' on conflict do nothing;
alter table public.dossier_choice_options enable trigger guard_dossier_choice_option;

-- Only the old kind enum check is replaced. Timing, status, RLS and relations stay intact.
do $$ declare constraint_name text; begin
 for constraint_name in select con.conname from pg_constraint con
 join pg_attribute a on a.attrelid=con.conrelid and a.attname='kind'
 where con.conrelid='public.event_schedule_items'::regclass and con.contype='c'
 and con.conkey=array[a.attnum] and pg_get_constraintdef(con.oid) ~ '(ANY| IN )' loop
  execute format('alter table public.event_schedule_items drop constraint %I',constraint_name);
 end loop;
end $$;
create trigger managed_choice_kind before insert or update of kind,organization_id on public.event_schedule_items
for each row execute function private.validate_dossier_choice('event_schedule_items.kind','kind');
create index if not exists managed_choice_event_schedule_items_kind_idx on public.event_schedule_items(organization_id,kind);
notify pgrst,'reload schema';
commit;
