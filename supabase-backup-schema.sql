


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."entity_kind" AS ENUM (
    'task',
    'project'
);


ALTER TYPE "public"."entity_kind" OWNER TO "postgres";


CREATE TYPE "public"."inbox_status" AS ENUM (
    'new',
    'reviewing',
    'waiting',
    'processed',
    'rejected',
    'archived'
);


ALTER TYPE "public"."inbox_status" OWNER TO "postgres";


CREATE TYPE "public"."member_role" AS ENUM (
    'admin',
    'board',
    'member',
    'volunteer'
);


ALTER TYPE "public"."member_role" OWNER TO "postgres";


CREATE TYPE "public"."member_status" AS ENUM (
    'pending',
    'active',
    'suspended'
);


ALTER TYPE "public"."member_status" OWNER TO "postgres";


CREATE TYPE "public"."priority_level" AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);


ALTER TYPE "public"."priority_level" OWNER TO "postgres";


CREATE TYPE "public"."project_status" AS ENUM (
    'idea',
    'planned',
    'active',
    'blocked',
    'done',
    'archived'
);


ALTER TYPE "public"."project_status" OWNER TO "postgres";


CREATE TYPE "public"."task_status" AS ENUM (
    'todo',
    'doing',
    'waiting',
    'review',
    'done',
    'cancelled'
);


ALTER TYPE "public"."task_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_manage_finance"("org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select (select auth.uid()) is not null and exists(select 1 from public.organization_members m where m.organization_id=org_id and m.user_id=(select auth.uid()) and m.status='active' and (m.role in('admin','board') or m.finance_role in('approver','treasurer')))
$$;


ALTER FUNCTION "private"."can_manage_finance"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."confirm_newsletter_subscription"("p_token_hash" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare request public.newsletter_subscription_requests; list_owner uuid; subscriber_id uuid;
begin
  select * into request from public.newsletter_subscription_requests
  where token_hash = p_token_hash and confirmed_at is null and expires_at > now() for update;
  if request.id is null then return false; end if;
  select created_by into list_owner from public.mailing_lists
  where id = request.mailing_list_id and organization_id = request.organization_id
    and public_signup_enabled and status = 'active';
  if list_owner is null then return false; end if;
  select id into subscriber_id from public.mailing_subscribers
  where mailing_list_id = request.mailing_list_id and lower(email) = lower(request.email);
  if subscriber_id is null then
    insert into public.mailing_subscribers (
      organization_id, mailing_list_id, email, display_name, status, source,
      consent_basis, consent_at, consent_version, consent_source, confirmed_at, created_by
    ) values (
      request.organization_id, request.mailing_list_id, request.email, request.display_name,
      'subscribed', 'form', 'consent', now(), request.consent_version, 'public_double_opt_in', now(), list_owner
    );
  else
    update public.mailing_subscribers
    set display_name = coalesce(request.display_name, display_name), status = 'subscribed',
      source = 'form', consent_basis = 'consent', consent_at = now(),
      consent_version = request.consent_version, consent_source = 'public_double_opt_in',
      confirmed_at = now(), unsubscribed_at = null, updated_at = now()
    where id = subscriber_id;
  end if;
  update public.newsletter_subscription_requests set confirmed_at = now() where id = request.id;
  return true;
end $$;


ALTER FUNCTION "private"."confirm_newsletter_subscription"("p_token_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."confirm_newsletter_unsubscription"("p_token_hash" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare request private.newsletter_unsubscribe_requests;
begin
  select * into request from private.newsletter_unsubscribe_requests
  where token_hash=p_token_hash and confirmed_at is null and expires_at>now() for update;
  if request.id is null then return false; end if;
  update public.mailing_subscribers set status='unsubscribed',unsubscribed_at=now(),updated_at=now()
  where id=request.subscriber_id and organization_id=request.organization_id and mailing_list_id=request.mailing_list_id;
  update private.newsletter_unsubscribe_requests set confirmed_at=now() where id=request.id;
  return true;
end $$;


ALTER FUNCTION "private"."confirm_newsletter_unsubscription"("p_token_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_active_member"("org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select (select auth.uid()) is not null and exists(select 1 from public.organization_members m where m.organization_id=org_id and m.user_id=(select auth.uid()) and m.status='active')
$$;


ALTER FUNCTION "private"."is_active_member"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_org_manager"("org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select (select auth.uid()) is not null and exists(select 1 from public.organization_members m where m.organization_id=org_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('admin','board'))
$$;


ALTER FUNCTION "private"."is_org_manager"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."log_financial_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.financial_audit_log(organization_id,entity_type,entity_id,action,previous_status,new_status,actor_id,snapshot)
  values(new.organization_id,case tg_table_name when 'budget_envelopes' then 'budget' when 'expenses' then 'expense' else 'income' end,new.id,case when tg_op='INSERT' then 'created' when old.status is distinct from new.status then 'status_changed' else 'updated' end,case when tg_op='UPDATE' then old.status end,new.status,(select auth.uid()),to_jsonb(new)-'deleted_at');
  return new;
end $$;


ALTER FUNCTION "private"."log_financial_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."log_organization_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  before_data jsonb;
  after_data jsonb;
  record_data jsonb;
  org_id uuid;
  record_id uuid;
  audit_action text;
  fields text[] := '{}';
begin
  before_data := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  after_data := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  record_data := case when tg_op = 'DELETE' then before_data else after_data end;
  org_id := nullif(record_data ->> 'organization_id', '')::uuid;
  record_id := coalesce(
    nullif(record_data ->> 'id', '')::uuid,
    nullif(record_data ->> 'user_id', '')::uuid
  );

  if org_id is null or record_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    audit_action := 'created';
  elsif tg_op = 'DELETE' then
    audit_action := 'deleted';
  elsif before_data ->> 'deleted_at' is null and after_data ->> 'deleted_at' is not null then
    audit_action := 'archived';
  else
    audit_action := 'updated';
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(change.key order by change.key), '{}')
    into fields
    from jsonb_each(after_data) as change
    where change.value is distinct from before_data -> change.key
      and change.key not in ('updated_at', 'deleted_at');
  end if;

  insert into public.audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    actor_id,
    entity_label,
    changed_fields,
    previous_status,
    new_status,
    metadata
  )
  values (
    org_id,
    tg_table_name,
    record_id,
    audit_action,
    (select auth.uid()),
    coalesce(
      nullif(record_data ->> 'title', ''),
      nullif(record_data ->> 'name', ''),
      nullif(record_data ->> 'display_name', ''),
      nullif(record_data ->> 'legal_name', ''),
      nullif(record_data ->> 'email', '')
    ),
    fields,
    before_data ->> 'status',
    after_data ->> 'status',
    jsonb_build_object('source_table', tg_table_name)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."log_organization_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."portal_sponsor_dashboard"("p_access_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare a public.portal_access; result jsonb;
begin
  select * into a from public.portal_access where id=p_access_id and user_id=(select auth.uid()) and access_type='sponsor' and status='active';
  if a.id is null then raise exception 'portal_access_denied'; end if;
  select jsonb_build_object(
    'access_id',a.id,
    'partner',(select to_jsonb(p) from (select id,name,status,collaboration_type from public.partners where id=a.partner_id and deleted_at is null) p),
    'campaigns',coalesce((select jsonb_agg(to_jsonb(c) order by c.start_date desc nulls last) from (select id,title,status,start_date,end_date,value,impressions,clicks,results_summary from public.campaigns where organization_id=a.organization_id and partner_id=a.partner_id and deleted_at is null and status not in('archived','cancelled')) c),'[]'::jsonb),
    'deliverables',coalesce((select jsonb_agg(to_jsonb(d) order by d.due_date nulls last) from (select d.id,d.campaign_id,d.title,d.status,d.due_date,d.approval_status from public.campaign_deliverables d join public.campaigns c on c.id=d.campaign_id where d.organization_id=a.organization_id and c.partner_id=a.partner_id) d),'[]'::jsonb),
    'kpis',coalesce((select jsonb_agg(to_jsonb(k) order by k.period_end desc nulls last) from (select id,name,metric,value,target,unit,period_start,period_end,source,collection_method,metric_definition,campaign_id from public.kpi_records where organization_id=a.organization_id and deleted_at is null and (partner_id=a.partner_id or campaign_id in(select id from public.campaigns where partner_id=a.partner_id))) k),'[]'::jsonb)
  ) into result;
  return result;
end $$;


ALTER FUNCTION "private"."portal_sponsor_dashboard"("p_access_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."portal_streamer_dashboard"("p_access_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  a public.portal_access;
  result jsonb;
begin
  select * into a
  from public.portal_access
  where id = p_access_id
    and user_id = (select auth.uid())
    and access_type = 'streamer'
    and status = 'active';

  if a.id is null then
    raise exception 'portal_access_denied';
  end if;

  select jsonb_build_object(
    'access_id', a.id,
    'person', (
      select to_jsonb(p)
      from (
        select id, display_name, handle, status, platforms, streamteam_level, onboarding_status
        from public.community_people
        where id = a.community_person_id and deleted_at is null
      ) p
    ),
    'assignments', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.starts_at desc nulls last)
      from (
        select ca.id, ca.role_name, ca.status, ca.starts_at, ca.notes,
          p.id project_id, p.title project_title, e.id event_id, e.title event_title
        from public.community_assignments ca
        left join public.projects p on p.id = ca.project_id
        left join public.events e on e.id = ca.event_id
        where ca.organization_id = a.organization_id
          and ca.person_id = a.community_person_id
          and ca.status <> 'cancelled'
      ) x
    ), '[]'::jsonb),
    'deliverables', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.due_date nulls last)
      from (
        select cd.id, cd.title, cd.status, cd.approval_status, cd.due_date, cd.notes,
          c.id campaign_id, c.title campaign_title
        from public.campaign_deliverables cd
        join public.campaigns c on c.id = cd.campaign_id
        where cd.organization_id = a.organization_id
          and cd.community_person_id = a.community_person_id
          and cd.status <> 'cancelled'
          and c.deleted_at is null
      ) d
    ), '[]'::jsonb),
    'development', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.completed, o.due_date nulls last, o.created_at)
      from (
        select id, title, item_type, completed, completed_at, due_date, notes, created_at
        from public.community_onboarding_items
        where organization_id = a.organization_id
          and person_id = a.community_person_id
      ) o
    ), '[]'::jsonb),
    'kpis', coalesce((
      select jsonb_agg(to_jsonb(k) order by k.period_end desc nulls last)
      from (
        select id, name, metric, value, target, unit, period_start, period_end,
          source, collection_method, metric_definition, project_id, campaign_id, event_id
        from public.kpi_records
        where organization_id = a.organization_id
          and community_person_id = a.community_person_id
          and deleted_at is null
      ) k
    ), '[]'::jsonb)
  ) into result;

  return result;
end $$;


