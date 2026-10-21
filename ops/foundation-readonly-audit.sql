-- Target: BESC Command Center Cloud DEV, project sjvzrsmrtcxxtmaxigtn.
-- Run in Supabase SQL Editor as an administrative read-only inspection.
-- Metadata only: no users, business rows, credentials, function source or writes.
begin isolation level repeatable read read only;
set local statement_timeout = '20s';
select jsonb_build_object(
  'format', 'besc-foundation-cloud-v1',
  'checked_at_utc', clock_timestamp(),
  'transaction_read_only', current_setting('transaction_read_only'),
  'migration_history', (select coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name) order by version), '[]'::jsonb) from supabase_migrations.schema_migrations),
  'tables', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,
    'policy_count',(select count(*) from pg_policy p where p.polrelid=c.oid),
    'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped)) order by n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'),
  'views', (select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'options',c.reloptions,'definition_md5',md5(pg_get_viewdef(c.oid,true))) order by n.nspname,c.relname),'[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('v','m')),
  'schema_usage', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'anon',has_schema_privilege('anon',n.oid,'USAGE'),'authenticated',has_schema_privilege('authenticated',n.oid,'USAGE'),'service_role',has_schema_privilege('service_role',n.oid,'USAGE'))) from pg_namespace n where n.nspname in ('public','private')),
  'functions', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
    'security_definer',p.prosecdef,'settings',p.proconfig,
    'body_md5',md5(replace(p.prosrc,chr(13),'')),
    'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'service_role_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by n.nspname,p.proname,p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'),
  'target_policies', (select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check) order by tablename,policyname)
    from pg_policies where schemaname='public' and tablename in ('governance_mandates','compliance_deadlines','administrative_documents','meetings','partners','social_accounts','social_metric_snapshots','portal_access'))
) as foundation_cloud_audit;
rollback;
