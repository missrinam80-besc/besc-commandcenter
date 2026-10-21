-- Read-only aggregate checks of current backfill/seed invariants on BESC DEV.
-- No IDs, names, contact details, URLs, document contents or balances are returned.
begin isolation level repeatable read read only;
set local statement_timeout='20s';
with eligible as (
 select distinct m.organization_id,m.user_id from public.organization_members m
 where m.status='active' or exists(select 1 from public.portal_access p where p.organization_id=m.organization_id and p.user_id=m.user_id and p.status='active')
), expected_titles(title) as (values
 ('Richtlijnen Projecten en Campagnes'),('Richtlijnen Content en Social Posts'),
 ('Richtlijnen Events en Sponsorcommunicatie'),('Richtlijnen Shop en Merchandise'),('Richtlijnen Nieuwsbrieven')
), eligible_orgs as (
 select distinct organization_id from public.organization_members where status='active' and role in('admin','board')
), root_links as (
 select organization_id,id,'assets'::text table_name,'document_url'::text field_name,document_url url from public.assets
 union all select organization_id,id,'expenses','proof_url',proof_url from public.expenses
 union all select organization_id,id,'expenses','declaration_url',declaration_url from public.expenses
 union all select organization_id,id,'income_entries','proof_url',proof_url from public.income_entries
 union all select organization_id,id,'partners','contract_url',contract_url from public.partners
 union all select organization_id,id,'meetings','minutes_url',minutes_url from public.meetings
 union all select organization_id,id,'administrative_documents','drive_url',drive_url from public.administrative_documents
 union all select organization_id,id,'projects','drive_url',drive_url from public.projects
 union all select organization_id,id,'events','drive_url',drive_url from public.events
 union all select organization_id,id,'campaigns','drive_url',drive_url from public.campaigns
 union all select organization_id,id,'community_people','drive_url',drive_url from public.community_people
 union all select organization_id,id,'knowledge_articles','drive_url',drive_url from public.knowledge_articles
 union all select organization_id,id,'content_items','drive_url',drive_url from public.content_items
 union all select organization_id,id,'content_items','canva_url',canva_url from public.content_items
 union all select organization_id,id,'content_items','publication_url',publication_url from public.content_items
 union all select organization_id,id,'merch_launches','drive_url',drive_url from public.merch_launches
), valid_links as (
 select * from root_links where url ~ '^https?://[^[:space:]]+$' and char_length(url)<=2000
 and url !~ '^https?://drive[.]google[.]com/drive/(u/[0-9]+/)?folders/'
)
select jsonb_build_object(
 'format','besc-foundation-data-state-v1','checked_at_utc',clock_timestamp(),'read_only',current_setting('transaction_read_only'),
 'legacy_streamer_roles',(select count(*) from public.community_person_roles where role='streamer'),
 'guideline_titles_expected',(select count(*) from eligible_orgs cross join expected_titles),
 'guideline_titles_missing',(select count(*) from eligible_orgs o cross join expected_titles e where not exists(select 1 from public.knowledge_articles a where a.organization_id=o.organization_id and a.title=e.title and a.deleted_at is null)),
 'eligible_accounts_without_active_contact',(select count(*) from eligible e where not exists(select 1 from public.community_people p where p.organization_id=e.organization_id and p.account_user_id=e.user_id and p.deleted_at is null)),
 'eligible_accounts_with_deliberately_deleted_contact',(select count(*) from eligible e where exists(select 1 from public.community_people p where p.organization_id=e.organization_id and p.account_user_id=e.user_id and p.deleted_at is not null)),
 'valid_root_links',(select count(*) from valid_links),
 'root_links_without_registry_source',(select count(*) from valid_links r where not exists(select 1 from public.document_registry_sources s where s.organization_id=r.organization_id and s.table_name=r.table_name and s.record_id=r.id and s.field_name=r.field_name)),
 'finance_sources_not_restricted',(select count(*) from public.document_registry_sources s join public.document_registry d on d.organization_id=s.organization_id and d.id=s.document_id where s.table_name in('expenses','income_entries') and not d.restricted_finance),
 'ticket_server_bindings_missing',(select count(*) from (select distinct organization_id,guild_id from public.support_tickets) t where not exists(select 1 from public.discord_bot_servers s where s.organization_id=t.organization_id and s.guild_id=t.guild_id)),
 'configuration_revisions_missing',(select count(*) from public.discord_bot_servers where configuration_revision_id is null),
 'expense_proof_bucket_private',(select not public and file_size_limit=5242880 from storage.buckets where id='expense-proofs'),
 'interpretation','Current-state checks only. Missing guideline titles or contact candidates may be deliberate changes; they do not authorize a backfill or prove historical execution.'
) as foundation_data_state;
rollback;