ALTER FUNCTION "private"."portal_streamer_dashboard"("p_access_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."request_newsletter_subscription"("p_list_slug" "text", "p_email" "text", "p_display_name" "text", "p_token_hash" "text", "p_ip_hash" "text", "p_consent_version" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare target public.mailing_lists;
begin
  select * into target from public.mailing_lists
  where lower(public_slug) = lower(trim(p_list_slug)) and public_signup_enabled and status = 'active';
  if target.id is null
    or lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(trim(p_token_hash)) < 32 or length(trim(p_ip_hash)) < 32
    or length(trim(p_consent_version)) < 2 then return false;
  end if;
  if (select count(*) from public.newsletter_subscription_requests
      where created_at > now() - interval '1 hour'
        and (lower(email) = lower(trim(p_email)) or ip_hash = p_ip_hash)) >= 5 then return false;
  end if;
  insert into public.newsletter_subscription_requests (
    organization_id, mailing_list_id, email, display_name, token_hash, ip_hash, consent_version, expires_at
  ) values (
    target.organization_id, target.id, lower(trim(p_email)), nullif(trim(p_display_name), ''),
    p_token_hash, p_ip_hash, p_consent_version, now() + interval '24 hours'
  );
  return true;
end $_$;


ALTER FUNCTION "private"."request_newsletter_subscription"("p_list_slug" "text", "p_email" "text", "p_display_name" "text", "p_token_hash" "text", "p_ip_hash" "text", "p_consent_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."request_newsletter_unsubscription"("p_list_slug" "text", "p_email" "text", "p_token_hash" "text", "p_ip_hash" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare target record;
begin
  select s.id subscriber_id,s.organization_id,s.mailing_list_id into target
  from public.mailing_subscribers s join public.mailing_lists l on l.id=s.mailing_list_id
  where lower(l.public_slug)=lower(trim(p_list_slug)) and l.public_signup_enabled
    and lower(s.email)=lower(trim(p_email)) and s.status='subscribed';
  if target.subscriber_id is null or length(trim(p_token_hash))<32 or length(trim(p_ip_hash))<32 then return false; end if;
  if (select count(*) from private.newsletter_unsubscribe_requests
      where created_at>now()-interval '1 hour'
        and (subscriber_id=target.subscriber_id or ip_hash=p_ip_hash))>=5 then return false; end if;
  insert into private.newsletter_unsubscribe_requests(organization_id,mailing_list_id,subscriber_id,token_hash,ip_hash,expires_at)
  values(target.organization_id,target.mailing_list_id,target.subscriber_id,p_token_hash,p_ip_hash,now()+interval '24 hours');
  return true;
end $$;


ALTER FUNCTION "private"."request_newsletter_unsubscription"("p_list_slug" "text", "p_email" "text", "p_token_hash" "text", "p_ip_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_newsletter_subscription"("p_token_hash" "text") RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.confirm_newsletter_subscription(p_token_hash)
$$;


ALTER FUNCTION "public"."confirm_newsletter_subscription"("p_token_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_newsletter_unsubscription"("p_token_hash" "text") RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
 select private.confirm_newsletter_unsubscription(p_token_hash)
$$;


ALTER FUNCTION "public"."confirm_newsletter_unsubscription"("p_token_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_legacy_event"("p_record_id" "uuid", "p_title" "text", "p_description" "text" DEFAULT NULL::"text", "p_priority" "public"."priority_level" DEFAULT 'normal'::"public"."priority_level", "p_project_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$ declare legacy public.legacy_records%rowtype;source_link public.migration_source_links%rowtype;new_id uuid;begin select * into legacy from public.legacy_records where id=p_record_id and deleted_at is null for update;if not found or not private.is_org_manager(legacy.organization_id) or legacy.converted_target_id is not null then raise exception 'record unavailable';end if;if p_project_id is not null and not exists(select 1 from public.projects where id=p_project_id and organization_id=legacy.organization_id and deleted_at is null)then raise exception 'project not found';end if;insert into public.events(organization_id,project_id,title,description,priority,owner_id,created_by)values(legacy.organization_id,p_project_id,trim(p_title),nullif(trim(p_description),''),p_priority,(select auth.uid()),(select auth.uid()))returning id into new_id;select * into source_link from public.migration_source_links where target_table='legacy_records' and target_id=legacy.id limit 1;if source_link.id is not null then insert into public.migration_source_links(organization_id,source_system,source_workspace,source_board_id,source_item_id,target_table,target_id,source_url,source_payload,imported_by)values(legacy.organization_id,source_link.source_system,source_link.source_workspace,source_link.source_board_id,source_link.source_item_id,'events',new_id,source_link.source_url,source_link.source_payload,(select auth.uid()));end if;update public.legacy_records set converted_target_table='events',converted_target_id=new_id,converted_at=now(),lifecycle='completed',updated_at=now() where id=legacy.id;return new_id;end;$$;


ALTER FUNCTION "public"."convert_legacy_event"("p_record_id" "uuid", "p_title" "text", "p_description" "text", "p_priority" "public"."priority_level", "p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_legacy_operational"("p_record_id" "uuid", "p_target_table" "text", "p_title" "text", "p_description" "text" DEFAULT NULL::"text", "p_priority" "public"."priority_level" DEFAULT 'normal'::"public"."priority_level", "p_project_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare legacy public.legacy_records%rowtype; source_link public.migration_source_links%rowtype; new_id uuid;
begin
  select * into legacy from public.legacy_records where id=p_record_id and deleted_at is null for update;
  if not found then raise exception 'historical record not found'; end if;
  if not private.is_org_manager(legacy.organization_id) then raise exception 'not authorized'; end if;
  if legacy.converted_target_id is not null then raise exception 'historical record already converted'; end if;
  if length(trim(p_title))<3 then raise exception 'title is too short'; end if;
  if p_project_id is not null and not exists(select 1 from public.projects where id=p_project_id and organization_id=legacy.organization_id and deleted_at is null) then raise exception 'project not found'; end if;
  if p_target_table='partners' then insert into public.partners(organization_id,name,notes,priority,owner_id,created_by) values(legacy.organization_id,trim(p_title),nullif(trim(p_description),''),p_priority,(select auth.uid()),(select auth.uid())) returning id into new_id;
  elsif p_target_table='campaigns' then insert into public.campaigns(organization_id,project_id,title,notes,priority,owner_id,created_by) values(legacy.organization_id,p_project_id,trim(p_title),nullif(trim(p_description),''),p_priority,(select auth.uid()),(select auth.uid())) returning id into new_id;
  elsif p_target_table='community_people' then insert into public.community_people(organization_id,display_name,notes,owner_id,created_by) values(legacy.organization_id,trim(p_title),nullif(trim(p_description),''),(select auth.uid()),(select auth.uid())) returning id into new_id;
  elsif p_target_table='social_posts' then insert into public.social_posts(organization_id,title,copy,owner_id,created_by) values(legacy.organization_id,trim(p_title),nullif(trim(p_description),''),(select auth.uid()),(select auth.uid())) returning id into new_id;
  else raise exception 'unsupported target table'; end if;
  select * into source_link from public.migration_source_links where target_table='legacy_records' and target_id=legacy.id order by imported_at desc limit 1;
  if source_link.id is not null then insert into public.migration_source_links(organization_id,source_system,source_workspace,source_board_id,source_item_id,target_table,target_id,source_url,source_payload,imported_by) values(legacy.organization_id,source_link.source_system,source_link.source_workspace,source_link.source_board_id,source_link.source_item_id,p_target_table,new_id,source_link.source_url,source_link.source_payload,(select auth.uid())); end if;
  update public.legacy_records set converted_target_table=p_target_table,converted_target_id=new_id,converted_at=now(),lifecycle='completed',updated_at=now() where id=legacy.id;
  return new_id;
end; $$;


ALTER FUNCTION "public"."convert_legacy_operational"("p_record_id" "uuid", "p_target_table" "text", "p_title" "text", "p_description" "text", "p_priority" "public"."priority_level", "p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_legacy_record"("p_record_id" "uuid", "p_target_table" "text", "p_title" "text", "p_description" "text" DEFAULT NULL::"text", "p_priority" "public"."priority_level" DEFAULT 'normal'::"public"."priority_level", "p_project_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare legacy public.legacy_records%rowtype; source_link public.migration_source_links%rowtype; new_id uuid;
begin
select * into legacy from public.legacy_records where id=p_record_id and deleted_at is null for update;
if not found then raise exception 'historical record not found'; end if;
if not private.is_org_manager(legacy.organization_id) then raise exception 'not authorized'; end if;
if legacy.converted_target_id is not null then raise exception 'historical record already converted'; end if;
if length(trim(p_title)) < 3 then raise exception 'title is too short'; end if;
if p_project_id is not null and not exists (select 1 from public.projects where id=p_project_id and organization_id=legacy.organization_id and deleted_at is null) then raise exception 'project not found'; end if;
if p_target_table='inbox_items' then insert into public.inbox_items (organization_id,title,description,source,priority,created_by) values (legacy.organization_id,trim(p_title),nullif(trim(p_description),''),'monday',p_priority,(select auth.uid())) returning id into new_id;
elsif p_target_table='tasks' then insert into public.tasks (organization_id,project_id,title,description,priority,created_by) values (legacy.organization_id,p_project_id,trim(p_title),nullif(trim(p_description),''),p_priority,(select auth.uid())) returning id into new_id;
elsif p_target_table='projects' then insert into public.projects (organization_id,title,description,status,priority,owner_id,created_by) values (legacy.organization_id,trim(p_title),nullif(trim(p_description),''),'planned',p_priority,(select auth.uid()),(select auth.uid())) returning id into new_id;
elsif p_target_table='content_items' then insert into public.content_items (organization_id,project_id,title,description,content_type,status,priority,owner_id,created_by) values (legacy.organization_id,p_project_id,trim(p_title),nullif(trim(p_description),''),'idea','idea',p_priority,(select auth.uid()),(select auth.uid())) returning id into new_id;
else raise exception 'unsupported target table'; end if;
select * into source_link from public.migration_source_links where target_table='legacy_records' and target_id=legacy.id order by imported_at desc limit 1;
if source_link.id is not null then insert into public.migration_source_links (organization_id,source_system,source_workspace,source_board_id,source_item_id,target_table,target_id,source_url,source_payload,imported_by) values (legacy.organization_id,source_link.source_system,source_link.source_workspace,source_link.source_board_id,source_link.source_item_id,p_target_table,new_id,source_link.source_url,source_link.source_payload,(select auth.uid())); end if;
update public.legacy_records set converted_target_table=p_target_table,converted_target_id=new_id,converted_at=now(),lifecycle='completed',updated_at=now() where id=legacy.id;
return new_id; end; $$;


ALTER FUNCTION "public"."convert_legacy_record"("p_record_id" "uuid", "p_target_table" "text", "p_title" "text", "p_description" "text", "p_priority" "public"."priority_level", "p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_meeting_action_to_task"("action_id" "uuid", "task_priority" "public"."priority_level" DEFAULT 'normal'::"public"."priority_level", "task_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "task_project_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare action_row public.meeting_action_items%rowtype; new_task_id uuid;
begin
  select * into action_row from public.meeting_action_items where id=action_id for update;
  if action_row.id is null or not private.is_active_member(action_row.organization_id) then raise exception 'action_not_found'; end if;
  if action_row.task_id is not null then return action_row.task_id; end if;
  if task_project_id is not null and not exists(select 1 from public.projects p where p.id=task_project_id and p.organization_id=action_row.organization_id and p.deleted_at is null) then raise exception 'invalid_project'; end if;
  insert into public.tasks(organization_id,project_id,title,description,status,priority,due_at,created_by)
  values(action_row.organization_id,task_project_id,action_row.title,concat('Actiepunt uit vergadering. Verantwoordelijke: ',coalesce(action_row.assignee_text,'nog niet toegewezen')),'todo',task_priority,task_due_at,(select auth.uid())) returning id into new_task_id;
  update public.meeting_action_items set task_id=new_task_id,updated_at=now() where id=action_row.id;
  return new_task_id;
end $$;


ALTER FUNCTION "public"."convert_meeting_action_to_task"("action_id" "uuid", "task_priority" "public"."priority_level", "task_due_at" timestamp with time zone, "task_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_my_notifications"("p_now" timestamp with time zone DEFAULT "now"()) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  current_user_id uuid := (select auth.uid());
  local_today date := (p_now at time zone 'Europe/Brussels')::date;
  inserted_count integer := 0; affected integer := 0; daily_count integer := 0; weekly_count integer := 0;
  membership_row public.organization_members%rowtype;
  preferences_row public.notification_preferences%rowtype;
begin
  if current_user_id is null then return 0; end if;
  for membership_row in select * from public.organization_members where user_id=current_user_id and status='active'
  loop
    insert into public.notification_preferences(organization_id,user_id)
    values(membership_row.organization_id,current_user_id) on conflict(organization_id,user_id) do nothing;
    select * into preferences_row from public.notification_preferences
    where organization_id=membership_row.organization_id and user_id=current_user_id;

    if preferences_row.deadline_notifications then
      with candidates as (
        select 'task'::text source_type,t.id,t.title,(t.due_at at time zone 'Europe/Brussels')::date due_date,
          '/app/taken/'||t.id::text href,'task'::public.entity_kind entity_type
        from public.tasks t where t.organization_id=membership_row.organization_id and t.deleted_at is null
          and t.status not in ('done','cancelled') and t.due_at is not null and
          (exists(select 1 from public.task_assignees a where a.task_id=t.id and a.user_id=current_user_id)
           or (t.created_by=current_user_id and not exists(select 1 from public.task_assignees a where a.task_id=t.id)))
        union all
        select 'project',p.id,p.title,p.due_date,'/app/projecten/'||p.id::text,'project'::public.entity_kind
        from public.projects p where p.organization_id=membership_row.organization_id and p.deleted_at is null
          and p.owner_id=current_user_id and p.due_date is not null and p.status not in ('done','archived')
        union all
        select 'event',e.id,e.title,(e.start_at at time zone 'Europe/Brussels')::date,'/app/events/'||e.id::text,null::public.entity_kind
        from public.events e where e.organization_id=membership_row.organization_id and e.deleted_at is null
          and e.owner_id=current_user_id and e.start_at is not null and e.status not in ('completed','cancelled','archived')
        union all
        select 'campaign',c.id,c.title,c.end_date,'/app/campagnes/'||c.id::text,null::public.entity_kind
        from public.campaigns c where c.organization_id=membership_row.organization_id and c.deleted_at is null
          and c.owner_id=current_user_id and c.end_date is not null and c.status not in ('completed','cancelled','archived')
        union all
        select 'content',c.id,c.title,c.deadline,'/app/content/'||c.id::text,null::public.entity_kind
        from public.content_items c where c.organization_id=membership_row.organization_id and c.deleted_at is null
          and c.owner_id=current_user_id and c.deadline is not null and c.status not in ('published','archived')
        union all
        select 'partner',p.id,p.name,p.next_follow_up,'/app/sponsors/'||p.id::text,null::public.entity_kind
        from public.partners p where p.organization_id=membership_row.organization_id and p.deleted_at is null
          and p.owner_id=current_user_id and p.next_follow_up is not null and p.status not in ('inactive','rejected','archived')
        union all
        select 'compliance',d.id,d.title,d.due_date,'/app/administratie',null::public.entity_kind
        from public.compliance_deadlines d where d.organization_id=membership_row.organization_id and d.deleted_at is null
          and d.responsible_id=current_user_id and d.status in ('open','planned')
        union all
        select 'knowledge',k.id,k.title,k.review_due_date,'/app/kennisbank/'||k.id::text,null::public.entity_kind
        from public.knowledge_articles k where k.organization_id=membership_row.organization_id and k.deleted_at is null
          and k.owner_id=current_user_id and k.review_due_date is not null and k.status='published'
      )
      insert into public.notifications(organization_id,user_id,type,title,body,entity_type,entity_id,href,severity,dedupe_key)
      select membership_row.organization_id,current_user_id,'deadline',
        case when due_date<local_today then 'Deadline verstreken: '||title when due_date=local_today then 'Vandaag te doen: '||title else 'Deadline nadert: '||title end,
        case when due_date<local_today then 'Deze opvolging is sinds '||to_char(due_date,'DD/MM/YYYY')||' achterstallig.'
             when due_date=local_today then 'Deze opvolging moet vandaag worden afgewerkt.'
             else 'Nog '||(due_date-local_today)::text||' dagen tot '||to_char(due_date,'DD/MM/YYYY')||'.' end,
        entity_type,id,href,case when due_date<local_today then 'urgent' when due_date=local_today then 'warning' else 'info' end,
        'deadline:'||source_type||':'||id::text||':'||case when due_date<local_today then 'overdue' else (due_date-local_today)::text end
      from candidates where due_date<local_today or due_date=local_today or (due_date-local_today)=any(preferences_row.reminder_days)
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics affected=row_count; inserted_count:=inserted_count+affected;
    end if;

    select count(*) into daily_count from public.tasks t
    where t.organization_id=membership_row.organization_id and t.deleted_at is null and t.status not in ('done','cancelled')
      and t.due_at is not null and (t.due_at at time zone 'Europe/Brussels')::date<=local_today
      and (exists(select 1 from public.task_assignees a where a.task_id=t.id and a.user_id=current_user_id)
        or (t.created_by=current_user_id and not exists(select 1 from public.task_assignees a where a.task_id=t.id)));
    if preferences_row.daily_digest and daily_count>0 then
      insert into public.notifications(organization_id,user_id,type,title,body,href,severity,dedupe_key)
      values(membership_row.organization_id,current_user_id,'daily_digest','Dagoverzicht',
        daily_count::text||case when daily_count=1 then ' taak vraagt' else ' taken vragen' end||' vandaag je aandacht.',
        '/app/taken?van_mij=1&periode=achterstallig',case when daily_count>3 then 'urgent' else 'warning' end,'digest:daily:'||local_today::text)
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics affected=row_count; inserted_count:=inserted_count+affected;
    end if;

    select count(*) into weekly_count from public.tasks t
    where t.organization_id=membership_row.organization_id and t.deleted_at is null and t.status not in ('done','cancelled')
      and t.due_at is not null and (t.due_at at time zone 'Europe/Brussels')::date<=local_today+7
      and (exists(select 1 from public.task_assignees a where a.task_id=t.id and a.user_id=current_user_id)
        or (t.created_by=current_user_id and not exists(select 1 from public.task_assignees a where a.task_id=t.id)));
    if preferences_row.weekly_digest and weekly_count>0 then
      insert into public.notifications(organization_id,user_id,type,title,body,href,severity,dedupe_key)
      values(membership_row.organization_id,current_user_id,'weekly_digest','Weekoverzicht',
        weekly_count::text||case when weekly_count=1 then ' taak heeft' else ' taken hebben' end||' deze week een deadline of achterstand.',
        '/app/taken','info','digest:weekly:'||to_char(local_today,'IYYY-IW'))
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics affected=row_count; inserted_count:=inserted_count+affected;
    end if;
  end loop;
  return inserted_count;
end; $$;


ALTER FUNCTION "public"."generate_my_notifications"("p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_my_operational_notifications"("p_now" timestamp with time zone DEFAULT "now"()) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  current_user_id uuid := (select auth.uid());
  local_today date := (p_now at time zone 'Europe/Brussels')::date;
  inserted_count integer := 0;
  affected integer := 0;
  membership_row public.organization_members%rowtype;
  preferences_row public.notification_preferences%rowtype;
begin
  if current_user_id is null then return 0; end if;

  for membership_row in
    select *
    from public.organization_members
    where user_id=current_user_id and status='active'
  loop
    insert into public.notification_preferences(organization_id,user_id)
    values(membership_row.organization_id,current_user_id)
    on conflict(organization_id,user_id) do nothing;

    select * into preferences_row
    from public.notification_preferences
    where organization_id=membership_row.organization_id and user_id=current_user_id;

    if preferences_row.follow_up_notifications then
      update public.notifications
      set type='sponsor_follow_up'
      where organization_id=membership_row.organization_id
        and user_id=current_user_id
        and type='deadline'
        and dedupe_key like 'deadline:partner:%';

      with event_gaps as (
        select
          e.id,
          e.title,
          e.start_at,
          not exists(
            select 1 from public.google_resource_links g
            where g.organization_id=e.organization_id
              and g.entity_type='event'
              and g.entity_id=e.id
              and g.resource_type='document'
          ) missing_runbook,
          not exists(
            select 1 from public.google_resource_links g
            where g.organization_id=e.organization_id
              and g.entity_type='event'
              and g.entity_id=e.id
              and g.resource_type='calendar_event'
              and g.name not like '[VERWIJDERD]%'
          ) missing_calendar
        from public.events e
        where e.organization_id=membership_row.organization_id
          and e.deleted_at is null
          and e.status in ('confirmed','production')
          and e.start_at is not null
          and (e.start_at at time zone 'Europe/Brussels')::date between local_today and local_today+30
          and (e.owner_id=current_user_id or membership_row.role in ('admin','board'))
      )
      insert into public.notifications(
        organization_id,user_id,type,title,body,entity_id,href,severity,dedupe_key
      )
      select
        membership_row.organization_id,
        current_user_id,
        'event_readiness',
        'Eventvoorbereiding onvolledig: '||title,
        concat_ws(' en ',
          case when missing_runbook then 'het draaiboek ontbreekt' end,
          case when missing_calendar then 'de Google Calendar-koppeling ontbreekt' end
        )||'.',
        id,
        '/app/events/'||id::text,
        case when (start_at at time zone 'Europe/Brussels')::date<=local_today+7 then 'urgent' else 'warning' end,
        'event-readiness:'||id::text||':'||to_char(local_today,'IYYY-IW')
      from event_gaps
      where missing_runbook or missing_calendar
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics affected=row_count;
      inserted_count:=inserted_count+affected;

      with meeting_gaps as (
        select
          m.id,
          m.title,
          m.meeting_at,
          (
            nullif(trim(coalesce(m.minutes_url,'')),'') is null
            and not exists(
              select 1 from public.google_resource_links g
              where g.organization_id=m.organization_id
                and g.entity_type='meeting'
                and g.entity_id=m.id
                and g.resource_type='document'
            )
          ) missing_minutes,
          (
            select count(*)
            from public.meeting_action_items a
            where a.organization_id=m.organization_id
              and a.meeting_id=m.id
              and a.status in ('todo','doing')
          ) open_actions
        from public.meetings m
        where m.organization_id=membership_row.organization_id
          and m.deleted_at is null
          and m.status not in ('cancelled','archived')
          and m.meeting_at is not null
          and (m.meeting_at at time zone 'Europe/Brussels')::date<=local_today
          and (m.created_by=current_user_id or membership_row.role in ('admin','board'))
      )
      insert into public.notifications(
        organization_id,user_id,type,title,body,entity_id,href,severity,dedupe_key
      )
      select
        membership_row.organization_id,
        current_user_id,
        'meeting_follow_up',
        'Vergadering vraagt opvolging: '||title,
        concat_ws(' en ',
          case when missing_minutes then 'de notulen ontbreken' end,
          case when open_actions>0 then open_actions::text||case when open_actions=1 then ' actiepunt staat nog open' else ' actiepunten staan nog open' end end
        )||'.',
        id,
        '/app/vergaderingen/'||id::text,
        case when open_actions>0 then 'warning' else 'info' end,
        'meeting-follow-up:'||id::text||':'||to_char(local_today,'IYYY-IW')
      from meeting_gaps
      where missing_minutes or open_actions>0
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics affected=row_count;
      inserted_count:=inserted_count+affected;
    end if;
  end loop;

  return inserted_count;
end;
$$;


ALTER FUNCTION "public"."generate_my_operational_notifications"("p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles(id,display_name,avatar_url) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',split_part(new.email,'@',1)),new.raw_user_meta_data->>'avatar_url') on conflict(id) do nothing;
  insert into public.organization_members(organization_id,user_id,role,status)
    select id,new.id,'volunteer','pending' from public.organizations where slug='besc'
    on conflict(organization_id,user_id) do nothing;
  return new;
end; $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_sponsor_dashboard"("p_access_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.portal_sponsor_dashboard(p_access_id)
$$;


ALTER FUNCTION "public"."portal_sponsor_dashboard"("p_access_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_streamer_dashboard"("p_access_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.portal_streamer_dashboard(p_access_id)
$$;


ALTER FUNCTION "public"."portal_streamer_dashboard"("p_access_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."read_social_account_credentials"("p_account_id" "uuid") RETURNS TABLE("access_token" "text", "refresh_token" "text", "expires_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select access_secret.decrypted_secret,refresh_secret.decrypted_secret,credentials.expires_at
  from private.social_account_credentials credentials
  join vault.decrypted_secrets access_secret on access_secret.id=credentials.access_token_secret_id
  left join vault.decrypted_secrets refresh_secret on refresh_secret.id=credentials.refresh_token_secret_id
  where credentials.social_account_id=p_account_id
$$;


ALTER FUNCTION "public"."read_social_account_credentials"("p_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_my_notifications"("p_now" timestamp with time zone DEFAULT "now"()) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  base_count integer := 0;
  operational_count integer := 0;
begin
  base_count := public.generate_my_notifications(p_now);
  operational_count := public.generate_my_operational_notifications(p_now);
  return base_count+operational_count;
end;
$$;


ALTER FUNCTION "public"."refresh_my_notifications"("p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_newsletter_subscription"("p_list_slug" "text", "p_email" "text", "p_display_name" "text", "p_token_hash" "text", "p_ip_hash" "text", "p_consent_version" "text") RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.request_newsletter_subscription(
    p_list_slug, p_email, p_display_name, p_token_hash, p_ip_hash, p_consent_version
  )
$$;


ALTER FUNCTION "public"."request_newsletter_subscription"("p_list_slug" "text", "p_email" "text", "p_display_name" "text", "p_token_hash" "text", "p_ip_hash" "text", "p_consent_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_newsletter_unsubscription"("p_list_slug" "text", "p_email" "text", "p_token_hash" "text", "p_ip_hash" "text") RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
 select private.request_newsletter_unsubscription(p_list_slug,p_email,p_token_hash,p_ip_hash)
$$;


ALTER FUNCTION "public"."request_newsletter_unsubscription"("p_list_slug" "text", "p_email" "text", "p_token_hash" "text", "p_ip_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."store_social_account_credentials"("p_account_id" "uuid", "p_access_token" "text", "p_refresh_token" "text" DEFAULT NULL::"text", "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare account_row public.social_accounts; credential_row private.social_account_credentials; access_id uuid; refresh_id uuid;
begin
  select * into account_row from public.social_accounts where id=p_account_id and deleted_at is null;
  if account_row.id is null or length(trim(p_access_token)) < 8 then raise exception 'invalid credentials'; end if;
  select * into credential_row from private.social_account_credentials where social_account_id=p_account_id for update;
  if credential_row.social_account_id is null then
    select vault.create_secret(p_access_token,'social-access-'||p_account_id::text,'Social access token') into access_id;
    if nullif(trim(p_refresh_token),'') is not null then select vault.create_secret(p_refresh_token,'social-refresh-'||p_account_id::text,'Social refresh token') into refresh_id; end if;
    insert into private.social_account_credentials(social_account_id,organization_id,access_token_secret_id,refresh_token_secret_id,expires_at)
    values(p_account_id,account_row.organization_id,access_id,refresh_id,p_expires_at);
  else
    perform vault.update_secret(credential_row.access_token_secret_id,p_access_token);
    refresh_id := credential_row.refresh_token_secret_id;
    if nullif(trim(p_refresh_token),'') is not null and refresh_id is null then
      select vault.create_secret(p_refresh_token,'social-refresh-'||p_account_id::text,'Social refresh token') into refresh_id;
    elsif nullif(trim(p_refresh_token),'') is not null then perform vault.update_secret(refresh_id,p_refresh_token); end if;
    update private.social_account_credentials set refresh_token_secret_id=refresh_id,expires_at=p_expires_at,updated_at=now() where social_account_id=p_account_id;
  end if;
end $$;


ALTER FUNCTION "public"."store_social_account_credentials"("p_account_id" "uuid", "p_access_token" "text", "p_refresh_token" "text", "p_expires_at" timestamp with time zone) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "private"."newsletter_subscription_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "mailing_list_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text",
    "token_hash" "text" NOT NULL,
    "ip_hash" "text" NOT NULL,
    "consent_version" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "newsletter_subscription_requests_email_check" CHECK ((("char_length"("email") >= 5) AND ("char_length"("email") <= 320)))
);


ALTER TABLE "private"."newsletter_subscription_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."newsletter_unsubscribe_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "mailing_list_id" "uuid" NOT NULL,
    "subscriber_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "ip_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."newsletter_unsubscribe_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."social_account_credentials" (
    "social_account_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "access_token_secret_id" "uuid" NOT NULL,
    "refresh_token_secret_id" "uuid",
    "expires_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."social_account_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."acceptance_check_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "run_id" "uuid" NOT NULL,
    "check_key" "text" NOT NULL,
    "category" "text" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "evidence" "text",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "acceptance_check_results_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'passed'::"text", 'failed'::"text", 'blocked'::"text", 'not_applicable'::"text"])))
);


ALTER TABLE "public"."acceptance_check_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."acceptance_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "environment" "text" DEFAULT 'preview'::"text" NOT NULL,
    "commit_sha" "text",
    "notes" "text",
    "started_by" "uuid" NOT NULL,
    "completed_by" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "acceptance_runs_environment_check" CHECK (("environment" = ANY (ARRAY['local'::"text", 'preview'::"text", 'production'::"text"]))),
    CONSTRAINT "acceptance_runs_status_check" CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'passed'::"text", 'failed'::"text", 'accepted'::"text", 'archived'::"text"]))),
    CONSTRAINT "acceptance_runs_title_check" CHECK ((("char_length"("title") >= 3) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."acceptance_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "public"."entity_kind" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."administrative_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "document_type" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "document_date" "date",
    "valid_from" "date",
    "valid_until" "date",
    "reference_number" "text",
    "drive_url" "text",
    "confidential" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "administrative_documents_check" CHECK ((("valid_until" IS NULL) OR ("valid_from" IS NULL) OR ("valid_until" >= "valid_from"))),
    CONSTRAINT "administrative_documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['articles'::"text", 'incorporation'::"text", 'official_gazette'::"text", 'kbo'::"text", 'ubo'::"text", 'vat'::"text", 'minutes'::"text", 'annual_accounts'::"text", 'budget'::"text", 'insurance'::"text", 'contract'::"text", 'subsidy'::"text", 'policy'::"text", 'register'::"text", 'other'::"text"]))),
    CONSTRAINT "administrative_documents_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'expiring'::"text", 'expired'::"text", 'archived'::"text"]))),
    CONSTRAINT "administrative_documents_title_check" CHECK ((("char_length"("title") >= 2) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."administrative_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "input_text" "text" NOT NULL,
    "output_text" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "input_tokens" integer,
    "output_tokens" integer,
    "cost_amount" numeric(12,6),
    "error_message" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "ai_generations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."ai_generations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_prompt_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "description" "text",
    "system_prompt" "text",
    "prompt_template" "text" NOT NULL,
    "preferred_model" "text" DEFAULT 'openai/gpt-5.4'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "ai_prompt_templates_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."ai_prompt_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "module" "text" NOT NULL,
    "source_href" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "request_note" "text",
    "decided_by" "uuid",
    "decision_note" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "approval_requests_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['content'::"text", 'expense'::"text", 'partner'::"text", 'document'::"text", 'email'::"text", 'newsletter'::"text"]))),
    CONSTRAINT "approval_requests_module_check" CHECK (("module" = ANY (ARRAY['content'::"text", 'finance'::"text", 'sponsors'::"text", 'documents'::"text", 'communication'::"text"]))),
    CONSTRAINT "approval_requests_source_href_check" CHECK (("source_href" ~~ '/app/%'::"text")),
    CONSTRAINT "approval_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'changes_requested'::"text", 'rejected'::"text"]))),
    CONSTRAINT "approval_requests_title_check" CHECK ((("char_length"("title") >= 2) AND ("char_length"("title") <= 240)))
);


ALTER TABLE "public"."approval_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "asset_type" "text" DEFAULT 'equipment'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "serial_number" "text",
    "owner_person_id" "uuid",
    "location" "text",
    "acquired_date" "date",
    "purchase_value" numeric(12,2),
    "current_value" numeric(12,2),
    "supplier_id" "uuid",
    "project_id" "uuid",
    "event_id" "uuid",
    "campaign_id" "uuid",
    "document_url" "text",
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "assets_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['equipment'::"text", 'computer'::"text", 'streaming'::"text", 'furniture'::"text", 'software'::"text", 'vehicle'::"text", 'other'::"text"]))),
    CONSTRAINT "assets_current_value_check" CHECK ((("current_value" IS NULL) OR ("current_value" >= (0)::numeric))),
    CONSTRAINT "assets_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 180))),
    CONSTRAINT "assets_purchase_value_check" CHECK ((("purchase_value" IS NULL) OR ("purchase_value" >= (0)::numeric))),
    CONSTRAINT "assets_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'active'::"text", 'maintenance'::"text", 'loaned'::"text", 'retired'::"text", 'lost'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."association_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "member_number" "text",
    "full_name" "text" NOT NULL,
    "email" "text",
    "membership_type" "text" DEFAULT 'effective'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "joined_on" "date",
    "left_on" "date",
    "voting_right" boolean DEFAULT false NOT NULL,
    "address" "text",
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "association_members_check" CHECK ((("left_on" IS NULL) OR ("joined_on" IS NULL) OR ("left_on" >= "joined_on"))),
    CONSTRAINT "association_members_full_name_check" CHECK ((("char_length"("full_name") >= 2) AND ("char_length"("full_name") <= 180))),
    CONSTRAINT "association_members_membership_type_check" CHECK (("membership_type" = ANY (ARRAY['effective'::"text", 'adherent'::"text", 'honorary'::"text", 'volunteer'::"text"]))),
    CONSTRAINT "association_members_status_check" CHECK (("status" = ANY (ARRAY['candidate'::"text", 'active'::"text", 'suspended'::"text", 'former'::"text", 'deceased'::"text"])))
);


ALTER TABLE "public"."association_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "actor_id" "uuid",
    "entity_label" "text",
    "changed_fields" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "previous_status" "text",
    "new_status" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "audit_log_action_check" CHECK (("action" = ANY (ARRAY['created'::"text", 'updated'::"text", 'archived'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budget_envelopes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "planned_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "notes" "text",
    "project_id" "uuid",
    "event_id" "uuid",
    "campaign_id" "uuid",
    "partner_id" "uuid",
    "merch_launch_id" "uuid",
    "owner_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    CONSTRAINT "budget_envelopes_category_check" CHECK (("category" = ANY (ARRAY['event'::"text", 'content'::"text", 'equipment'::"text", 'software'::"text", 'marketing'::"text", 'merchandise'::"text", 'transport'::"text", 'venue'::"text", 'administration'::"text", 'giveaway'::"text", 'other'::"text"]))),
    CONSTRAINT "budget_envelopes_check" CHECK ((("end_date" IS NULL) OR ("start_date" IS NULL) OR ("end_date" >= "start_date"))),
    CONSTRAINT "budget_envelopes_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 180))),
    CONSTRAINT "budget_envelopes_planned_amount_check" CHECK (("planned_amount" >= (0)::numeric)),
    CONSTRAINT "budget_envelopes_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'requested'::"text", 'approved'::"text", 'active'::"text", 'closed'::"text", 'rejected'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."budget_envelopes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_deliverables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'todo'::"text" NOT NULL,
    "approval_status" "text" DEFAULT 'not_required'::"text" NOT NULL,
    "due_date" "date",
    "assignee_id" "uuid",
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "community_person_id" "uuid",
    CONSTRAINT "campaign_deliverables_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['not_required'::"text", 'pending'::"text", 'changes_requested'::"text", 'approved'::"text"]))),
    CONSTRAINT "campaign_deliverables_status_check" CHECK (("status" = ANY (ARRAY['todo'::"text", 'doing'::"text", 'review'::"text", 'approved'::"text", 'completed'::"text", 'blocked'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "campaign_deliverables_title_check" CHECK ((("char_length"("title") >= 2) AND ("char_length"("title") <= 240)))
);


ALTER TABLE "public"."campaign_deliverables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "partner_id" "uuid",
    "project_id" "uuid",
    "event_id" "uuid",
    "title" "text" NOT NULL,
    "campaign_type" "text" DEFAULT 'social'::"text" NOT NULL,
    "status" "text" DEFAULT 'idea'::"text" NOT NULL,
    "priority" "public"."priority_level" DEFAULT 'normal'::"public"."priority_level" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "channels" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "deliverables" "text",
    "reporting_status" "text" DEFAULT 'not_required'::"text" NOT NULL,
    "budget" numeric(12,2),
    "value" numeric(12,2),
    "drive_url" "text",
    "notes" "text",
    "owner_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "results_summary" "text",
    "impressions" bigint,
    "clicks" bigint,
    CONSTRAINT "campaigns_campaign_type_check" CHECK (("campaign_type" = ANY (ARRAY['social'::"text", 'partner'::"text", 'sponsor'::"text", 'giveaway'::"text", 'crowdfunding'::"text", 'event_promo'::"text", 'stream'::"text", 'blog'::"text"]))),
    CONSTRAINT "campaigns_clicks_check" CHECK ((("clicks" IS NULL) OR ("clicks" >= 0))),
    CONSTRAINT "campaigns_impressions_check" CHECK ((("impressions" IS NULL) OR ("impressions" >= 0))),
    CONSTRAINT "campaigns_reporting_status_check" CHECK (("reporting_status" = ANY (ARRAY['not_required'::"text", 'todo'::"text", 'draft'::"text", 'sent'::"text", 'approved'::"text"]))),
    CONSTRAINT "campaigns_status_check" CHECK (("status" = ANY (ARRAY['idea'::"text", 'review'::"text", 'approved'::"text", 'production'::"text", 'scheduled'::"text", 'live'::"text", 'reporting'::"text", 'completed'::"text", 'cancelled'::"text", 'archived'::"text"]))),
    CONSTRAINT "campaigns_title_check" CHECK ((("char_length"("title") >= 3) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "public"."entity_kind" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "edited_at" timestamp with time zone,
    CONSTRAINT "comments_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 5000)))
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "project_id" "uuid",
    "role_name" "text" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "starts_at" timestamp with time zone,
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_assignments_check" CHECK ((("event_id" IS NOT NULL) OR ("project_id" IS NOT NULL))),
    CONSTRAINT "community_assignments_role_name_check" CHECK ((("char_length"("role_name") >= 2) AND ("char_length"("role_name") <= 180))),
    CONSTRAINT "community_assignments_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'confirmed'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."community_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_onboarding_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "due_date" "date",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "item_type" "text" DEFAULT 'onboarding'::"text" NOT NULL,
    "notes" "text",
    CONSTRAINT "community_onboarding_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['onboarding'::"text", 'coaching'::"text", 'training'::"text"]))),
    CONSTRAINT "community_onboarding_items_title_check" CHECK ((("char_length"("title") >= 2) AND ("char_length"("title") <= 240)))
);


ALTER TABLE "public"."community_onboarding_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_people" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "handle" "text",
    "person_type" "text" DEFAULT 'volunteer'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "email" "text",
    "discord_handle" "text",
    "language" "text",
    "platforms" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "interests" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "skills" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "availability" "text",
    "streamteam_level" "text",
    "onboarding_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "drive_url" "text",
    "notes" "text",
    "owner_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "phone" "text",
    "birth_date" "date",
    "started_on" "date",
    "stopped_on" "date",
    "role_description" "text",
    "avatar_url" "text",
    "account_user_id" "uuid",
    CONSTRAINT "community_people_display_name_check" CHECK ((("char_length"("display_name") >= 2) AND ("char_length"("display_name") <= 180))),
    CONSTRAINT "community_people_onboarding_status_check" CHECK (("onboarding_status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'completed'::"text", 'not_required'::"text"]))),
    CONSTRAINT "community_people_person_type_check" CHECK (("person_type" = ANY (ARRAY['crew'::"text", 'streamer'::"text", 'creator'::"text", 'volunteer'::"text", 'moderator'::"text", 'guest'::"text", 'external'::"text"]))),
    CONSTRAINT "community_people_status_check" CHECK (("status" = ANY (ARRAY['candidate'::"text", 'onboarding'::"text", 'tryout'::"text", 'active'::"text", 'paused'::"text", 'inactive'::"text", 'rejected'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."community_people" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_person_roles" (
    "organization_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_person_roles_role_check" CHECK (("role" = ANY (ARRAY['member'::"text", 'board'::"text", 'volunteer'::"text", 'creator'::"text", 'streamer'::"text", 'moderator'::"text", 'staff'::"text", 'contact'::"text", 'guest'::"text"])))
);


ALTER TABLE "public"."community_person_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."compliance_deadlines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "due_date" "date",
    "recurrence" "text" DEFAULT 'once'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "responsible_id" "uuid",
    "document_id" "uuid",
    "completed_at" timestamp with time zone,
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "compliance_deadlines_category_check" CHECK (("category" = ANY (ARRAY['general_assembly'::"text", 'board'::"text", 'finance'::"text", 'kbo'::"text", 'ubo'::"text", 'tax'::"text", 'insurance'::"text", 'subsidy'::"text", 'publication'::"text", 'contract'::"text", 'other'::"text"]))),
    CONSTRAINT "compliance_deadlines_recurrence_check" CHECK (("recurrence" = ANY (ARRAY['once'::"text", 'monthly'::"text", 'quarterly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "compliance_deadlines_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'planned'::"text", 'completed'::"text", 'cancelled'::"text", 'not_applicable'::"text"]))),
    CONSTRAINT "compliance_deadlines_title_check" CHECK ((("char_length"("title") >= 2) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."compliance_deadlines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "content_type" "text" DEFAULT 'social_post'::"text" NOT NULL,
    "status" "text" DEFAULT 'idea'::"text" NOT NULL,
    "priority" "public"."priority_level" DEFAULT 'normal'::"public"."priority_level" NOT NULL,
    "owner_id" "uuid",
    "primary_channel" "text",
    "channels" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "deadline" "date",
    "publication_at" timestamp with time zone,
    "drive_url" "text",
    "canva_url" "text",
    "publication_url" "text",
    "approval_status" "text" DEFAULT 'not_required'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "campaign_id" "uuid",
    "partner_id" "uuid",
    CONSTRAINT "content_items_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['not_required'::"text", 'pending'::"text", 'changes_requested'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "content_items_content_type_check" CHECK (("content_type" = ANY (ARRAY['idea'::"text", 'blog'::"text", 'social_post'::"text", 'short_reel'::"text", 'youtube_video'::"text", 'livestream'::"text", 'podcast'::"text", 'tutorial'::"text", 'review'::"text", 'newsletter'::"text", 'community_post'::"text", 'partner_post'::"text", 'event_promo'::"text"]))),
    CONSTRAINT "content_items_primary_channel_check" CHECK ((("primary_channel" IS NULL) OR ("primary_channel" = ANY (ARRAY['Discord'::"text", 'Twitch'::"text", 'YouTube'::"text", 'TikTok'::"text", 'Instagram'::"text", 'Facebook'::"text", 'X'::"text", 'Threads'::"text", 'LinkedIn'::"text", 'Blogger'::"text", 'Website'::"text", 'Nieuwsbrief'::"text"])))),
    CONSTRAINT "content_items_status_check" CHECK (("status" = ANY (ARRAY['idea'::"text", 'research'::"text", 'draft'::"text", 'production'::"text", 'review'::"text", 'approved'::"text", 'scheduled'::"text", 'published'::"text", 'repurpose'::"text", 'archived'::"text"]))),
    CONSTRAINT "content_items_title_check" CHECK ((("char_length"("title") >= 3) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."content_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_communications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "communication_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "to_addresses" "text"[] NOT NULL,
    "cc_addresses" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "subject" "text" NOT NULL,
    "body_text" "text" NOT NULL,
    "follow_up_date" "date",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "gmail_draft_id" "text",
    "gmail_message_id" "text",
    "gmail_thread_id" "text",
    "created_by" "uuid" NOT NULL,
    "approved_by" "uuid",
    "sent_by" "uuid",
    "approved_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email_template_id" "uuid",
    "bcc_addresses" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "email_communications_body_text_check" CHECK ((("char_length"("body_text") >= 2) AND ("char_length"("body_text") <= 20000))),
    CONSTRAINT "email_communications_communication_type_check" CHECK (("communication_type" = ANY (ARRAY['sponsor_follow_up'::"text", 'event_communication'::"text", 'invitation'::"text"]))),
    CONSTRAINT "email_communications_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['partner'::"text", 'event'::"text", 'meeting'::"text"]))),
    CONSTRAINT "email_communications_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_approval'::"text", 'changes_requested'::"text", 'approved'::"text", 'sent'::"text", 'rejected'::"text", 'failed'::"text"]))),
    CONSTRAINT "email_communications_subject_check" CHECK ((("char_length"("subject") >= 2) AND ("char_length"("subject") <= 300))),
    CONSTRAINT "email_communications_title_check" CHECK ((("char_length"("title") >= 2) AND ("char_length"("title") <= 240))),
    CONSTRAINT "email_communications_to_addresses_check" CHECK (("cardinality"("to_addresses") > 0))
);


ALTER TABLE "public"."email_communications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."email_communications"."bcc_addresses" IS 'Blind-copy recipients passed to Gmail; managed with the same permissions as the communication record.';



CREATE TABLE IF NOT EXISTS "public"."email_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "entity_type" "text",
    "subject_template" "text" NOT NULL,
    "body_template" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "newsletter_variant" "text" DEFAULT 'besc'::"text" NOT NULL,
    "default_hero_image_url" "text",
    "default_hero_image_alt" "text",
    CONSTRAINT "email_templates_body_template_check" CHECK ((("char_length"("body_template") >= 2) AND ("char_length"("body_template") <= 20000))),
    CONSTRAINT "email_templates_category_check" CHECK (("category" = ANY (ARRAY['sponsor_follow_up'::"text", 'event_communication'::"text", 'invitation'::"text", 'newsletter'::"text", 'general'::"text"]))),
    CONSTRAINT "email_templates_entity_type_check" CHECK ((("entity_type" IS NULL) OR ("entity_type" = ANY (ARRAY['partner'::"text", 'event'::"text", 'meeting'::"text"])))),
    CONSTRAINT "email_templates_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 180))),
    CONSTRAINT "email_templates_newsletter_variant_check" CHECK (("newsletter_variant" = ANY (ARRAY['besc'::"text", 'event'::"text", 'partner'::"text", 'compact'::"text"]))),
    CONSTRAINT "email_templates_subject_template_check" CHECK ((("char_length"("subject_template") >= 2) AND ("char_length"("subject_template") <= 300)))
);


ALTER TABLE "public"."email_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "event_type" "text" DEFAULT 'community'::"text" NOT NULL,
    "status" "text" DEFAULT 'idea'::"text" NOT NULL,
    "priority" "public"."priority_level" DEFAULT 'normal'::"public"."priority_level" NOT NULL,
    "owner_id" "uuid",
    "start_at" timestamp with time zone,
    "end_at" timestamp with time zone,
    "location" "text",
    "is_online" boolean DEFAULT false NOT NULL,
    "role_besc" "text" DEFAULT 'organizer'::"text" NOT NULL,
    "drive_url" "text",
    "eventbrite_url" "text",
    "stream_url" "text",
    "expected_attendees" integer,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "partner_id" "uuid",
    CONSTRAINT "events_check" CHECK ((("end_at" IS NULL) OR ("start_at" IS NULL) OR ("end_at" >= "start_at"))),
    CONSTRAINT "events_event_type_check" CHECK (("event_type" = ANY (ARRAY['community'::"text", 'workshop'::"text", 'livestream'::"text", 'podcast'::"text", 'lan'::"text", 'meetup'::"text", 'tournament'::"text", 'partner'::"text", 'charity'::"text", 'other'::"text"]))),
    CONSTRAINT "events_expected_attendees_check" CHECK ((("expected_attendees" IS NULL) OR ("expected_attendees" >= 0))),
    CONSTRAINT "events_role_besc_check" CHECK (("role_besc" = ANY (ARRAY['organizer'::"text", 'partner'::"text", 'promoter'::"text", 'participant'::"text"]))),
    CONSTRAINT "events_status_check" CHECK (("status" = ANY (ARRAY['idea'::"text", 'planning'::"text", 'confirmed'::"text", 'production'::"text", 'live'::"text", 'aftercare'::"text", 'completed'::"text", 'cancelled'::"text", 'archived'::"text"]))),
    CONSTRAINT "events_title_check" CHECK ((("char_length"("title") >= 3) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "budget_id" "uuid",
    "title" "text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "expense_date" "date",
    "paid_at" "date",
    "supplier" "text",
    "invoice_number" "text",
    "proof_url" "text",
    "notes" "text",
    "project_id" "uuid",
    "event_id" "uuid",
    "campaign_id" "uuid",
    "partner_id" "uuid",
    "merch_launch_id" "uuid",
    "submitted_by" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "claimant_name" "text",
    "payment_reference" "text",
    "declaration_url" "text",
    CONSTRAINT "expenses_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "expenses_category_check" CHECK (("category" = ANY (ARRAY['event'::"text", 'content'::"text", 'equipment'::"text", 'software'::"text", 'marketing'::"text", 'merchandise'::"text", 'transport'::"text", 'venue'::"text", 'administration'::"text", 'giveaway'::"text", 'other'::"text"]))),
    CONSTRAINT "expenses_paid_requires_proof" CHECK ((("status" <> ALL (ARRAY['paid'::"text", 'reimbursed'::"text"])) OR ("proof_url" IS NOT NULL))),
    CONSTRAINT "expenses_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'requested'::"text", 'approved'::"text", 'paid'::"text", 'reimbursement_due'::"text", 'reimbursed'::"text", 'rejected'::"text", 'cancelled'::"text", 'archived'::"text"]))),
    CONSTRAINT "expenses_title_check" CHECK ((("char_length"("title") >= 2) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_settings" (
    "organization_id" "uuid" NOT NULL,
    "drive_root_url" "text",
    "fiscal_year_start_month" integer DEFAULT 1 NOT NULL,
    "document_naming_pattern" "text" DEFAULT 'YYYY-MM-DD - TYPE - LEVERANCIER - BEDRAG'::"text" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "finance_settings_fiscal_year_start_month_check" CHECK ((("fiscal_year_start_month" >= 1) AND ("fiscal_year_start_month" <= 12)))
);


ALTER TABLE "public"."finance_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "previous_status" "text",
    "new_status" "text",
    "actor_id" "uuid",
    "snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "financial_audit_log_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['budget'::"text", 'expense'::"text", 'income'::"text"])))
);


ALTER TABLE "public"."financial_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "document_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "document_date" "date",
    "fiscal_year" integer NOT NULL,
    "status" "text" DEFAULT 'linked'::"text" NOT NULL,
    "drive_url" "text",
    "document_number" "text",
    "counterparty" "text",
    "amount" numeric(12,2),
    "expense_id" "uuid",
    "income_id" "uuid",
    "budget_id" "uuid",
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "financial_documents_amount_check" CHECK ((("amount" IS NULL) OR ("amount" >= (0)::numeric))),
    CONSTRAINT "financial_documents_check" CHECK ((("status" = 'missing'::"text") OR ("drive_url" IS NOT NULL))),
    CONSTRAINT "financial_documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['invoice'::"text", 'receipt'::"text", 'credit_note'::"text", 'bank_statement'::"text", 'contract'::"text", 'subsidy'::"text", 'declaration'::"text", 'other'::"text"]))),
    CONSTRAINT "financial_documents_fiscal_year_check" CHECK ((("fiscal_year" >= 2000) AND ("fiscal_year" <= 2200))),
    CONSTRAINT "financial_documents_status_check" CHECK (("status" = ANY (ARRAY['missing'::"text", 'linked'::"text", 'verified'::"text", 'archived'::"text"]))),
    CONSTRAINT "financial_documents_title_check" CHECK ((("char_length"("title") >= 2) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."financial_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."google_resource_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "resource_type" "text" NOT NULL,
    "google_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "mime_type" "text",
    "web_url" "text" NOT NULL,
    "drive_id" "text",
    "parent_id" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "google_resource_links_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['project'::"text", 'event'::"text", 'meeting'::"text", 'partner'::"text", 'campaign'::"text"]))),
    CONSTRAINT "google_resource_links_resource_type_check" CHECK (("resource_type" = ANY (ARRAY['folder'::"text", 'document'::"text", 'calendar_event'::"text"])))
);


ALTER TABLE "public"."google_resource_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."governance_mandates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "role_label" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "appointment_document_url" "text",
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "governance_mandates_date_order_check" CHECK ((("start_date" IS NULL) OR ("end_date" IS NULL) OR ("end_date" >= "start_date"))),
    CONSTRAINT "governance_mandates_role_check" CHECK (("role" = ANY (ARRAY['chair'::"text", 'vice_chair'::"text", 'secretary'::"text", 'treasurer'::"text", 'director'::"text", 'daily_management'::"text", 'other'::"text"]))),
    CONSTRAINT "governance_mandates_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'active'::"text", 'ended'::"text"])))
);


ALTER TABLE "public"."governance_mandates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inbox_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "status" "public"."inbox_status" DEFAULT 'new'::"public"."inbox_status" NOT NULL,
    "priority" "public"."priority_level" DEFAULT 'normal'::"public"."priority_level" NOT NULL,
    "reviewer_id" "uuid",
    "converted_project_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."inbox_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."income_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "budget_id" "uuid",
    "title" "text" NOT NULL,
    "income_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "status" "text" DEFAULT 'expected'::"text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "expected_date" "date",
    "received_at" "date",
    "payer" "text",
    "invoice_number" "text",
    "proof_url" "text",
    "notes" "text",
    "project_id" "uuid",
    "event_id" "uuid",
    "campaign_id" "uuid",
    "partner_id" "uuid",
    "merch_launch_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "income_entries_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "income_entries_income_type_check" CHECK (("income_type" = ANY (ARRAY['sponsorship'::"text", 'donation'::"text", 'membership'::"text", 'merchandise'::"text", 'ticketing'::"text", 'grant'::"text", 'refund'::"text", 'other'::"text"]))),
    CONSTRAINT "income_entries_status_check" CHECK (("status" = ANY (ARRAY['expected'::"text", 'invoiced'::"text", 'received'::"text", 'cancelled'::"text", 'archived'::"text"]))),
    CONSTRAINT "income_entries_title_check" CHECK ((("char_length"("title") >= 2) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."income_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "status" "text" DEFAULT 'not_configured'::"text" NOT NULL,
    "account_label" "text",
    "configuration" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_sync_at" timestamp with time zone,
    "last_error" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "integration_connections_provider_check" CHECK (("provider" = ANY (ARRAY['google_workspace'::"text", 'discord'::"text", 'vercel_ai_gateway'::"text", 'openai'::"text", 'anthropic'::"text", 'facebook'::"text", 'instagram'::"text", 'linkedin'::"text", 'youtube'::"text", 'twitch'::"text", 'tiktok'::"text", 'other'::"text"]))),
    CONSTRAINT "integration_connections_status_check" CHECK (("status" = ANY (ARRAY['not_configured'::"text", 'configured'::"text", 'connected'::"text", 'error'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."integration_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_articles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "title" "text" NOT NULL,
    "summary" "text",
    "body" "text",
    "article_type" "text" DEFAULT 'guide'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "drive_url" "text",
    "owner_id" "uuid",
    "review_due_date" "date",
    "published_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "knowledge_articles_article_type_check" CHECK (("article_type" = ANY (ARRAY['procedure'::"text", 'guide'::"text", 'policy'::"text", 'faq'::"text", 'onboarding'::"text", 'template'::"text", 'reference'::"text", 'other'::"text"]))),
    CONSTRAINT "knowledge_articles_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'review'::"text", 'published'::"text", 'outdated'::"text", 'archived'::"text"]))),
    CONSTRAINT "knowledge_articles_title_check" CHECK ((("char_length"("title") >= 3) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."knowledge_articles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '#6b7280'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "knowledge_categories_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 100)))
);


ALTER TABLE "public"."knowledge_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_revisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "article_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text",
    "body" "text",
    "status" "text" NOT NULL,
    "changed_by" "uuid" NOT NULL,
    "change_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."knowledge_revisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kpi_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "domain" "text" NOT NULL,
    "metric" "text" NOT NULL,
    "value" numeric(18,4) NOT NULL,
    "target" numeric(18,4),
    "unit" "text" DEFAULT 'number'::"text" NOT NULL,
    "period_start" "date",
    "period_end" "date",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_url" "text",
    "notes" "text",
    "project_id" "uuid",
    "content_id" "uuid",
    "event_id" "uuid",
    "campaign_id" "uuid",
    "partner_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "task_id" "uuid",
    "metric_definition" "text",
    "collection_method" "text" DEFAULT 'manual'::"text" NOT NULL,
    "community_person_id" "uuid",
    "social_post_id" "uuid",
    CONSTRAINT "kpi_records_collection_method_check" CHECK (("collection_method" = ANY (ARRAY['manual'::"text", 'imported'::"text", 'api'::"text"]))),
    CONSTRAINT "kpi_records_domain_check" CHECK (("domain" = ANY (ARRAY['community'::"text", 'content'::"text", 'social'::"text", 'events'::"text", 'campaigns'::"text", 'sponsors'::"text", 'website'::"text", 'finance'::"text", 'other'::"text"]))),
    CONSTRAINT "kpi_records_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 180))),
    CONSTRAINT "kpi_records_period_order_check" CHECK ((("period_start" IS NULL) OR ("period_end" IS NULL) OR ("period_end" >= "period_start"))),
    CONSTRAINT "kpi_records_unit_check" CHECK (("unit" = ANY (ARRAY['number'::"text", 'percent'::"text", 'currency'::"text", 'minutes'::"text", 'hours'::"text", 'days'::"text"])))
);


ALTER TABLE "public"."kpi_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legacy_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" DEFAULT 'Overige'::"text" NOT NULL,
    "suggested_module" "text",
    "lifecycle" "text" DEFAULT 'active_or_unknown'::"text" NOT NULL,
    "source_status" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "converted_target_table" "text",
    "converted_target_id" "uuid",
    "converted_at" timestamp with time zone,
    CONSTRAINT "legacy_records_conversion_complete" CHECK (((("converted_target_table" IS NULL) AND ("converted_target_id" IS NULL) AND ("converted_at" IS NULL)) OR (("converted_target_table" = ANY (ARRAY['inbox_items'::"text", 'tasks'::"text", 'projects'::"text", 'content_items'::"text", 'events'::"text", 'partners'::"text", 'campaigns'::"text", 'community_people'::"text", 'social_posts'::"text", 'shop_products'::"text", 'merch_launches'::"text", 'meetings'::"text"])) AND ("converted_target_id" IS NOT NULL) AND ("converted_at" IS NOT NULL))))
);


ALTER TABLE "public"."legacy_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mailing_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "public_slug" "text",
    "public_signup_enabled" boolean DEFAULT false NOT NULL,
    CONSTRAINT "mailing_lists_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 180))),
    CONSTRAINT "mailing_lists_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."mailing_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mailing_subscribers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "mailing_list_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text",
    "status" "text" DEFAULT 'subscribed'::"text" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "consent_basis" "text" NOT NULL,
    "consent_at" timestamp with time zone,
    "unsubscribed_at" timestamp with time zone,
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "consent_version" "text",
    "consent_source" "text",
    "confirmed_at" timestamp with time zone,
    CONSTRAINT "mailing_subscribers_check" CHECK ((("status" <> 'subscribed'::"text") OR ("consent_at" IS NOT NULL))),
    CONSTRAINT "mailing_subscribers_consent_basis_check" CHECK (("consent_basis" = ANY (ARRAY['consent'::"text", 'existing_relationship'::"text", 'legitimate_interest'::"text", 'internal'::"text"]))),
    CONSTRAINT "mailing_subscribers_email_check" CHECK ((("char_length"("email") >= 5) AND ("char_length"("email") <= 320))),
    CONSTRAINT "mailing_subscribers_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'import'::"text", 'form'::"text", 'event'::"text", 'partner'::"text", 'community'::"text"]))),
    CONSTRAINT "mailing_subscribers_status_check" CHECK (("status" = ANY (ARRAY['subscribed'::"text", 'unsubscribed'::"text", 'bounced'::"text"])))
);


ALTER TABLE "public"."mailing_subscribers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meeting_action_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "meeting_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "assignee_text" "text",
    "status" "text" DEFAULT 'todo'::"text" NOT NULL,
    "task_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meeting_action_items_status_check" CHECK (("status" = ANY (ARRAY['todo'::"text", 'doing'::"text", 'done'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "meeting_action_items_title_check" CHECK ((("char_length"("title") >= 2) AND ("char_length"("title") <= 500)))
);


ALTER TABLE "public"."meeting_action_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "meeting_type" "text" DEFAULT 'workgroup'::"text" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "meeting_at" timestamp with time zone,
    "attendees" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text",
    "decisions" "text",
    "action_points" "text",
    "minutes_url" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    CONSTRAINT "meetings_end_after_start_check" CHECK ((("ends_at" IS NULL) OR ("meeting_at" IS NULL) OR ("ends_at" > "meeting_at"))),
    CONSTRAINT "meetings_meeting_type_check" CHECK (("meeting_type" = ANY (ARRAY['board'::"text", 'general_assembly'::"text", 'workgroup'::"text", 'project'::"text", 'partner'::"text", 'other'::"text"]))),
    CONSTRAINT "meetings_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'confirmed'::"text", 'completed'::"text", 'cancelled'::"text", 'archived'::"text"]))),
    CONSTRAINT "meetings_title_check" CHECK ((("char_length"("title") >= 3) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."meetings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."merch_launches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "collection_name" "text",
    "status" "text" DEFAULT 'idea'::"text" NOT NULL,
    "launch_date" "date",
    "timing" "text",
    "description" "text",
    "drive_url" "text",
    "owner_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "project_id" "uuid",
    "campaign_id" "uuid",
    "partner_id" "uuid",
    CONSTRAINT "merch_launches_status_check" CHECK (("status" = ANY (ARRAY['idea'::"text", 'planning'::"text", 'production'::"text", 'scheduled'::"text", 'live'::"text", 'completed'::"text", 'cancelled'::"text", 'archived'::"text"]))),
    CONSTRAINT "merch_launches_title_check" CHECK ((("char_length"("title") >= 3) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."merch_launches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."migration_source_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "source_system" "text" NOT NULL,
    "source_workspace" "text",
    "source_board_id" "text",
    "source_item_id" "text" NOT NULL,
    "target_table" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "source_url" "text",
    "source_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "imported_by" "uuid" NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "migration_source_links_target_table_check" CHECK (("target_table" = ANY (ARRAY['projects'::"text", 'inbox_items'::"text", 'tasks'::"text", 'legacy_records'::"text", 'content_items'::"text", 'events'::"text", 'partners'::"text", 'campaigns'::"text", 'community_people'::"text", 'social_posts'::"text", 'shop_products'::"text", 'merch_launches'::"text", 'meetings'::"text"])))
);


ALTER TABLE "public"."migration_source_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."newsletters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "mailing_list_id" "uuid" NOT NULL,
    "email_template_id" "uuid",
    "title" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body_text" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "recipient_count" integer DEFAULT 0 NOT NULL,
    "recipient_snapshot" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "gmail_draft_id" "text",
    "gmail_message_id" "text",
    "gmail_thread_id" "text",
    "created_by" "uuid" NOT NULL,
    "approved_by" "uuid",
    "sent_by" "uuid",
    "approved_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_variant" "text" DEFAULT 'besc'::"text" NOT NULL,
    "preheader" "text",
    "hero_image_url" "text",
    "hero_image_alt" "text",
    "body_html" "text",
    CONSTRAINT "newsletters_body_text_check" CHECK ((("char_length"("body_text") >= 2) AND ("char_length"("body_text") <= 30000))),
    CONSTRAINT "newsletters_recipient_count_check" CHECK ((("recipient_count" >= 0) AND ("recipient_count" <= 100))),
    CONSTRAINT "newsletters_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_approval'::"text", 'changes_requested'::"text", 'approved'::"text", 'sent'::"text", 'rejected'::"text", 'failed'::"text"]))),
    CONSTRAINT "newsletters_subject_check" CHECK ((("char_length"("subject") >= 2) AND ("char_length"("subject") <= 300))),
    CONSTRAINT "newsletters_template_variant_check" CHECK (("template_variant" = ANY (ARRAY['besc'::"text", 'event'::"text", 'partner'::"text", 'compact'::"text"]))),
    CONSTRAINT "newsletters_title_check" CHECK ((("char_length"("title") >= 2) AND ("char_length"("title") <= 240)))
);


ALTER TABLE "public"."newsletters" OWNER TO "postgres";


COMMENT ON COLUMN "public"."newsletters"."body_html" IS 'Door de server gegenereerde, gecontroleerde HTML-snapshot; geen vrij ingevoerde HTML.';



CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "deadline_notifications" boolean DEFAULT true NOT NULL,
    "assignment_notifications" boolean DEFAULT true NOT NULL,
    "daily_digest" boolean DEFAULT true NOT NULL,
    "weekly_digest" boolean DEFAULT true NOT NULL,
    "reminder_days" integer[] DEFAULT ARRAY[1, 3, 7] NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "follow_up_notifications" boolean DEFAULT true NOT NULL,
    CONSTRAINT "notification_preferences_reminder_days_check" CHECK ((("array_length"("reminder_days", 1) IS NULL) OR ("reminder_days" <@ ARRAY[1, 2, 3, 5, 7, 14, 30])))
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "entity_type" "public"."entity_kind",
    "entity_id" "uuid",
    "href" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "dedupe_key" "text",
    CONSTRAINT "notifications_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'urgent'::"text"]))),
    CONSTRAINT "notifications_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_access_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "base_role" "public"."member_role" DEFAULT 'volunteer'::"public"."member_role" NOT NULL,
    "finance_role" "text" DEFAULT 'none'::"text" NOT NULL,
    "capabilities" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "organization_access_roles_finance_role_check" CHECK (("finance_role" = ANY (ARRAY['none'::"text", 'submitter'::"text", 'approver'::"text", 'treasurer'::"text"])))
);


ALTER TABLE "public"."organization_access_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."member_role" DEFAULT 'volunteer'::"public"."member_role" NOT NULL,
    "status" "public"."member_status" DEFAULT 'pending'::"public"."member_status" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finance_role" "text" DEFAULT 'none'::"text" NOT NULL,
    "access_role_id" "uuid",
    CONSTRAINT "organization_members_finance_role_check" CHECK (("finance_role" = ANY (ARRAY['none'::"text", 'submitter'::"text", 'approver'::"text", 'treasurer'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finance_drive_url" "text"
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partner_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "partner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "role_title" "text",
    "email" "text",
    "phone" "text",
    "is_primary" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "partner_contacts_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 180)))
);


ALTER TABLE "public"."partner_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partner_interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "partner_id" "uuid" NOT NULL,
    "interaction_type" "text" DEFAULT 'note'::"text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "summary" "text" NOT NULL,
    "next_action" "text",
    "follow_up_date" "date",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "partner_interactions_interaction_type_check" CHECK (("interaction_type" = ANY (ARRAY['email'::"text", 'call'::"text", 'meeting'::"text", 'note'::"text", 'proposal'::"text", 'contract'::"text"]))),
    CONSTRAINT "partner_interactions_summary_check" CHECK ((("char_length"("summary") >= 2) AND ("char_length"("summary") <= 5000)))
);


ALTER TABLE "public"."partner_interactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "partner_type" "text" DEFAULT 'partner'::"text" NOT NULL,
    "status" "text" DEFAULT 'prospect'::"text" NOT NULL,
    "priority" "public"."priority_level" DEFAULT 'normal'::"public"."priority_level" NOT NULL,
    "contact_name" "text",
    "email" "text",
    "website" "text",
    "sector" "text",
    "collaboration_type" "text",
    "estimated_value" numeric(12,2),
    "last_contact" "date",
    "next_follow_up" "date",
    "drive_url" "text",
    "notes" "text",
    "owner_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "contract_url" "text",
    "agreement_summary" "text",
    CONSTRAINT "partners_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 180))),
    CONSTRAINT "partners_partner_type_check" CHECK (("partner_type" = ANY (ARRAY['sponsor'::"text", 'partner'::"text", 'supplier'::"text", 'event_partner'::"text", 'media'::"text", 'community'::"text", 'studio'::"text", 'venue'::"text"]))),
    CONSTRAINT "partners_status_check" CHECK (("status" = ANY (ARRAY['prospect'::"text", 'contact'::"text", 'waiting'::"text", 'conversation'::"text", 'proposal'::"text", 'active'::"text", 'inactive'::"text", 'rejected'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."partners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portal_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "access_type" "text" NOT NULL,
    "partner_id" "uuid",
    "community_person_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "portal_access_access_type_check" CHECK (("access_type" = ANY (ARRAY['sponsor'::"text", 'streamer'::"text"]))),
    CONSTRAINT "portal_access_check" CHECK (((("access_type" = 'sponsor'::"text") AND ("partner_id" IS NOT NULL) AND ("community_person_id" IS NULL)) OR (("access_type" = 'streamer'::"text") AND ("community_person_id" IS NOT NULL) AND ("partner_id" IS NULL)))),
    CONSTRAINT "portal_access_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."portal_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "pronouns" "text",
    "bio" "text",
    "location" "text",
    "preferred_language" "text" DEFAULT 'nl'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'Europe/Brussels'::"text" NOT NULL,
    "website_url" "text",
    "discord_user_id" "text",
    "discord_username" "text",
    "discord_avatar_url" "text",
    "theme_preference" "text" DEFAULT 'system'::"text" NOT NULL,
    CONSTRAINT "profiles_bio_length" CHECK ((("bio" IS NULL) OR ("char_length"("bio") <= 1200))),
    CONSTRAINT "profiles_discord_avatar_url_length" CHECK ((("discord_avatar_url" IS NULL) OR ("char_length"("discord_avatar_url") <= 500))),
    CONSTRAINT "profiles_discord_user_id_length" CHECK ((("discord_user_id" IS NULL) OR ("char_length"("discord_user_id") <= 100))),
    CONSTRAINT "profiles_discord_username_length" CHECK ((("discord_username" IS NULL) OR ("char_length"("discord_username") <= 180))),
    CONSTRAINT "profiles_first_name_length" CHECK ((("first_name" IS NULL) OR ("char_length"("first_name") <= 100))),
    CONSTRAINT "profiles_last_name_length" CHECK ((("last_name" IS NULL) OR ("char_length"("last_name") <= 100))),
    CONSTRAINT "profiles_location_length" CHECK ((("location" IS NULL) OR ("char_length"("location") <= 180))),
    CONSTRAINT "profiles_preferred_language_allowed" CHECK (("preferred_language" = ANY (ARRAY['nl'::"text", 'fr'::"text", 'en'::"text"]))),
    CONSTRAINT "profiles_pronouns_length" CHECK ((("pronouns" IS NULL) OR ("char_length"("pronouns") <= 80))),
    CONSTRAINT "profiles_theme_preference_check" CHECK (("theme_preference" = ANY (ARRAY['system'::"text", 'light'::"text", 'dark'::"text"]))),
    CONSTRAINT "profiles_timezone_length" CHECK ((("char_length"("timezone") >= 1) AND ("char_length"("timezone") <= 100))),
    CONSTRAINT "profiles_website_url_length" CHECK ((("website_url" IS NULL) OR ("char_length"("website_url") <= 500)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_members" (
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_milestones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "due_date" "date",
    "is_done" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_milestones_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."project_milestones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "public"."project_status" DEFAULT 'idea'::"public"."project_status" NOT NULL,
    "priority" "public"."priority_level" DEFAULT 'normal'::"public"."priority_level" NOT NULL,
    "owner_id" "uuid",
    "start_date" "date",
    "due_date" "date",
    "drive_url" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."record_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "url" "text" NOT NULL,
    "link_type" "text" DEFAULT 'reference'::"text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "record_links_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['project'::"text", 'event'::"text", 'campaign'::"text", 'content'::"text", 'partner'::"text", 'community_person'::"text", 'social_post'::"text", 'meeting'::"text", 'task'::"text", 'shop_product'::"text", 'merch_launch'::"text", 'administration'::"text", 'finance'::"text"]))),
    CONSTRAINT "record_links_label_check" CHECK ((("char_length"(TRIM(BOTH FROM "label")) >= 1) AND ("char_length"(TRIM(BOTH FROM "label")) <= 120))),
    CONSTRAINT "record_links_link_type_check" CHECK (("link_type" = ANY (ARRAY['reference'::"text", 'publication'::"text", 'briefing'::"text", 'document'::"text", 'website'::"text", 'other'::"text"]))),
    CONSTRAINT "record_links_position_check" CHECK (("position" >= 0)),
    CONSTRAINT "record_links_url_check" CHECK (("url" ~ '^https?://'::"text"))
);


ALTER TABLE "public"."record_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."record_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "relationship_type" "text" DEFAULT 'related'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "record_relationships_check" CHECK ((("source_type" <> "target_type") OR ("source_id" <> "target_id"))),
    CONSTRAINT "record_relationships_relationship_type_check" CHECK ((("char_length"(TRIM(BOTH FROM "relationship_type")) >= 1) AND ("char_length"(TRIM(BOTH FROM "relationship_type")) <= 80))),
    CONSTRAINT "record_relationships_source_type_check" CHECK (("source_type" = ANY (ARRAY['project'::"text", 'event'::"text", 'campaign'::"text", 'content'::"text", 'partner'::"text", 'community_person'::"text", 'social_post'::"text", 'meeting'::"text", 'task'::"text", 'shop_product'::"text", 'merch_launch'::"text", 'administration'::"text", 'finance'::"text"]))),
    CONSTRAINT "record_relationships_target_type_check" CHECK (("target_type" = ANY (ARRAY['project'::"text", 'event'::"text", 'campaign'::"text", 'content'::"text", 'partner'::"text", 'community_person'::"text", 'social_post'::"text", 'meeting'::"text", 'task'::"text", 'shop_product'::"text", 'merch_launch'::"text", 'administration'::"text", 'finance'::"text"])))
);


ALTER TABLE "public"."record_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module" "text" NOT NULL,
    "name" "text" NOT NULL,
    "query_params" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "saved_views_module_check" CHECK (("module" = ANY (ARRAY['inbox'::"text", 'tasks'::"text", 'projects'::"text", 'content'::"text", 'events'::"text", 'sponsors'::"text", 'campagnes'::"text", 'community'::"text", 'social'::"text", 'historiek'::"text"]))),
    CONSTRAINT "saved_views_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 80))),
    CONSTRAINT "saved_views_query_params_check" CHECK (("jsonb_typeof"("query_params") = 'object'::"text"))
);


ALTER TABLE "public"."saved_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shop_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "product_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "status" "text" DEFAULT 'idea'::"text" NOT NULL,
    "price" numeric(12,2),
    "style" "text",
    "platforms" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "description" "text",
    "asset_url" "text",
    "shop_url" "text",
    "owner_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "product_family" "text" DEFAULT 'stream_graphics'::"text" NOT NULL,
    "supplier_id" "uuid",
    "producer_id" "uuid",
    "project_id" "uuid",
    "campaign_id" "uuid",
    CONSTRAINT "shop_products_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 180))),
    CONSTRAINT "shop_products_price_check" CHECK ((("price" IS NULL) OR ("price" >= (0)::numeric))),
    CONSTRAINT "shop_products_product_family_check" CHECK (("product_family" = ANY (ARRAY['stream_graphics'::"text", 'merchandise'::"text"]))),
    CONSTRAINT "shop_products_product_type_check" CHECK (("product_type" = ANY (ARRAY['emote'::"text", 'overlay'::"text", 'alert'::"text", 'panel'::"text", 'bundle'::"text", 'merch'::"text", 'digital'::"text", 'other'::"text"]))),
    CONSTRAINT "shop_products_status_check" CHECK (("status" = ANY (ARRAY['idea'::"text", 'design'::"text", 'ready'::"text", 'published'::"text", 'paused'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."shop_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "external_account_id" "text",
    "account_name" "text" NOT NULL,
    "account_type" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "granted_scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "sync_enabled" boolean DEFAULT false NOT NULL,
    "sync_interval_minutes" integer DEFAULT 1440 NOT NULL,
    "retention_days" integer DEFAULT 730 NOT NULL,
    "token_expires_at" timestamp with time zone,
    "last_sync_at" timestamp with time zone,
    "last_error" "text",
    "connected_by" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "quota_daily_limit" integer DEFAULT 10000 NOT NULL,
    "quota_used_estimate" integer DEFAULT 0 NOT NULL,
    "quota_counter_date" "date",
    "quota_warning_percent" integer DEFAULT 80 NOT NULL,
    CONSTRAINT "social_accounts_account_name_check" CHECK ((("char_length"("account_name") >= 2) AND ("char_length"("account_name") <= 180))),
    CONSTRAINT "social_accounts_platform_check" CHECK (("platform" = ANY (ARRAY['youtube'::"text", 'facebook'::"text", 'instagram'::"text", 'threads'::"text", 'twitch'::"text", 'linkedin'::"text", 'tiktok'::"text", 'x'::"text"]))),
    CONSTRAINT "social_accounts_quota_daily_limit_check" CHECK ((("quota_daily_limit" >= 1) AND ("quota_daily_limit" <= 10000000))),
    CONSTRAINT "social_accounts_quota_used_estimate_check" CHECK (("quota_used_estimate" >= 0)),
    CONSTRAINT "social_accounts_quota_warning_percent_check" CHECK ((("quota_warning_percent" >= 1) AND ("quota_warning_percent" <= 100))),
    CONSTRAINT "social_accounts_retention_days_check" CHECK ((("retention_days" >= 30) AND ("retention_days" <= 3650))),
    CONSTRAINT "social_accounts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'connected'::"text", 'expired'::"text", 'error'::"text", 'disabled'::"text", 'disconnected'::"text"]))),
    CONSTRAINT "social_accounts_sync_interval_minutes_check" CHECK ((("sync_interval_minutes" >= 15) AND ("sync_interval_minutes" <= 43200)))
);


ALTER TABLE "public"."social_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_metric_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "social_account_id" "uuid" NOT NULL,
    "sync_run_id" "uuid" NOT NULL,
    "social_post_id" "uuid",
    "external_content_id" "text" DEFAULT ''::"text" NOT NULL,
    "platform_metric" "text" NOT NULL,
    "normalized_metric" "text" NOT NULL,
    "metric_value" numeric NOT NULL,
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_url" "text",
    "source_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."social_metric_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_post_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "social_post_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "status" "text" DEFAULT 'idea'::"text" NOT NULL,
    "copy" "text",
    "hashtags" "text",
    "call_to_action" "text",
    "scheduled_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "planning_url" "text",
    "publication_url" "text",
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_post_variants_platform_check" CHECK (("platform" = ANY (ARRAY['Discord'::"text", 'Twitch'::"text", 'YouTube'::"text", 'TikTok'::"text", 'Instagram'::"text", 'Facebook'::"text", 'X'::"text", 'Threads'::"text", 'LinkedIn'::"text", 'Blogger'::"text", 'Website'::"text", 'Nieuwsbrief'::"text"]))),
    CONSTRAINT "social_post_variants_status_check" CHECK (("status" = ANY (ARRAY['idea'::"text", 'copy_needed'::"text", 'visual_needed'::"text", 'review'::"text", 'approved'::"text", 'scheduled'::"text", 'published'::"text", 'repurpose'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."social_post_variants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "content_id" "uuid",
    "campaign_id" "uuid",
    "event_id" "uuid",
    "partner_id" "uuid",
    "title" "text" NOT NULL,
    "platform" "text" DEFAULT 'Discord'::"text",
    "post_type" "text" DEFAULT 'publication'::"text" NOT NULL,
    "status" "text" DEFAULT 'idea'::"text" NOT NULL,
    "copy" "text",
    "hashtags" "text",
    "call_to_action" "text",
    "scheduled_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "canva_url" "text",
    "planning_url" "text",
    "publication_url" "text",
    "notes" "text",
    "owner_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "bundle_kind" "text" DEFAULT 'single'::"text" NOT NULL,
    CONSTRAINT "social_posts_bundle_kind_check" CHECK (("bundle_kind" = ANY (ARRAY['single'::"text", 'bundle'::"text"]))),
    CONSTRAINT "social_posts_platform_check" CHECK (("platform" = ANY (ARRAY['Discord'::"text", 'Twitch'::"text", 'YouTube'::"text", 'TikTok'::"text", 'Instagram'::"text", 'Facebook'::"text", 'X'::"text", 'Threads'::"text", 'LinkedIn'::"text", 'Blogger'::"text", 'Website'::"text", 'Nieuwsbrief'::"text"]))),
    CONSTRAINT "social_posts_post_type_check" CHECK (("post_type" = ANY (ARRAY['teaser'::"text", 'publication'::"text", 'reminder'::"text", 'follow_up'::"text", 'recap'::"text", 'clip'::"text", 'story'::"text", 'carousel'::"text", 'community'::"text", 'partner'::"text"]))),
    CONSTRAINT "social_posts_status_check" CHECK (("status" = ANY (ARRAY['idea'::"text", 'copy_needed'::"text", 'visual_needed'::"text", 'review'::"text", 'approved'::"text", 'scheduled'::"text", 'published'::"text", 'repurpose'::"text", 'archived'::"text"]))),
    CONSTRAINT "social_posts_title_check" CHECK ((("char_length"("title") >= 3) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."social_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "social_account_id" "uuid" NOT NULL,
    "trigger_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "cursor_value" "text",
    "records_read" integer DEFAULT 0 NOT NULL,
    "records_written" integer DEFAULT 0 NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "error_message" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_sync_runs_records_read_check" CHECK (("records_read" >= 0)),
    CONSTRAINT "social_sync_runs_records_written_check" CHECK (("records_written" >= 0)),
    CONSTRAINT "social_sync_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'succeeded'::"text", 'partial'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "social_sync_runs_trigger_type_check" CHECK (("trigger_type" = ANY (ARRAY['manual'::"text", 'scheduled'::"text", 'oauth'::"text", 'backfill'::"text"])))
);


ALTER TABLE "public"."social_sync_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_assignees" (
    "task_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."task_assignees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_checklist_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "is_done" boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "task_checklist_items_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 240)))
);


ALTER TABLE "public"."task_checklist_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "source_inbox_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "public"."task_status" DEFAULT 'todo'::"public"."task_status" NOT NULL,
    "priority" "public"."priority_level" DEFAULT 'normal'::"public"."priority_level" NOT NULL,
    "due_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "content_id" "uuid"
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


ALTER TABLE ONLY "private"."newsletter_subscription_requests"
    ADD CONSTRAINT "newsletter_subscription_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."newsletter_subscription_requests"
    ADD CONSTRAINT "newsletter_subscription_requests_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "private"."newsletter_unsubscribe_requests"
    ADD CONSTRAINT "newsletter_unsubscribe_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."newsletter_unsubscribe_requests"
    ADD CONSTRAINT "newsletter_unsubscribe_requests_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "private"."social_account_credentials"
    ADD CONSTRAINT "social_account_credentials_pkey" PRIMARY KEY ("social_account_id");



ALTER TABLE ONLY "public"."acceptance_check_results"
    ADD CONSTRAINT "acceptance_check_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."acceptance_check_results"
    ADD CONSTRAINT "acceptance_check_results_run_id_check_key_key" UNIQUE ("run_id", "check_key");



ALTER TABLE ONLY "public"."acceptance_runs"
    ADD CONSTRAINT "acceptance_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_events"
    ADD CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."administrative_documents"
    ADD CONSTRAINT "administrative_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_generations"
    ADD CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_prompt_templates"
    ADD CONSTRAINT "ai_prompt_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."association_members"
    ADD CONSTRAINT "association_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budget_envelopes"
    ADD CONSTRAINT "budget_envelopes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_deliverables"
    ADD CONSTRAINT "campaign_deliverables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_assignments"
    ADD CONSTRAINT "community_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_onboarding_items"
    ADD CONSTRAINT "community_onboarding_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_people"
    ADD CONSTRAINT "community_people_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_person_roles"
    ADD CONSTRAINT "community_person_roles_pkey" PRIMARY KEY ("person_id", "role");



ALTER TABLE ONLY "public"."compliance_deadlines"
    ADD CONSTRAINT "compliance_deadlines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_items"
    ADD CONSTRAINT "content_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_communications"
    ADD CONSTRAINT "email_communications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_settings"
    ADD CONSTRAINT "finance_settings_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."financial_audit_log"
    ADD CONSTRAINT "financial_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_documents"
    ADD CONSTRAINT "financial_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_resource_links"
    ADD CONSTRAINT "google_resource_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."governance_mandates"
    ADD CONSTRAINT "governance_mandates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inbox_items"
    ADD CONSTRAINT "inbox_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."income_entries"
    ADD CONSTRAINT "income_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_connections"
    ADD CONSTRAINT "integration_connections_organization_id_provider_display_na_key" UNIQUE ("organization_id", "provider", "display_name");



ALTER TABLE ONLY "public"."integration_connections"
    ADD CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_articles"
    ADD CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_categories"
    ADD CONSTRAINT "knowledge_categories_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."knowledge_categories"
    ADD CONSTRAINT "knowledge_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_revisions"
    ADD CONSTRAINT "knowledge_revisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpi_records"
    ADD CONSTRAINT "kpi_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legacy_records"
    ADD CONSTRAINT "legacy_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mailing_lists"
    ADD CONSTRAINT "mailing_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mailing_subscribers"
    ADD CONSTRAINT "mailing_subscribers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_action_items"
    ADD CONSTRAINT "meeting_action_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."merch_launches"
    ADD CONSTRAINT "merch_launches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."migration_source_links"
    ADD CONSTRAINT "migration_source_links_organization_id_source_system_source_key" UNIQUE ("organization_id", "source_system", "source_item_id", "target_table");



ALTER TABLE ONLY "public"."migration_source_links"
    ADD CONSTRAINT "migration_source_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."newsletters"
    ADD CONSTRAINT "newsletters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("organization_id", "user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_access_roles"
    ADD CONSTRAINT "organization_access_roles_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."organization_access_roles"
    ADD CONSTRAINT "organization_access_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."partner_contacts"
    ADD CONSTRAINT "partner_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_interactions"
    ADD CONSTRAINT "partner_interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portal_access"
    ADD CONSTRAINT "portal_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id", "user_id");



ALTER TABLE ONLY "public"."project_milestones"
    ADD CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."record_links"
    ADD CONSTRAINT "record_links_organization_id_entity_type_entity_id_url_key" UNIQUE ("organization_id", "entity_type", "entity_id", "url");



ALTER TABLE ONLY "public"."record_links"
    ADD CONSTRAINT "record_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."record_relationships"
    ADD CONSTRAINT "record_relationships_organization_id_source_type_source_id__key" UNIQUE ("organization_id", "source_type", "source_id", "target_type", "target_id", "relationship_type");



ALTER TABLE ONLY "public"."record_relationships"
    ADD CONSTRAINT "record_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_views"
    ADD CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_views"
    ADD CONSTRAINT "saved_views_user_id_module_name_key" UNIQUE ("user_id", "module", "name");



ALTER TABLE ONLY "public"."shop_products"
    ADD CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_metric_snapshots"
    ADD CONSTRAINT "social_metric_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_metric_snapshots"
    ADD CONSTRAINT "social_metric_snapshots_sync_run_id_external_content_id_pla_key" UNIQUE ("sync_run_id", "external_content_id", "platform_metric", "period_start", "period_end");



ALTER TABLE ONLY "public"."social_post_variants"
    ADD CONSTRAINT "social_post_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_post_variants"
    ADD CONSTRAINT "social_post_variants_social_post_id_platform_key" UNIQUE ("social_post_id", "platform");



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_sync_runs"
    ADD CONSTRAINT "social_sync_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_sync_runs"
    ADD CONSTRAINT "social_sync_runs_social_account_id_idempotency_key_key" UNIQUE ("social_account_id", "idempotency_key");



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("task_id", "user_id");



ALTER TABLE ONLY "public"."task_checklist_items"
    ADD CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



CREATE INDEX "newsletter_subscription_requests_org_list_idx" ON "private"."newsletter_subscription_requests" USING "btree" ("organization_id", "mailing_list_id");



CREATE INDEX "newsletter_subscription_requests_rate_idx" ON "private"."newsletter_subscription_requests" USING "btree" ("lower"("email"), "ip_hash", "created_at" DESC);



CREATE INDEX "newsletter_unsubscribe_requests_org_list_idx" ON "private"."newsletter_unsubscribe_requests" USING "btree" ("organization_id", "mailing_list_id");



CREATE INDEX "newsletter_unsubscribe_requests_rate_idx" ON "private"."newsletter_unsubscribe_requests" USING "btree" ("subscriber_id", "ip_hash", "created_at" DESC);



CREATE INDEX "social_account_credentials_organization_idx" ON "private"."social_account_credentials" USING "btree" ("organization_id");



CREATE INDEX "acceptance_check_results_run_idx" ON "public"."acceptance_check_results" USING "btree" ("run_id", "category", "status");



CREATE INDEX "acceptance_runs_org_started_idx" ON "public"."acceptance_runs" USING "btree" ("organization_id", "started_at" DESC);



CREATE INDEX "activity_entity_idx" ON "public"."activity_events" USING "btree" ("organization_id", "entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "administrative_documents_created_by_idx" ON "public"."administrative_documents" USING "btree" ("created_by");



CREATE INDEX "administrative_documents_org_type_status_idx" ON "public"."administrative_documents" USING "btree" ("organization_id", "document_type", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "approval_requests_decided_by_idx" ON "public"."approval_requests" USING "btree" ("decided_by") WHERE ("decided_by" IS NOT NULL);



CREATE UNIQUE INDEX "approval_requests_one_pending_idx" ON "public"."approval_requests" USING "btree" ("organization_id", "entity_type", "entity_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "approval_requests_requested_by_idx" ON "public"."approval_requests" USING "btree" ("requested_by");



CREATE INDEX "approval_requests_work_queue_idx" ON "public"."approval_requests" USING "btree" ("organization_id", "status", "requested_at" DESC);



CREATE INDEX "assets_org_status_type_idx" ON "public"."assets" USING "btree" ("organization_id", "status", "asset_type") WHERE ("deleted_at" IS NULL);



CREATE INDEX "assets_owner_idx" ON "public"."assets" USING "btree" ("owner_person_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "assets_supplier_idx" ON "public"."assets" USING "btree" ("supplier_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "association_members_created_by_idx" ON "public"."association_members" USING "btree" ("created_by");



CREATE UNIQUE INDEX "association_members_org_number_uidx" ON "public"."association_members" USING "btree" ("organization_id", "member_number") WHERE (("member_number" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "association_members_org_status_idx" ON "public"."association_members" USING "btree" ("organization_id", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "audit_log_actor_idx" ON "public"."audit_log" USING "btree" ("actor_id", "created_at" DESC) WHERE ("actor_id" IS NOT NULL);



CREATE INDEX "audit_log_org_created_idx" ON "public"."audit_log" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "audit_log_org_entity_idx" ON "public"."audit_log" USING "btree" ("organization_id", "entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "budget_envelopes_org_status_idx" ON "public"."budget_envelopes" USING "btree" ("organization_id", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "budget_envelopes_relations_idx" ON "public"."budget_envelopes" USING "btree" ("organization_id", "project_id", "event_id", "campaign_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "campaign_deliverables_assignee_idx" ON "public"."campaign_deliverables" USING "btree" ("assignee_id");



CREATE INDEX "campaign_deliverables_campaign_idx" ON "public"."campaign_deliverables" USING "btree" ("campaign_id");



CREATE INDEX "campaign_deliverables_community_person_idx" ON "public"."campaign_deliverables" USING "btree" ("community_person_id") WHERE ("community_person_id" IS NOT NULL);



CREATE INDEX "campaign_deliverables_created_by_idx" ON "public"."campaign_deliverables" USING "btree" ("created_by");



CREATE INDEX "campaign_deliverables_org_campaign_status_idx" ON "public"."campaign_deliverables" USING "btree" ("organization_id", "campaign_id", "status");



CREATE INDEX "campaigns_created_by_idx" ON "public"."campaigns" USING "btree" ("created_by") WHERE ("deleted_at" IS NULL);



CREATE INDEX "campaigns_event_idx" ON "public"."campaigns" USING "btree" ("event_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "campaigns_org_status_dates_idx" ON "public"."campaigns" USING "btree" ("organization_id", "status", "start_date", "end_date") WHERE ("deleted_at" IS NULL);



CREATE INDEX "campaigns_owner_idx" ON "public"."campaigns" USING "btree" ("owner_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "campaigns_partner_idx" ON "public"."campaigns" USING "btree" ("partner_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "campaigns_project_idx" ON "public"."campaigns" USING "btree" ("project_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "comments_entity_idx" ON "public"."comments" USING "btree" ("organization_id", "entity_type", "entity_id", "created_at");



CREATE INDEX "community_assignments_created_by_idx" ON "public"."community_assignments" USING "btree" ("created_by");



CREATE INDEX "community_assignments_event_idx" ON "public"."community_assignments" USING "btree" ("event_id");



CREATE INDEX "community_assignments_org_person_idx" ON "public"."community_assignments" USING "btree" ("organization_id", "person_id", "status");



CREATE INDEX "community_assignments_person_idx" ON "public"."community_assignments" USING "btree" ("person_id");



CREATE INDEX "community_assignments_project_idx" ON "public"."community_assignments" USING "btree" ("project_id");



CREATE INDEX "community_onboarding_created_by_idx" ON "public"."community_onboarding_items" USING "btree" ("created_by");



CREATE INDEX "community_onboarding_org_person_idx" ON "public"."community_onboarding_items" USING "btree" ("organization_id", "person_id", "completed");



CREATE INDEX "community_onboarding_person_idx" ON "public"."community_onboarding_items" USING "btree" ("person_id");



CREATE INDEX "community_onboarding_type_idx" ON "public"."community_onboarding_items" USING "btree" ("organization_id", "person_id", "item_type", "completed");



CREATE INDEX "community_people_created_by_idx" ON "public"."community_people" USING "btree" ("created_by") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "community_people_org_account_idx" ON "public"."community_people" USING "btree" ("organization_id", "account_user_id") WHERE (("account_user_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "community_people_org_status_idx" ON "public"."community_people" USING "btree" ("organization_id", "status", "person_type") WHERE ("deleted_at" IS NULL);



CREATE INDEX "community_people_owner_idx" ON "public"."community_people" USING "btree" ("owner_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "community_person_roles_created_by_idx" ON "public"."community_person_roles" USING "btree" ("created_by");



CREATE INDEX "community_person_roles_org_role_idx" ON "public"."community_person_roles" USING "btree" ("organization_id", "role", "person_id");



CREATE INDEX "compliance_deadlines_created_by_idx" ON "public"."compliance_deadlines" USING "btree" ("created_by");



CREATE INDEX "compliance_deadlines_document_idx" ON "public"."compliance_deadlines" USING "btree" ("document_id") WHERE (("document_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "compliance_deadlines_org_due_idx" ON "public"."compliance_deadlines" USING "btree" ("organization_id", "due_date", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "compliance_deadlines_responsible_idx" ON "public"."compliance_deadlines" USING "btree" ("responsible_id") WHERE (("responsible_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "content_items_campaign_idx" ON "public"."content_items" USING "btree" ("campaign_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "content_items_org_status_publication_idx" ON "public"."content_items" USING "btree" ("organization_id", "status", "publication_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "content_items_owner_idx" ON "public"."content_items" USING "btree" ("owner_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "content_items_partner_idx" ON "public"."content_items" USING "btree" ("partner_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "content_items_project_idx" ON "public"."content_items" USING "btree" ("project_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "email_communications_approved_by_idx" ON "public"."email_communications" USING "btree" ("approved_by") WHERE ("approved_by" IS NOT NULL);



CREATE INDEX "email_communications_created_by_idx" ON "public"."email_communications" USING "btree" ("created_by");



CREATE INDEX "email_communications_entity_idx" ON "public"."email_communications" USING "btree" ("organization_id", "entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "email_communications_org_status_idx" ON "public"."email_communications" USING "btree" ("organization_id", "status", "updated_at" DESC);



CREATE INDEX "email_communications_sent_by_idx" ON "public"."email_communications" USING "btree" ("sent_by") WHERE ("sent_by" IS NOT NULL);



CREATE INDEX "email_communications_template_idx" ON "public"."email_communications" USING "btree" ("email_template_id") WHERE ("email_template_id" IS NOT NULL);



CREATE INDEX "email_templates_created_by_idx" ON "public"."email_templates" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "email_templates_org_category_idx" ON "public"."email_templates" USING "btree" ("organization_id", "category", "is_active");



CREATE UNIQUE INDEX "email_templates_org_name_idx" ON "public"."email_templates" USING "btree" ("organization_id", "lower"("name"));



CREATE INDEX "events_org_start_idx" ON "public"."events" USING "btree" ("organization_id", "start_at", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "events_partner_idx" ON "public"."events" USING "btree" ("partner_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "events_project_idx" ON "public"."events" USING "btree" ("project_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "expenses_budget_idx" ON "public"."expenses" USING "btree" ("budget_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "expenses_org_status_date_idx" ON "public"."expenses" USING "btree" ("organization_id", "status", "expense_date" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "expenses_relations_idx" ON "public"."expenses" USING "btree" ("organization_id", "project_id", "event_id", "campaign_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "financial_audit_org_entity_idx" ON "public"."financial_audit_log" USING "btree" ("organization_id", "entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "financial_documents_budget_idx" ON "public"."financial_documents" USING "btree" ("budget_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "financial_documents_created_by_idx" ON "public"."financial_documents" USING "btree" ("created_by");



CREATE INDEX "financial_documents_income_idx" ON "public"."financial_documents" USING "btree" ("income_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "financial_documents_org_year_status_idx" ON "public"."financial_documents" USING "btree" ("organization_id", "fiscal_year", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "financial_documents_relations_idx" ON "public"."financial_documents" USING "btree" ("expense_id", "income_id", "budget_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "financial_documents_verified_by_idx" ON "public"."financial_documents" USING "btree" ("verified_by") WHERE ("verified_by" IS NOT NULL);



CREATE INDEX "generations_creator_idx" ON "public"."ai_generations" USING "btree" ("created_by", "created_at" DESC);



CREATE INDEX "generations_org_idx" ON "public"."ai_generations" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "google_resource_links_entity_idx" ON "public"."google_resource_links" USING "btree" ("organization_id", "entity_type", "entity_id");



CREATE UNIQUE INDEX "google_resource_links_google_id_idx" ON "public"."google_resource_links" USING "btree" ("organization_id", "google_id");



CREATE UNIQUE INDEX "google_resource_links_singleton_resource_idx" ON "public"."google_resource_links" USING "btree" ("organization_id", "entity_type", "entity_id", "resource_type") WHERE ("resource_type" = ANY (ARRAY['folder'::"text", 'calendar_event'::"text"]));



CREATE INDEX "governance_mandates_created_by_idx" ON "public"."governance_mandates" USING "btree" ("created_by");



CREATE INDEX "governance_mandates_member_idx" ON "public"."governance_mandates" USING "btree" ("member_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "governance_mandates_org_status_idx" ON "public"."governance_mandates" USING "btree" ("organization_id", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "inbox_org_status_idx" ON "public"."inbox_items" USING "btree" ("organization_id", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "income_entries_budget_idx" ON "public"."income_entries" USING "btree" ("budget_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "income_entries_org_status_date_idx" ON "public"."income_entries" USING "btree" ("organization_id", "status", "expected_date" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "integrations_org_idx" ON "public"."integration_connections" USING "btree" ("organization_id", "provider") WHERE ("deleted_at" IS NULL);



CREATE INDEX "knowledge_articles_category_idx" ON "public"."knowledge_articles" USING "btree" ("category_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "knowledge_articles_org_status_idx" ON "public"."knowledge_articles" USING "btree" ("organization_id", "status", "updated_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "knowledge_articles_org_title_active_idx" ON "public"."knowledge_articles" USING "btree" ("organization_id", "title") WHERE ("deleted_at" IS NULL);



CREATE INDEX "knowledge_articles_owner_idx" ON "public"."knowledge_articles" USING "btree" ("owner_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "knowledge_articles_review_idx" ON "public"."knowledge_articles" USING "btree" ("organization_id", "review_due_date") WHERE (("deleted_at" IS NULL) AND ("status" = 'published'::"text"));



CREATE INDEX "knowledge_categories_org_sort_idx" ON "public"."knowledge_categories" USING "btree" ("organization_id", "sort_order") WHERE ("deleted_at" IS NULL);



CREATE INDEX "knowledge_revisions_article_idx" ON "public"."knowledge_revisions" USING "btree" ("article_id", "created_at" DESC);



CREATE INDEX "kpi_records_campaign_idx" ON "public"."kpi_records" USING "btree" ("campaign_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "kpi_records_community_person_idx" ON "public"."kpi_records" USING "btree" ("community_person_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "kpi_records_content_idx" ON "public"."kpi_records" USING "btree" ("content_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "kpi_records_event_idx" ON "public"."kpi_records" USING "btree" ("event_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "kpi_records_org_period_idx" ON "public"."kpi_records" USING "btree" ("organization_id", "period_end" DESC, "domain") WHERE ("deleted_at" IS NULL);



CREATE INDEX "kpi_records_partner_idx" ON "public"."kpi_records" USING "btree" ("partner_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "kpi_records_project_idx" ON "public"."kpi_records" USING "btree" ("project_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "kpi_records_social_post_idx" ON "public"."kpi_records" USING "btree" ("social_post_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "kpi_records_task_idx" ON "public"."kpi_records" USING "btree" ("task_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "legacy_records_conversion_idx" ON "public"."legacy_records" USING "btree" ("organization_id", "converted_target_table", "converted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "legacy_records_created_by_idx" ON "public"."legacy_records" USING "btree" ("created_by");



CREATE INDEX "legacy_records_org_module_idx" ON "public"."legacy_records" USING "btree" ("organization_id", "suggested_module", "lifecycle") WHERE ("deleted_at" IS NULL);



CREATE INDEX "mailing_lists_created_by_idx" ON "public"."mailing_lists" USING "btree" ("created_by");



CREATE UNIQUE INDEX "mailing_lists_org_name_idx" ON "public"."mailing_lists" USING "btree" ("organization_id", "lower"("name"));



CREATE UNIQUE INDEX "mailing_lists_public_slug_idx" ON "public"."mailing_lists" USING "btree" ("lower"("public_slug")) WHERE ("public_slug" IS NOT NULL);



CREATE INDEX "mailing_subscribers_created_by_idx" ON "public"."mailing_subscribers" USING "btree" ("created_by");



CREATE UNIQUE INDEX "mailing_subscribers_list_email_idx" ON "public"."mailing_subscribers" USING "btree" ("mailing_list_id", "lower"("email"));



CREATE INDEX "mailing_subscribers_org_status_idx" ON "public"."mailing_subscribers" USING "btree" ("organization_id", "status");



CREATE INDEX "meeting_action_items_meeting_idx" ON "public"."meeting_action_items" USING "btree" ("organization_id", "meeting_id", "status");



CREATE INDEX "meeting_action_items_task_idx" ON "public"."meeting_action_items" USING "btree" ("task_id");



CREATE INDEX "meetings_org_date_idx" ON "public"."meetings" USING "btree" ("organization_id", "meeting_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "merch_launches_org_status_date_idx" ON "public"."merch_launches" USING "btree" ("organization_id", "status", "launch_date") WHERE ("deleted_at" IS NULL);



CREATE INDEX "merch_launches_owner_idx" ON "public"."merch_launches" USING "btree" ("owner_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "merch_launches_project_campaign_idx" ON "public"."merch_launches" USING "btree" ("project_id", "campaign_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "migration_source_links_imported_by_idx" ON "public"."migration_source_links" USING "btree" ("imported_by");



CREATE INDEX "migration_source_links_source_idx" ON "public"."migration_source_links" USING "btree" ("organization_id", "source_system", "source_board_id", "source_item_id");



CREATE INDEX "migration_source_links_target_idx" ON "public"."migration_source_links" USING "btree" ("target_table", "target_id");



CREATE INDEX "newsletters_approved_by_idx" ON "public"."newsletters" USING "btree" ("approved_by") WHERE ("approved_by" IS NOT NULL);



CREATE INDEX "newsletters_created_by_idx" ON "public"."newsletters" USING "btree" ("created_by");



CREATE INDEX "newsletters_list_idx" ON "public"."newsletters" USING "btree" ("mailing_list_id", "created_at" DESC);



CREATE INDEX "newsletters_org_status_idx" ON "public"."newsletters" USING "btree" ("organization_id", "status", "updated_at" DESC);



CREATE INDEX "newsletters_sent_by_idx" ON "public"."newsletters" USING "btree" ("sent_by") WHERE ("sent_by" IS NOT NULL);



CREATE INDEX "newsletters_template_idx" ON "public"."newsletters" USING "btree" ("email_template_id") WHERE ("email_template_id" IS NOT NULL);



CREATE UNIQUE INDEX "notifications_user_dedupe_uidx" ON "public"."notifications" USING "btree" ("user_id", "dedupe_key") WHERE ("dedupe_key" IS NOT NULL);



CREATE INDEX "notifications_user_unread_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC) WHERE ("read_at" IS NULL);



CREATE INDEX "organization_access_roles_org_idx" ON "public"."organization_access_roles" USING "btree" ("organization_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "partner_contacts_created_by_idx" ON "public"."partner_contacts" USING "btree" ("created_by");



CREATE UNIQUE INDEX "partner_contacts_one_primary_idx" ON "public"."partner_contacts" USING "btree" ("partner_id") WHERE "is_primary";



CREATE INDEX "partner_contacts_org_partner_idx" ON "public"."partner_contacts" USING "btree" ("organization_id", "partner_id");



CREATE INDEX "partner_interactions_created_by_idx" ON "public"."partner_interactions" USING "btree" ("created_by");



CREATE INDEX "partner_interactions_org_partner_date_idx" ON "public"."partner_interactions" USING "btree" ("organization_id", "partner_id", "occurred_at" DESC);



CREATE INDEX "partner_interactions_partner_idx" ON "public"."partner_interactions" USING "btree" ("partner_id");



CREATE INDEX "partners_created_by_idx" ON "public"."partners" USING "btree" ("created_by") WHERE ("deleted_at" IS NULL);



CREATE INDEX "partners_org_status_followup_idx" ON "public"."partners" USING "btree" ("organization_id", "status", "next_follow_up") WHERE ("deleted_at" IS NULL);



CREATE INDEX "partners_owner_idx" ON "public"."partners" USING "btree" ("owner_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "portal_access_org_status_idx" ON "public"."portal_access" USING "btree" ("organization_id", "status");



CREATE UNIQUE INDEX "portal_access_unique_sponsor" ON "public"."portal_access" USING "btree" ("user_id", "partner_id") WHERE ("partner_id" IS NOT NULL);



CREATE UNIQUE INDEX "portal_access_unique_streamer" ON "public"."portal_access" USING "btree" ("user_id", "community_person_id") WHERE ("community_person_id" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_discord_user_id_unique_idx" ON "public"."profiles" USING "btree" ("discord_user_id") WHERE ("discord_user_id" IS NOT NULL);



CREATE INDEX "project_members_user_idx" ON "public"."project_members" USING "btree" ("user_id");



CREATE INDEX "project_milestones_project_due_idx" ON "public"."project_milestones" USING "btree" ("project_id", "due_date");



CREATE INDEX "projects_org_status_idx" ON "public"."projects" USING "btree" ("organization_id", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "prompts_org_idx" ON "public"."ai_prompt_templates" USING "btree" ("organization_id", "status", "category") WHERE ("deleted_at" IS NULL);



CREATE INDEX "record_links_created_by_idx" ON "public"."record_links" USING "btree" ("created_by");



CREATE INDEX "record_links_entity_idx" ON "public"."record_links" USING "btree" ("organization_id", "entity_type", "entity_id", "position", "created_at");



CREATE INDEX "record_relationships_created_by_idx" ON "public"."record_relationships" USING "btree" ("created_by");



CREATE INDEX "record_relationships_source_idx" ON "public"."record_relationships" USING "btree" ("organization_id", "source_type", "source_id", "created_at");



CREATE INDEX "record_relationships_target_idx" ON "public"."record_relationships" USING "btree" ("organization_id", "target_type", "target_id", "created_at");



CREATE INDEX "saved_views_user_module_idx" ON "public"."saved_views" USING "btree" ("user_id", "module", "created_at" DESC);



CREATE INDEX "shop_products_org_status_idx" ON "public"."shop_products" USING "btree" ("organization_id", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "shop_products_owner_idx" ON "public"."shop_products" USING "btree" ("owner_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "shop_products_producer_idx" ON "public"."shop_products" USING "btree" ("producer_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "shop_products_supplier_idx" ON "public"."shop_products" USING "btree" ("supplier_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "social_accounts_connected_by_idx" ON "public"."social_accounts" USING "btree" ("connected_by") WHERE ("connected_by" IS NOT NULL);



CREATE INDEX "social_accounts_created_by_idx" ON "public"."social_accounts" USING "btree" ("created_by");



CREATE UNIQUE INDEX "social_accounts_external_idx" ON "public"."social_accounts" USING "btree" ("organization_id", "platform", "external_account_id") WHERE (("external_account_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "social_accounts_org_status_idx" ON "public"."social_accounts" USING "btree" ("organization_id", "platform", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "social_metrics_account_idx" ON "public"."social_metric_snapshots" USING "btree" ("social_account_id", "fetched_at" DESC);



CREATE INDEX "social_metrics_org_metric_idx" ON "public"."social_metric_snapshots" USING "btree" ("organization_id", "normalized_metric", "period_end" DESC);



CREATE INDEX "social_metrics_post_idx" ON "public"."social_metric_snapshots" USING "btree" ("social_post_id") WHERE ("social_post_id" IS NOT NULL);



CREATE INDEX "social_post_variants_created_by_idx" ON "public"."social_post_variants" USING "btree" ("created_by");



CREATE INDEX "social_post_variants_org_post_idx" ON "public"."social_post_variants" USING "btree" ("organization_id", "social_post_id");



CREATE INDEX "social_post_variants_schedule_idx" ON "public"."social_post_variants" USING "btree" ("organization_id", "scheduled_at") WHERE ("status" <> 'archived'::"text");



CREATE INDEX "social_posts_campaign_idx" ON "public"."social_posts" USING "btree" ("campaign_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "social_posts_content_idx" ON "public"."social_posts" USING "btree" ("content_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "social_posts_created_by_idx" ON "public"."social_posts" USING "btree" ("created_by") WHERE ("deleted_at" IS NULL);



CREATE INDEX "social_posts_event_idx" ON "public"."social_posts" USING "btree" ("event_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "social_posts_org_status_schedule_idx" ON "public"."social_posts" USING "btree" ("organization_id", "status", "scheduled_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "social_posts_owner_idx" ON "public"."social_posts" USING "btree" ("owner_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "social_posts_partner_idx" ON "public"."social_posts" USING "btree" ("partner_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "social_sync_runs_account_idx" ON "public"."social_sync_runs" USING "btree" ("social_account_id", "created_at" DESC);



CREATE INDEX "social_sync_runs_created_by_idx" ON "public"."social_sync_runs" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "social_sync_runs_org_status_idx" ON "public"."social_sync_runs" USING "btree" ("organization_id", "status", "created_at" DESC);



CREATE INDEX "task_checklist_task_position_idx" ON "public"."task_checklist_items" USING "btree" ("task_id", "position");



CREATE INDEX "tasks_content_idx" ON "public"."tasks" USING "btree" ("content_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "tasks_org_status_due_idx" ON "public"."tasks" USING "btree" ("organization_id", "status", "due_at") WHERE ("deleted_at" IS NULL);



CREATE OR REPLACE TRIGGER "audit_administrative_documents_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."administrative_documents" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_ai_prompt_templates_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."ai_prompt_templates" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_association_members_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."association_members" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_budget_change" AFTER INSERT OR UPDATE ON "public"."budget_envelopes" FOR EACH ROW EXECUTE FUNCTION "private"."log_financial_change"();



CREATE OR REPLACE TRIGGER "audit_budget_envelopes_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."budget_envelopes" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_campaigns_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_community_people_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."community_people" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_compliance_deadlines_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."compliance_deadlines" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_content_items_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."content_items" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_events_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_expense_change" AFTER INSERT OR UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "private"."log_financial_change"();



CREATE OR REPLACE TRIGGER "audit_expenses_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_financial_documents_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."financial_documents" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_governance_mandates_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."governance_mandates" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_inbox_items_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."inbox_items" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_income_change" AFTER INSERT OR UPDATE ON "public"."income_entries" FOR EACH ROW EXECUTE FUNCTION "private"."log_financial_change"();



CREATE OR REPLACE TRIGGER "audit_income_entries_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."income_entries" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_integration_connections_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."integration_connections" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_knowledge_articles_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."knowledge_articles" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_knowledge_categories_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."knowledge_categories" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_kpi_records_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."kpi_records" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_meeting_action_items_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."meeting_action_items" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_meetings_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."meetings" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_merch_launches_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."merch_launches" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_organization_members_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_partners_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."partners" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_projects_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_shop_products_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."shop_products" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_social_accounts_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."social_accounts" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_social_posts_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."social_posts" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_social_sync_runs_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."social_sync_runs" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



CREATE OR REPLACE TRIGGER "audit_tasks_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "private"."log_organization_change"();



ALTER TABLE ONLY "private"."newsletter_subscription_requests"
    ADD CONSTRAINT "newsletter_subscription_requests_mailing_list_id_fkey" FOREIGN KEY ("mailing_list_id") REFERENCES "public"."mailing_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."newsletter_subscription_requests"
    ADD CONSTRAINT "newsletter_subscription_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."newsletter_unsubscribe_requests"
    ADD CONSTRAINT "newsletter_unsubscribe_requests_mailing_list_id_fkey" FOREIGN KEY ("mailing_list_id") REFERENCES "public"."mailing_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."newsletter_unsubscribe_requests"
    ADD CONSTRAINT "newsletter_unsubscribe_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."newsletter_unsubscribe_requests"
    ADD CONSTRAINT "newsletter_unsubscribe_requests_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "public"."mailing_subscribers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."social_account_credentials"
    ADD CONSTRAINT "social_account_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."social_account_credentials"
    ADD CONSTRAINT "social_account_credentials_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."acceptance_check_results"
    ADD CONSTRAINT "acceptance_check_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."acceptance_check_results"
    ADD CONSTRAINT "acceptance_check_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."acceptance_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."acceptance_check_results"
    ADD CONSTRAINT "acceptance_check_results_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."acceptance_runs"
    ADD CONSTRAINT "acceptance_runs_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."acceptance_runs"
    ADD CONSTRAINT "acceptance_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."acceptance_runs"
    ADD CONSTRAINT "acceptance_runs_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."activity_events"
    ADD CONSTRAINT "activity_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."activity_events"
    ADD CONSTRAINT "activity_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."administrative_documents"
    ADD CONSTRAINT "administrative_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."administrative_documents"
    ADD CONSTRAINT "administrative_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_generations"
    ADD CONSTRAINT "ai_generations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ai_generations"
    ADD CONSTRAINT "ai_generations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_generations"
    ADD CONSTRAINT "ai_generations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."ai_prompt_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_prompt_templates"
    ADD CONSTRAINT "ai_prompt_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ai_prompt_templates"
    ADD CONSTRAINT "ai_prompt_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_owner_person_id_fkey" FOREIGN KEY ("owner_person_id") REFERENCES "public"."community_people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."association_members"
    ADD CONSTRAINT "association_members_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."association_members"
    ADD CONSTRAINT "association_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_envelopes"
    ADD CONSTRAINT "budget_envelopes_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."budget_envelopes"
    ADD CONSTRAINT "budget_envelopes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."budget_envelopes"
    ADD CONSTRAINT "budget_envelopes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."budget_envelopes"
    ADD CONSTRAINT "budget_envelopes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."budget_envelopes"
    ADD CONSTRAINT "budget_envelopes_merch_launch_id_fkey" FOREIGN KEY ("merch_launch_id") REFERENCES "public"."merch_launches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."budget_envelopes"
    ADD CONSTRAINT "budget_envelopes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_envelopes"
    ADD CONSTRAINT "budget_envelopes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."budget_envelopes"
    ADD CONSTRAINT "budget_envelopes_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."budget_envelopes"
    ADD CONSTRAINT "budget_envelopes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_deliverables"
    ADD CONSTRAINT "campaign_deliverables_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_deliverables"
    ADD CONSTRAINT "campaign_deliverables_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_deliverables"
    ADD CONSTRAINT "campaign_deliverables_community_person_id_fkey" FOREIGN KEY ("community_person_id") REFERENCES "public"."community_people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_deliverables"
    ADD CONSTRAINT "campaign_deliverables_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."campaign_deliverables"
    ADD CONSTRAINT "campaign_deliverables_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_assignments"
    ADD CONSTRAINT "community_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."community_assignments"
    ADD CONSTRAINT "community_assignments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_assignments"
    ADD CONSTRAINT "community_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_assignments"
    ADD CONSTRAINT "community_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."community_people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_assignments"
    ADD CONSTRAINT "community_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_onboarding_items"
    ADD CONSTRAINT "community_onboarding_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."community_onboarding_items"
    ADD CONSTRAINT "community_onboarding_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_onboarding_items"
    ADD CONSTRAINT "community_onboarding_items_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."community_people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_people"
    ADD CONSTRAINT "community_people_account_user_id_fkey" FOREIGN KEY ("account_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_people"
    ADD CONSTRAINT "community_people_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."community_people"
    ADD CONSTRAINT "community_people_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_people"
    ADD CONSTRAINT "community_people_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_person_roles"
    ADD CONSTRAINT "community_person_roles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."community_person_roles"
    ADD CONSTRAINT "community_person_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_person_roles"
    ADD CONSTRAINT "community_person_roles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."community_people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."compliance_deadlines"
    ADD CONSTRAINT "compliance_deadlines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."compliance_deadlines"
    ADD CONSTRAINT "compliance_deadlines_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."administrative_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."compliance_deadlines"
    ADD CONSTRAINT "compliance_deadlines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."compliance_deadlines"
    ADD CONSTRAINT "compliance_deadlines_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_items"
    ADD CONSTRAINT "content_items_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_items"
    ADD CONSTRAINT "content_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."content_items"
    ADD CONSTRAINT "content_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_items"
    ADD CONSTRAINT "content_items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_items"
    ADD CONSTRAINT "content_items_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_items"
    ADD CONSTRAINT "content_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_communications"
    ADD CONSTRAINT "email_communications_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_communications"
    ADD CONSTRAINT "email_communications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."email_communications"
    ADD CONSTRAINT "email_communications_email_template_id_fkey" FOREIGN KEY ("email_template_id") REFERENCES "public"."email_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_communications"
    ADD CONSTRAINT "email_communications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_communications"
    ADD CONSTRAINT "email_communications_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "public"."budget_envelopes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_merch_launch_id_fkey" FOREIGN KEY ("merch_launch_id") REFERENCES "public"."merch_launches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_settings"
    ADD CONSTRAINT "finance_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_settings"
    ADD CONSTRAINT "finance_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_audit_log"
    ADD CONSTRAINT "financial_audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_audit_log"
    ADD CONSTRAINT "financial_audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_documents"
    ADD CONSTRAINT "financial_documents_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "public"."budget_envelopes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_documents"
    ADD CONSTRAINT "financial_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."financial_documents"
    ADD CONSTRAINT "financial_documents_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_documents"
    ADD CONSTRAINT "financial_documents_income_id_fkey" FOREIGN KEY ("income_id") REFERENCES "public"."income_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_documents"
    ADD CONSTRAINT "financial_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_documents"
    ADD CONSTRAINT "financial_documents_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."google_resource_links"
    ADD CONSTRAINT "google_resource_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."google_resource_links"
    ADD CONSTRAINT "google_resource_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."governance_mandates"
    ADD CONSTRAINT "governance_mandates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."governance_mandates"
    ADD CONSTRAINT "governance_mandates_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."association_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."governance_mandates"
    ADD CONSTRAINT "governance_mandates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inbox_items"
    ADD CONSTRAINT "inbox_items_converted_project_id_fkey" FOREIGN KEY ("converted_project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."inbox_items"
    ADD CONSTRAINT "inbox_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."inbox_items"
    ADD CONSTRAINT "inbox_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."inbox_items"
    ADD CONSTRAINT "inbox_items_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."income_entries"
    ADD CONSTRAINT "income_entries_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "public"."budget_envelopes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."income_entries"
    ADD CONSTRAINT "income_entries_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."income_entries"
    ADD CONSTRAINT "income_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."income_entries"
    ADD CONSTRAINT "income_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."income_entries"
    ADD CONSTRAINT "income_entries_merch_launch_id_fkey" FOREIGN KEY ("merch_launch_id") REFERENCES "public"."merch_launches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."income_entries"
    ADD CONSTRAINT "income_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."income_entries"
    ADD CONSTRAINT "income_entries_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."income_entries"
    ADD CONSTRAINT "income_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."integration_connections"
    ADD CONSTRAINT "integration_connections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."integration_connections"
    ADD CONSTRAINT "integration_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_articles"
    ADD CONSTRAINT "knowledge_articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."knowledge_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."knowledge_articles"
    ADD CONSTRAINT "knowledge_articles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."knowledge_articles"
    ADD CONSTRAINT "knowledge_articles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_articles"
    ADD CONSTRAINT "knowledge_articles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."knowledge_categories"
    ADD CONSTRAINT "knowledge_categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."knowledge_categories"
    ADD CONSTRAINT "knowledge_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_revisions"
    ADD CONSTRAINT "knowledge_revisions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_revisions"
    ADD CONSTRAINT "knowledge_revisions_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."kpi_records"
    ADD CONSTRAINT "kpi_records_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kpi_records"
    ADD CONSTRAINT "kpi_records_community_person_id_fkey" FOREIGN KEY ("community_person_id") REFERENCES "public"."community_people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kpi_records"
    ADD CONSTRAINT "kpi_records_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kpi_records"
    ADD CONSTRAINT "kpi_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."kpi_records"
    ADD CONSTRAINT "kpi_records_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kpi_records"
    ADD CONSTRAINT "kpi_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kpi_records"
    ADD CONSTRAINT "kpi_records_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kpi_records"
    ADD CONSTRAINT "kpi_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kpi_records"
    ADD CONSTRAINT "kpi_records_social_post_id_fkey" FOREIGN KEY ("social_post_id") REFERENCES "public"."social_posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kpi_records"
    ADD CONSTRAINT "kpi_records_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."legacy_records"
    ADD CONSTRAINT "legacy_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."legacy_records"
    ADD CONSTRAINT "legacy_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mailing_lists"
    ADD CONSTRAINT "mailing_lists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."mailing_lists"
    ADD CONSTRAINT "mailing_lists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mailing_subscribers"
    ADD CONSTRAINT "mailing_subscribers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."mailing_subscribers"
    ADD CONSTRAINT "mailing_subscribers_mailing_list_id_fkey" FOREIGN KEY ("mailing_list_id") REFERENCES "public"."mailing_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mailing_subscribers"
    ADD CONSTRAINT "mailing_subscribers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_action_items"
    ADD CONSTRAINT "meeting_action_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."meeting_action_items"
    ADD CONSTRAINT "meeting_action_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_action_items"
    ADD CONSTRAINT "meeting_action_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_action_items"
    ADD CONSTRAINT "meeting_action_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."merch_launches"
    ADD CONSTRAINT "merch_launches_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."merch_launches"
    ADD CONSTRAINT "merch_launches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."merch_launches"
    ADD CONSTRAINT "merch_launches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."merch_launches"
    ADD CONSTRAINT "merch_launches_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."merch_launches"
    ADD CONSTRAINT "merch_launches_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."merch_launches"
    ADD CONSTRAINT "merch_launches_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."migration_source_links"
    ADD CONSTRAINT "migration_source_links_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."migration_source_links"
    ADD CONSTRAINT "migration_source_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."newsletters"
    ADD CONSTRAINT "newsletters_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."newsletters"
    ADD CONSTRAINT "newsletters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."newsletters"
    ADD CONSTRAINT "newsletters_email_template_id_fkey" FOREIGN KEY ("email_template_id") REFERENCES "public"."email_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."newsletters"
    ADD CONSTRAINT "newsletters_mailing_list_id_fkey" FOREIGN KEY ("mailing_list_id") REFERENCES "public"."mailing_lists"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."newsletters"
    ADD CONSTRAINT "newsletters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."newsletters"
    ADD CONSTRAINT "newsletters_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_access_roles"
    ADD CONSTRAINT "organization_access_roles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."organization_access_roles"
    ADD CONSTRAINT "organization_access_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_access_role_id_fkey" FOREIGN KEY ("access_role_id") REFERENCES "public"."organization_access_roles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_contacts"
    ADD CONSTRAINT "partner_contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."partner_contacts"
    ADD CONSTRAINT "partner_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_contacts"
    ADD CONSTRAINT "partner_contacts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_interactions"
    ADD CONSTRAINT "partner_interactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."partner_interactions"
    ADD CONSTRAINT "partner_interactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_interactions"
    ADD CONSTRAINT "partner_interactions_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."portal_access"
    ADD CONSTRAINT "portal_access_community_person_id_fkey" FOREIGN KEY ("community_person_id") REFERENCES "public"."community_people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portal_access"
    ADD CONSTRAINT "portal_access_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."portal_access"
    ADD CONSTRAINT "portal_access_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portal_access"
    ADD CONSTRAINT "portal_access_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portal_access"
    ADD CONSTRAINT "portal_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_milestones"
    ADD CONSTRAINT "project_milestones_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."project_milestones"
    ADD CONSTRAINT "project_milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."record_links"
    ADD CONSTRAINT "record_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."record_links"
    ADD CONSTRAINT "record_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."record_relationships"
    ADD CONSTRAINT "record_relationships_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."record_relationships"
    ADD CONSTRAINT "record_relationships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_views"
    ADD CONSTRAINT "saved_views_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_views"
    ADD CONSTRAINT "saved_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_products"
    ADD CONSTRAINT "shop_products_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shop_products"
    ADD CONSTRAINT "shop_products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."shop_products"
    ADD CONSTRAINT "shop_products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shop_products"
    ADD CONSTRAINT "shop_products_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shop_products"
    ADD CONSTRAINT "shop_products_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shop_products"
    ADD CONSTRAINT "shop_products_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shop_products"
    ADD CONSTRAINT "shop_products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_connected_by_fkey" FOREIGN KEY ("connected_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_metric_snapshots"
    ADD CONSTRAINT "social_metric_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_metric_snapshots"
    ADD CONSTRAINT "social_metric_snapshots_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_metric_snapshots"
    ADD CONSTRAINT "social_metric_snapshots_social_post_id_fkey" FOREIGN KEY ("social_post_id") REFERENCES "public"."social_posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_metric_snapshots"
    ADD CONSTRAINT "social_metric_snapshots_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "public"."social_sync_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_post_variants"
    ADD CONSTRAINT "social_post_variants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."social_post_variants"
    ADD CONSTRAINT "social_post_variants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_post_variants"
    ADD CONSTRAINT "social_post_variants_social_post_id_fkey" FOREIGN KEY ("social_post_id") REFERENCES "public"."social_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_sync_runs"
    ADD CONSTRAINT "social_sync_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_sync_runs"
    ADD CONSTRAINT "social_sync_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_sync_runs"
    ADD CONSTRAINT "social_sync_runs_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_assignees"
    ADD CONSTRAINT "task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_checklist_items"
    ADD CONSTRAINT "task_checklist_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."task_checklist_items"
    ADD CONSTRAINT "task_checklist_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_source_inbox_id_fkey" FOREIGN KEY ("source_inbox_id") REFERENCES "public"."inbox_items"("id") ON DELETE SET NULL;



ALTER TABLE "private"."newsletter_subscription_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."newsletter_unsubscribe_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."social_account_credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."acceptance_check_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."acceptance_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "active member project read" ON "public"."projects" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "active member task insert" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_active_member"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "active member task read" ON "public"."tasks" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "active member task update" ON "public"."tasks" FOR UPDATE TO "authenticated" USING ("private"."is_active_member"("organization_id")) WITH CHECK ("private"."is_active_member"("organization_id"));



CREATE POLICY "active members assign tasks" ON "public"."task_assignees" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_assignees"."task_id") AND "private"."is_active_member"("t"."organization_id")))));



CREATE POLICY "active members create checklists" ON "public"."task_checklist_items" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_checklist_items"."task_id") AND "private"."is_active_member"("t"."organization_id"))))));



CREATE POLICY "active members read assets" ON "public"."assets" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "active members read checklists" ON "public"."task_checklist_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_checklist_items"."task_id") AND "private"."is_active_member"("t"."organization_id")))));



CREATE POLICY "active members read organization profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."organization_members" "viewer"
     JOIN "public"."organization_members" "subject" ON (("subject"."organization_id" = "viewer"."organization_id")))
  WHERE (("viewer"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("viewer"."status" = 'active'::"public"."member_status") AND ("subject"."user_id" = "profiles"."id")))));



CREATE POLICY "active members read person roles" ON "public"."community_person_roles" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "active members read record links" ON "public"."record_links" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "active members read record relationships" ON "public"."record_relationships" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "active members unassign tasks" ON "public"."task_assignees" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_assignees"."task_id") AND "private"."is_active_member"("t"."organization_id")))));



CREATE POLICY "active members update checklists" ON "public"."task_checklist_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_checklist_items"."task_id") AND "private"."is_active_member"("t"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_checklist_items"."task_id") AND "private"."is_active_member"("t"."organization_id")))));



ALTER TABLE "public"."activity_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."administrative_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins manage access roles" ON "public"."organization_access_roles" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "m"
  WHERE (("m"."organization_id" = "organization_access_roles"."organization_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."status" = 'active'::"public"."member_status") AND ("m"."role" = 'admin'::"public"."member_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "m"
  WHERE (("m"."organization_id" = "organization_access_roles"."organization_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."status" = 'active'::"public"."member_status") AND ("m"."role" = 'admin'::"public"."member_role")))));



ALTER TABLE "public"."ai_generations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_prompt_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."association_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authorized reviewers decide approval requests" ON "public"."approval_requests" FOR UPDATE TO "authenticated" USING (("private"."is_org_manager"("organization_id") OR (("entity_type" = 'expense'::"text") AND "private"."can_manage_finance"("organization_id")))) WITH CHECK (("private"."is_org_manager"("organization_id") OR (("entity_type" = 'expense'::"text") AND "private"."can_manage_finance"("organization_id"))));



CREATE POLICY "authors or managers delete comments" ON "public"."comments" FOR DELETE TO "authenticated" USING ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."is_org_manager"("organization_id")));



CREATE POLICY "authors update comments" ON "public"."comments" FOR UPDATE TO "authenticated" USING (("author_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_active_member"("organization_id")));



ALTER TABLE "public"."budget_envelopes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_deliverables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_onboarding_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_people" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_person_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compliance_deadlines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "creators and managers read email communications" ON "public"."email_communications" FOR SELECT TO "authenticated" USING (("private"."is_org_manager"("organization_id") OR (("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_active_member"("organization_id"))));



CREATE POLICY "creators and managers read newsletters" ON "public"."newsletters" FOR SELECT TO "authenticated" USING (("private"."is_org_manager"("organization_id") OR (("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_active_member"("organization_id"))));



CREATE POLICY "creators and managers update email communications" ON "public"."email_communications" FOR UPDATE TO "authenticated" USING (("private"."is_org_manager"("organization_id") OR (("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_active_member"("organization_id")))) WITH CHECK (("private"."is_org_manager"("organization_id") OR (("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_active_member"("organization_id") AND ("status" = ANY (ARRAY['draft'::"text", 'pending_approval'::"text", 'changes_requested'::"text", 'failed'::"text"])) AND ("approved_by" IS NULL) AND ("sent_by" IS NULL) AND ("sent_at" IS NULL))));



CREATE POLICY "creators and managers update newsletters" ON "public"."newsletters" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



ALTER TABLE "public"."email_communications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance managers create budgets" ON "public"."budget_envelopes" FOR INSERT TO "authenticated" WITH CHECK ("private"."can_manage_finance"("organization_id"));



CREATE POLICY "finance managers create documents" ON "public"."financial_documents" FOR INSERT TO "authenticated" WITH CHECK (("private"."can_manage_finance"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "finance managers create income" ON "public"."income_entries" FOR INSERT TO "authenticated" WITH CHECK ("private"."can_manage_finance"("organization_id"));



CREATE POLICY "finance managers create settings" ON "public"."finance_settings" FOR INSERT TO "authenticated" WITH CHECK ("private"."can_manage_finance"("organization_id"));



CREATE POLICY "finance managers delete budgets" ON "public"."budget_envelopes" FOR DELETE TO "authenticated" USING ("private"."can_manage_finance"("organization_id"));



CREATE POLICY "finance managers delete documents" ON "public"."financial_documents" FOR DELETE TO "authenticated" USING ("private"."can_manage_finance"("organization_id"));



CREATE POLICY "finance managers delete expenses" ON "public"."expenses" FOR DELETE TO "authenticated" USING ("private"."can_manage_finance"("organization_id"));



CREATE POLICY "finance managers delete income" ON "public"."income_entries" FOR DELETE TO "authenticated" USING ("private"."can_manage_finance"("organization_id"));



CREATE POLICY "finance managers read audit" ON "public"."financial_audit_log" FOR SELECT TO "authenticated" USING ("private"."can_manage_finance"("organization_id"));



CREATE POLICY "finance managers read documents" ON "public"."financial_documents" FOR SELECT TO "authenticated" USING ("private"."can_manage_finance"("organization_id"));



CREATE POLICY "finance managers update budgets" ON "public"."budget_envelopes" FOR UPDATE TO "authenticated" USING ("private"."can_manage_finance"("organization_id")) WITH CHECK ("private"."can_manage_finance"("organization_id"));



CREATE POLICY "finance managers update documents" ON "public"."financial_documents" FOR UPDATE TO "authenticated" USING ("private"."can_manage_finance"("organization_id")) WITH CHECK ("private"."can_manage_finance"("organization_id"));



CREATE POLICY "finance managers update expenses" ON "public"."expenses" FOR UPDATE TO "authenticated" USING ("private"."can_manage_finance"("organization_id")) WITH CHECK ("private"."can_manage_finance"("organization_id"));



CREATE POLICY "finance managers update income" ON "public"."income_entries" FOR UPDATE TO "authenticated" USING ("private"."can_manage_finance"("organization_id")) WITH CHECK ("private"."can_manage_finance"("organization_id"));



CREATE POLICY "finance managers update settings" ON "public"."finance_settings" FOR UPDATE TO "authenticated" USING ("private"."can_manage_finance"("organization_id")) WITH CHECK ("private"."can_manage_finance"("organization_id"));



ALTER TABLE "public"."finance_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."google_resource_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."governance_mandates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inbox_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."income_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."integration_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knowledge_articles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knowledge_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knowledge_revisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kpi_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legacy_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mailing_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mailing_subscribers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "manager inbox access" ON "public"."inbox_items" TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "manager membership update" ON "public"."organization_members" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "manager project write" ON "public"."projects" TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create administrative documents" ON "public"."administrative_documents" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create article revisions" ON "public"."knowledge_revisions" FOR INSERT TO "authenticated" WITH CHECK ((("changed_by" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."knowledge_articles" "a"
  WHERE (("a"."id" = "knowledge_revisions"."article_id") AND "private"."is_org_manager"("a"."organization_id"))))));



CREATE POLICY "managers create assets" ON "public"."assets" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create association members" ON "public"."association_members" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create campaign_deliverables" ON "public"."campaign_deliverables" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create campaigns" ON "public"."campaigns" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create community_assignments" ON "public"."community_assignments" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create community_onboarding_items" ON "public"."community_onboarding_items" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create community_people" ON "public"."community_people" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create compliance deadlines" ON "public"."compliance_deadlines" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create content" ON "public"."content_items" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create email templates" ON "public"."email_templates" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create events" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create google resource links" ON "public"."google_resource_links" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create governance mandates" ON "public"."governance_mandates" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create integrations" ON "public"."integration_connections" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create knowledge articles" ON "public"."knowledge_articles" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create knowledge categories" ON "public"."knowledge_categories" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create kpi records" ON "public"."kpi_records" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create legacy records" ON "public"."legacy_records" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create mailing lists" ON "public"."mailing_lists" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create mailing subscribers" ON "public"."mailing_subscribers" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create meeting_action_items" ON "public"."meeting_action_items" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create meetings" ON "public"."meetings" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create merch_launches" ON "public"."merch_launches" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create migration links" ON "public"."migration_source_links" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create milestones" ON "public"."project_milestones" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_milestones"."project_id") AND "private"."is_org_manager"("p"."organization_id"))))));



CREATE POLICY "managers create own newsletters" ON "public"."newsletters" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = ANY (ARRAY['draft'::"text", 'failed'::"text"])) AND ("approved_by" IS NULL) AND ("sent_by" IS NULL)));



CREATE POLICY "managers create partner_contacts" ON "public"."partner_contacts" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create partner_interactions" ON "public"."partner_interactions" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create partners" ON "public"."partners" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create person roles" ON "public"."community_person_roles" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create portal access" ON "public"."portal_access" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create prompts" ON "public"."ai_prompt_templates" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create record links" ON "public"."record_links" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_org_manager"("organization_id")));



CREATE POLICY "managers create record relationships" ON "public"."record_relationships" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_org_manager"("organization_id")));



CREATE POLICY "managers create shop_products" ON "public"."shop_products" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create social accounts" ON "public"."social_accounts" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_org_manager"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "managers create social metric snapshots" ON "public"."social_metric_snapshots" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create social sync runs" ON "public"."social_sync_runs" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create social_post_variants" ON "public"."social_post_variants" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers create social_posts" ON "public"."social_posts" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete administrative documents" ON "public"."administrative_documents" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete assets" ON "public"."assets" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete association members" ON "public"."association_members" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete campaign_deliverables" ON "public"."campaign_deliverables" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete campaigns" ON "public"."campaigns" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete checklists" ON "public"."task_checklist_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_checklist_items"."task_id") AND "private"."is_org_manager"("t"."organization_id")))));



CREATE POLICY "managers delete community_assignments" ON "public"."community_assignments" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete community_onboarding_items" ON "public"."community_onboarding_items" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete community_people" ON "public"."community_people" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete compliance deadlines" ON "public"."compliance_deadlines" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete content" ON "public"."content_items" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete events" ON "public"."events" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete google resource links" ON "public"."google_resource_links" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete governance mandates" ON "public"."governance_mandates" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete integrations" ON "public"."integration_connections" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete knowledge articles" ON "public"."knowledge_articles" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete knowledge categories" ON "public"."knowledge_categories" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete kpi records" ON "public"."kpi_records" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete legacy records" ON "public"."legacy_records" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete meeting_action_items" ON "public"."meeting_action_items" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete meetings" ON "public"."meetings" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete merch_launches" ON "public"."merch_launches" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete migration links" ON "public"."migration_source_links" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete milestones" ON "public"."project_milestones" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_milestones"."project_id") AND "private"."is_org_manager"("p"."organization_id")))));



CREATE POLICY "managers delete partner_contacts" ON "public"."partner_contacts" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete partner_interactions" ON "public"."partner_interactions" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete partners" ON "public"."partners" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete person roles" ON "public"."community_person_roles" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete portal access" ON "public"."portal_access" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete prompts" ON "public"."ai_prompt_templates" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete record links" ON "public"."record_links" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete record relationships" ON "public"."record_relationships" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete shop_products" ON "public"."shop_products" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete social accounts" ON "public"."social_accounts" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete social_post_variants" ON "public"."social_post_variants" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers delete social_posts" ON "public"."social_posts" FOR DELETE TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers manage project teams" ON "public"."project_members" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_members"."project_id") AND "private"."is_org_manager"("p"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_members"."project_id") AND "private"."is_org_manager"("p"."organization_id")))));



CREATE POLICY "managers read access roles" ON "public"."organization_access_roles" FOR SELECT TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers read administrative documents" ON "public"."administrative_documents" FOR SELECT TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers read association members" ON "public"."association_members" FOR SELECT TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers read compliance deadlines" ON "public"."compliance_deadlines" FOR SELECT TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers read governance mandates" ON "public"."governance_mandates" FOR SELECT TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers read integrations" ON "public"."integration_connections" FOR SELECT TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers read mailing subscribers" ON "public"."mailing_subscribers" FOR SELECT TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers read organization profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."organization_members" "viewer"
     JOIN "public"."organization_members" "subject" ON (("subject"."organization_id" = "viewer"."organization_id")))
  WHERE (("viewer"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("viewer"."status" = 'active'::"public"."member_status") AND ("viewer"."role" = ANY (ARRAY['admin'::"public"."member_role", 'board'::"public"."member_role"])) AND ("subject"."user_id" = "profiles"."id")))));



CREATE POLICY "managers read portal access" ON "public"."portal_access" FOR SELECT TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers read social accounts" ON "public"."social_accounts" FOR SELECT TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers read social sync runs" ON "public"."social_sync_runs" FOR SELECT TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update administrative documents" ON "public"."administrative_documents" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update assets" ON "public"."assets" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update association members" ON "public"."association_members" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update campaign_deliverables" ON "public"."campaign_deliverables" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update campaigns" ON "public"."campaigns" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update community_assignments" ON "public"."community_assignments" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update community_onboarding_items" ON "public"."community_onboarding_items" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update community_people" ON "public"."community_people" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update compliance deadlines" ON "public"."compliance_deadlines" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update content" ON "public"."content_items" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update email templates" ON "public"."email_templates" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update events" ON "public"."events" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update generations" ON "public"."ai_generations" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update google resource links" ON "public"."google_resource_links" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update governance mandates" ON "public"."governance_mandates" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update integrations" ON "public"."integration_connections" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update knowledge articles" ON "public"."knowledge_articles" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update knowledge categories" ON "public"."knowledge_categories" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update kpi records" ON "public"."kpi_records" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update legacy records" ON "public"."legacy_records" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update mailing lists" ON "public"."mailing_lists" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update mailing subscribers" ON "public"."mailing_subscribers" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update meeting_action_items" ON "public"."meeting_action_items" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update meetings" ON "public"."meetings" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update merch_launches" ON "public"."merch_launches" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update migration links" ON "public"."migration_source_links" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update milestones" ON "public"."project_milestones" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_milestones"."project_id") AND "private"."is_org_manager"("p"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_milestones"."project_id") AND "private"."is_org_manager"("p"."organization_id")))));



CREATE POLICY "managers update partner_contacts" ON "public"."partner_contacts" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update partner_interactions" ON "public"."partner_interactions" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update partners" ON "public"."partners" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update person roles" ON "public"."community_person_roles" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update portal access" ON "public"."portal_access" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update prompts" ON "public"."ai_prompt_templates" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update record links" ON "public"."record_links" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update record relationships" ON "public"."record_relationships" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update shop_products" ON "public"."shop_products" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update social accounts" ON "public"."social_accounts" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update social metric snapshots" ON "public"."social_metric_snapshots" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update social sync runs" ON "public"."social_sync_runs" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update social_post_variants" ON "public"."social_post_variants" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "managers update social_posts" ON "public"."social_posts" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



ALTER TABLE "public"."meeting_action_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meetings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member assignee read" ON "public"."task_assignees" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_assignees"."task_id") AND "private"."is_active_member"("t"."organization_id")))));



CREATE POLICY "member organization read" ON "public"."organizations" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("id"));



CREATE POLICY "members create activity" ON "public"."activity_events" FOR INSERT TO "authenticated" WITH CHECK ((("actor_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_active_member"("organization_id")));



CREATE POLICY "members create comments" ON "public"."comments" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_active_member"("organization_id")));



CREATE POLICY "members create expenses" ON "public"."expenses" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_active_member"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "members create generations" ON "public"."ai_generations" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_active_member"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "members create organization notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_active_member"("organization_id") AND (EXISTS ( SELECT 1
   FROM "public"."organization_members" "recipient"
  WHERE (("recipient"."organization_id" = "notifications"."organization_id") AND ("recipient"."user_id" = "notifications"."user_id") AND ("recipient"."status" = 'active'::"public"."member_status"))))));



CREATE POLICY "members create own email communications" ON "public"."email_communications" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_active_member"("organization_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = ANY (ARRAY['draft'::"text", 'failed'::"text"])) AND ("approved_by" IS NULL) AND ("sent_by" IS NULL)));



CREATE POLICY "members read active email templates" ON "public"."email_templates" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read active prompts" ON "public"."ai_prompt_templates" FOR SELECT TO "authenticated" USING (("private"."is_active_member"("organization_id") AND (("status" = 'active'::"text") OR "private"."is_org_manager"("organization_id"))));



CREATE POLICY "members read activity" ON "public"."activity_events" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read approval requests" ON "public"."approval_requests" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read article revisions" ON "public"."knowledge_revisions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."knowledge_articles" "a"
  WHERE (("a"."id" = "knowledge_revisions"."article_id") AND "private"."is_active_member"("a"."organization_id") AND (("a"."status" = 'published'::"text") OR "private"."is_org_manager"("a"."organization_id"))))));



CREATE POLICY "members read budgets" ON "public"."budget_envelopes" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read campaign_deliverables" ON "public"."campaign_deliverables" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read campaigns" ON "public"."campaigns" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read comments" ON "public"."comments" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read community_assignments" ON "public"."community_assignments" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read community_onboarding_items" ON "public"."community_onboarding_items" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read community_people" ON "public"."community_people" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read content" ON "public"."content_items" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read events" ON "public"."events" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read expenses" ON "public"."expenses" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read finance settings" ON "public"."finance_settings" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read google resource links" ON "public"."google_resource_links" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read income" ON "public"."income_entries" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read knowledge categories" ON "public"."knowledge_categories" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read kpi records" ON "public"."kpi_records" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read legacy records" ON "public"."legacy_records" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read mailing list summaries" ON "public"."mailing_lists" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read meeting_action_items" ON "public"."meeting_action_items" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read meetings" ON "public"."meetings" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read merch_launches" ON "public"."merch_launches" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read migration links" ON "public"."migration_source_links" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read milestones" ON "public"."project_milestones" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_milestones"."project_id") AND "private"."is_active_member"("p"."organization_id")))));



CREATE POLICY "members read own generations or managers" ON "public"."ai_generations" FOR SELECT TO "authenticated" USING (("private"."is_active_member"("organization_id") AND (("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."is_org_manager"("organization_id"))));



CREATE POLICY "members read partner_contacts" ON "public"."partner_contacts" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read partner_interactions" ON "public"."partner_interactions" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read partners" ON "public"."partners" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read project teams" ON "public"."project_members" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_members"."project_id") AND "private"."is_active_member"("p"."organization_id")))));



CREATE POLICY "members read published knowledge articles" ON "public"."knowledge_articles" FOR SELECT TO "authenticated" USING (("private"."is_active_member"("organization_id") AND (("status" = 'published'::"text") OR "private"."is_org_manager"("organization_id"))));



CREATE POLICY "members read shop_products" ON "public"."shop_products" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read social metric snapshots" ON "public"."social_metric_snapshots" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read social_post_variants" ON "public"."social_post_variants" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members read social_posts" ON "public"."social_posts" FOR SELECT TO "authenticated" USING ("private"."is_active_member"("organization_id"));



CREATE POLICY "members submit approval requests" ON "public"."approval_requests" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_active_member"("organization_id") AND ("requested_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"text") AND ("decided_by" IS NULL) AND ("decided_at" IS NULL)));



CREATE POLICY "membership self or manager read" ON "public"."organization_members" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."is_org_manager"("organization_id")));



ALTER TABLE "public"."merch_launches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."migration_source_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization managers create acceptance checks" ON "public"."acceptance_check_results" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "organization managers create acceptance runs" ON "public"."acceptance_runs" FOR INSERT TO "authenticated" WITH CHECK ((("started_by" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_org_manager"("organization_id")));



CREATE POLICY "organization managers read acceptance checks" ON "public"."acceptance_check_results" FOR SELECT TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "organization managers read acceptance runs" ON "public"."acceptance_runs" FOR SELECT TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "organization managers read audit log" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("private"."is_org_manager"("organization_id"));



CREATE POLICY "organization managers update acceptance checks" ON "public"."acceptance_check_results" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



CREATE POLICY "organization managers update acceptance runs" ON "public"."acceptance_runs" FOR UPDATE TO "authenticated" USING ("private"."is_org_manager"("organization_id")) WITH CHECK ("private"."is_org_manager"("organization_id"));



ALTER TABLE "public"."organization_access_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own profile read" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own profile update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."partner_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."partner_interactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."partners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portal_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_milestones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."record_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."record_relationships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shop_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_metric_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_post_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_sync_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_assignees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_checklist_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users create own notification preferences" ON "public"."notification_preferences" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_active_member"("organization_id")));



CREATE POLICY "users create own saved views" ON "public"."saved_views" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."is_active_member"("organization_id")));



CREATE POLICY "users delete own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "users delete own saved views" ON "public"."saved_views" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."is_active_member"("organization_id")));



CREATE POLICY "users read own notification preferences" ON "public"."notification_preferences" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_active_member"("organization_id")));



CREATE POLICY "users read own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_active_member"("organization_id")));



CREATE POLICY "users read own portal access" ON "public"."portal_access" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "users read own saved views" ON "public"."saved_views" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."is_active_member"("organization_id")));



CREATE POLICY "users update own notification preferences" ON "public"."notification_preferences" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_active_member"("organization_id"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_active_member"("organization_id")));



CREATE POLICY "users update own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_active_member"("organization_id")));



CREATE POLICY "users update own saved views" ON "public"."saved_views" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."is_active_member"("organization_id"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND "private"."is_active_member"("organization_id")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "private" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "private"."can_manage_finance"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_manage_finance"("org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."confirm_newsletter_subscription"("p_token_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."confirm_newsletter_subscription"("p_token_hash" "text") TO "service_role";
GRANT ALL ON FUNCTION "private"."confirm_newsletter_subscription"("p_token_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "private"."confirm_newsletter_subscription"("p_token_hash" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."confirm_newsletter_unsubscription"("p_token_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."confirm_newsletter_unsubscription"("p_token_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "private"."confirm_newsletter_unsubscription"("p_token_hash" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_active_member"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_active_member"("org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_org_manager"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_org_manager"("org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."log_financial_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."log_organization_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."portal_sponsor_dashboard"("p_access_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."portal_sponsor_dashboard"("p_access_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."portal_sponsor_dashboard"("p_access_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."portal_streamer_dashboard"("p_access_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."portal_streamer_dashboard"("p_access_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "private"."portal_streamer_dashboard"("p_access_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."request_newsletter_subscription"("p_list_slug" "text", "p_email" "text", "p_display_name" "text", "p_token_hash" "text", "p_ip_hash" "text", "p_consent_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."request_newsletter_subscription"("p_list_slug" "text", "p_email" "text", "p_display_name" "text", "p_token_hash" "text", "p_ip_hash" "text", "p_consent_version" "text") TO "service_role";
GRANT ALL ON FUNCTION "private"."request_newsletter_subscription"("p_list_slug" "text", "p_email" "text", "p_display_name" "text", "p_token_hash" "text", "p_ip_hash" "text", "p_consent_version" "text") TO "anon";
GRANT ALL ON FUNCTION "private"."request_newsletter_subscription"("p_list_slug" "text", "p_email" "text", "p_display_name" "text", "p_token_hash" "text", "p_ip_hash" "text", "p_consent_version" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."request_newsletter_unsubscription"("p_list_slug" "text", "p_email" "text", "p_token_hash" "text", "p_ip_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."request_newsletter_unsubscription"("p_list_slug" "text", "p_email" "text", "p_token_hash" "text", "p_ip_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "private"."request_newsletter_unsubscription"("p_list_slug" "text", "p_email" "text", "p_token_hash" "text", "p_ip_hash" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."confirm_newsletter_subscription"("p_token_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_newsletter_subscription"("p_token_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_newsletter_subscription"("p_token_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_newsletter_subscription"("p_token_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_newsletter_unsubscription"("p_token_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_newsletter_unsubscription"("p_token_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_newsletter_unsubscription"("p_token_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_newsletter_unsubscription"("p_token_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."convert_legacy_event"("p_record_id" "uuid", "p_title" "text", "p_description" "text", "p_priority" "public"."priority_level", "p_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."convert_legacy_event"("p_record_id" "uuid", "p_title" "text", "p_description" "text", "p_priority" "public"."priority_level", "p_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."convert_legacy_event"("p_record_id" "uuid", "p_title" "text", "p_description" "text", "p_priority" "public"."priority_level", "p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_legacy_event"("p_record_id" "uuid", "p_title" "text", "p_description" "text", "p_priority" "public"."priority_level", "p_project_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_legacy_operational"("p_record_id" "uuid", "p_target_table" "text", "p_title" "text", "p_description" "text", "p_priority" "public"."priority_level", "p_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."convert_legacy_operational"("p_record_id" "uuid", "p_target_table" "text", "p_title" "text", "p_description" "text", "p_priority" "public"."priority_level", "p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_legacy_operational"("p_record_id" "uuid", "p_target_table" "text", "p_title" "text", "p_description" "text", "p_priority" "public"."priority_level", "p_project_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."convert_legacy_record"("p_record_id" "uuid", "p_target_table" "text", "p_title" "text", "p_description" "text", "p_priority" "public"."priority_level", "p_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."convert_legacy_record"("p_record_id" "uuid", "p_target_table" "text", "p_title" "text", "p_description" "text", "p_priority" "public"."priority_level", "p_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."convert_legacy_record"("p_record_id" "uuid", "p_target_table" "text", "p_title" "text", "p_description" "text", "p_priority" "public"."priority_level", "p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_legacy_record"("p_record_id" "uuid", "p_target_table" "text", "p_title" "text", "p_description" "text", "p_priority" "public"."priority_level", "p_project_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."convert_meeting_action_to_task"("action_id" "uuid", "task_priority" "public"."priority_level", "task_due_at" timestamp with time zone, "task_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."convert_meeting_action_to_task"("action_id" "uuid", "task_priority" "public"."priority_level", "task_due_at" timestamp with time zone, "task_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_meeting_action_to_task"("action_id" "uuid", "task_priority" "public"."priority_level", "task_due_at" timestamp with time zone, "task_project_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_my_notifications"("p_now" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_my_notifications"("p_now" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_my_notifications"("p_now" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_my_operational_notifications"("p_now" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_my_operational_notifications"("p_now" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_my_operational_notifications"("p_now" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_sponsor_dashboard"("p_access_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_sponsor_dashboard"("p_access_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_sponsor_dashboard"("p_access_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."portal_streamer_dashboard"("p_access_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."portal_streamer_dashboard"("p_access_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_streamer_dashboard"("p_access_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."read_social_account_credentials"("p_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."read_social_account_credentials"("p_account_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_my_notifications"("p_now" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_my_notifications"("p_now" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_my_notifications"("p_now" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_newsletter_subscription"("p_list_slug" "text", "p_email" "text", "p_display_name" "text", "p_token_hash" "text", "p_ip_hash" "text", "p_consent_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_newsletter_subscription"("p_list_slug" "text", "p_email" "text", "p_display_name" "text", "p_token_hash" "text", "p_ip_hash" "text", "p_consent_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_newsletter_subscription"("p_list_slug" "text", "p_email" "text", "p_display_name" "text", "p_token_hash" "text", "p_ip_hash" "text", "p_consent_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_newsletter_subscription"("p_list_slug" "text", "p_email" "text", "p_display_name" "text", "p_token_hash" "text", "p_ip_hash" "text", "p_consent_version" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_newsletter_unsubscription"("p_list_slug" "text", "p_email" "text", "p_token_hash" "text", "p_ip_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_newsletter_unsubscription"("p_list_slug" "text", "p_email" "text", "p_token_hash" "text", "p_ip_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_newsletter_unsubscription"("p_list_slug" "text", "p_email" "text", "p_token_hash" "text", "p_ip_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_newsletter_unsubscription"("p_list_slug" "text", "p_email" "text", "p_token_hash" "text", "p_ip_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."store_social_account_credentials"("p_account_id" "uuid", "p_access_token" "text", "p_refresh_token" "text", "p_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."store_social_account_credentials"("p_account_id" "uuid", "p_access_token" "text", "p_refresh_token" "text", "p_expires_at" timestamp with time zone) TO "service_role";


















GRANT ALL ON TABLE "private"."newsletter_subscription_requests" TO "service_role";



GRANT ALL ON TABLE "public"."acceptance_check_results" TO "anon";
GRANT ALL ON TABLE "public"."acceptance_check_results" TO "authenticated";
GRANT ALL ON TABLE "public"."acceptance_check_results" TO "service_role";



GRANT ALL ON TABLE "public"."acceptance_runs" TO "anon";
GRANT ALL ON TABLE "public"."acceptance_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."acceptance_runs" TO "service_role";



GRANT ALL ON TABLE "public"."activity_events" TO "anon";
GRANT ALL ON TABLE "public"."activity_events" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_events" TO "service_role";



GRANT ALL ON TABLE "public"."administrative_documents" TO "anon";
GRANT ALL ON TABLE "public"."administrative_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."administrative_documents" TO "service_role";



GRANT ALL ON TABLE "public"."ai_generations" TO "anon";
GRANT ALL ON TABLE "public"."ai_generations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_generations" TO "service_role";



GRANT ALL ON TABLE "public"."ai_prompt_templates" TO "anon";
GRANT ALL ON TABLE "public"."ai_prompt_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_prompt_templates" TO "service_role";



GRANT ALL ON TABLE "public"."approval_requests" TO "anon";
GRANT ALL ON TABLE "public"."approval_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_requests" TO "service_role";



GRANT ALL ON TABLE "public"."assets" TO "anon";
GRANT ALL ON TABLE "public"."assets" TO "authenticated";
GRANT ALL ON TABLE "public"."assets" TO "service_role";



GRANT ALL ON TABLE "public"."association_members" TO "anon";
GRANT ALL ON TABLE "public"."association_members" TO "authenticated";
GRANT ALL ON TABLE "public"."association_members" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."budget_envelopes" TO "anon";
GRANT ALL ON TABLE "public"."budget_envelopes" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_envelopes" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_deliverables" TO "anon";
GRANT ALL ON TABLE "public"."campaign_deliverables" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_deliverables" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."community_assignments" TO "anon";
GRANT ALL ON TABLE "public"."community_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."community_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."community_onboarding_items" TO "anon";
GRANT ALL ON TABLE "public"."community_onboarding_items" TO "authenticated";
GRANT ALL ON TABLE "public"."community_onboarding_items" TO "service_role";



GRANT ALL ON TABLE "public"."community_people" TO "anon";
GRANT ALL ON TABLE "public"."community_people" TO "authenticated";
GRANT ALL ON TABLE "public"."community_people" TO "service_role";



GRANT ALL ON TABLE "public"."community_person_roles" TO "anon";
GRANT ALL ON TABLE "public"."community_person_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."community_person_roles" TO "service_role";



GRANT ALL ON TABLE "public"."compliance_deadlines" TO "anon";
GRANT ALL ON TABLE "public"."compliance_deadlines" TO "authenticated";
GRANT ALL ON TABLE "public"."compliance_deadlines" TO "service_role";



GRANT ALL ON TABLE "public"."content_items" TO "anon";
GRANT ALL ON TABLE "public"."content_items" TO "authenticated";
GRANT ALL ON TABLE "public"."content_items" TO "service_role";



GRANT ALL ON TABLE "public"."email_communications" TO "anon";
GRANT ALL ON TABLE "public"."email_communications" TO "authenticated";
GRANT ALL ON TABLE "public"."email_communications" TO "service_role";



GRANT ALL ON TABLE "public"."email_templates" TO "anon";
GRANT ALL ON TABLE "public"."email_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."email_templates" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."finance_settings" TO "anon";
GRANT ALL ON TABLE "public"."finance_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_settings" TO "service_role";



GRANT ALL ON TABLE "public"."financial_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."financial_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."financial_documents" TO "anon";
GRANT ALL ON TABLE "public"."financial_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_documents" TO "service_role";



GRANT ALL ON TABLE "public"."google_resource_links" TO "anon";
GRANT ALL ON TABLE "public"."google_resource_links" TO "authenticated";
GRANT ALL ON TABLE "public"."google_resource_links" TO "service_role";



GRANT ALL ON TABLE "public"."governance_mandates" TO "anon";
GRANT ALL ON TABLE "public"."governance_mandates" TO "authenticated";
GRANT ALL ON TABLE "public"."governance_mandates" TO "service_role";



GRANT ALL ON TABLE "public"."inbox_items" TO "anon";
GRANT ALL ON TABLE "public"."inbox_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inbox_items" TO "service_role";



GRANT ALL ON TABLE "public"."income_entries" TO "anon";
GRANT ALL ON TABLE "public"."income_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."income_entries" TO "service_role";



GRANT ALL ON TABLE "public"."integration_connections" TO "anon";
GRANT ALL ON TABLE "public"."integration_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_connections" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_articles" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_articles" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_articles" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_categories" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_categories" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_revisions" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_revisions" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_revisions" TO "service_role";



GRANT ALL ON TABLE "public"."kpi_records" TO "anon";
GRANT ALL ON TABLE "public"."kpi_records" TO "authenticated";
GRANT ALL ON TABLE "public"."kpi_records" TO "service_role";



GRANT ALL ON TABLE "public"."legacy_records" TO "anon";
GRANT ALL ON TABLE "public"."legacy_records" TO "authenticated";
GRANT ALL ON TABLE "public"."legacy_records" TO "service_role";



GRANT ALL ON TABLE "public"."mailing_lists" TO "anon";
GRANT ALL ON TABLE "public"."mailing_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."mailing_lists" TO "service_role";



GRANT ALL ON TABLE "public"."mailing_subscribers" TO "anon";
GRANT ALL ON TABLE "public"."mailing_subscribers" TO "authenticated";
GRANT ALL ON TABLE "public"."mailing_subscribers" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_action_items" TO "anon";
GRANT ALL ON TABLE "public"."meeting_action_items" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_action_items" TO "service_role";



GRANT ALL ON TABLE "public"."meetings" TO "anon";
GRANT ALL ON TABLE "public"."meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."meetings" TO "service_role";



GRANT ALL ON TABLE "public"."merch_launches" TO "anon";
GRANT ALL ON TABLE "public"."merch_launches" TO "authenticated";
GRANT ALL ON TABLE "public"."merch_launches" TO "service_role";



GRANT ALL ON TABLE "public"."migration_source_links" TO "anon";
GRANT ALL ON TABLE "public"."migration_source_links" TO "authenticated";
GRANT ALL ON TABLE "public"."migration_source_links" TO "service_role";



GRANT ALL ON TABLE "public"."newsletters" TO "anon";
GRANT ALL ON TABLE "public"."newsletters" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletters" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."organization_access_roles" TO "anon";
GRANT ALL ON TABLE "public"."organization_access_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_access_roles" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."partner_contacts" TO "anon";
GRANT ALL ON TABLE "public"."partner_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."partner_interactions" TO "anon";
GRANT ALL ON TABLE "public"."partner_interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_interactions" TO "service_role";



GRANT ALL ON TABLE "public"."partners" TO "anon";
GRANT ALL ON TABLE "public"."partners" TO "authenticated";
GRANT ALL ON TABLE "public"."partners" TO "service_role";



GRANT ALL ON TABLE "public"."portal_access" TO "anon";
GRANT ALL ON TABLE "public"."portal_access" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_access" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."project_members" TO "anon";
GRANT ALL ON TABLE "public"."project_members" TO "authenticated";
GRANT ALL ON TABLE "public"."project_members" TO "service_role";



GRANT ALL ON TABLE "public"."project_milestones" TO "anon";
GRANT ALL ON TABLE "public"."project_milestones" TO "authenticated";
GRANT ALL ON TABLE "public"."project_milestones" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."record_links" TO "anon";
GRANT ALL ON TABLE "public"."record_links" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."record_links" TO "authenticated";



GRANT ALL ON TABLE "public"."record_relationships" TO "anon";
GRANT ALL ON TABLE "public"."record_relationships" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."record_relationships" TO "authenticated";



GRANT ALL ON TABLE "public"."saved_views" TO "anon";
GRANT ALL ON TABLE "public"."saved_views" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_views" TO "service_role";



GRANT ALL ON TABLE "public"."shop_products" TO "anon";
GRANT ALL ON TABLE "public"."shop_products" TO "authenticated";
GRANT ALL ON TABLE "public"."shop_products" TO "service_role";



GRANT ALL ON TABLE "public"."social_accounts" TO "anon";
GRANT ALL ON TABLE "public"."social_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."social_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."social_metric_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."social_metric_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."social_metric_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."social_post_variants" TO "anon";
GRANT ALL ON TABLE "public"."social_post_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."social_post_variants" TO "service_role";



GRANT ALL ON TABLE "public"."social_posts" TO "anon";
GRANT ALL ON TABLE "public"."social_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."social_posts" TO "service_role";



GRANT ALL ON TABLE "public"."social_sync_runs" TO "anon";
GRANT ALL ON TABLE "public"."social_sync_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."social_sync_runs" TO "service_role";



GRANT ALL ON TABLE "public"."task_assignees" TO "anon";
GRANT ALL ON TABLE "public"."task_assignees" TO "authenticated";
GRANT ALL ON TABLE "public"."task_assignees" TO "service_role";



GRANT ALL ON TABLE "public"."task_checklist_items" TO "anon";
GRANT ALL ON TABLE "public"."task_checklist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."task_checklist_items" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































