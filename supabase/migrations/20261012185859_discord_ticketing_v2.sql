begin;
-- Local review only. No client credentials or Discord tokens are persisted here.
create function private.can_manage_discord_bot(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members m left join public.organization_access_roles r on r.id=m.access_role_id and r.organization_id=m.organization_id and r.deleted_at is null
 where m.organization_id=p_org and m.user_id=auth.uid() and m.status='active' and (m.role in ('admin','board') or 'manageDiscordBot'=any(coalesce(r.capabilities,'{}'))));
$$;
revoke all on function private.can_manage_discord_bot(uuid) from public,anon;
grant execute on function private.can_manage_discord_bot(uuid) to authenticated,service_role;
create table public.discord_bot_servers(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),guild_id text not null check(guild_id~'^[1-9][0-9]{16,19}$'),application_id text check(application_id~'^[1-9][0-9]{16,19}$'),name text not null check(length(name) between 1 and 80),version integer not null default 1,
 intake_active boolean not null default false,legacy_parent_channel_id text, runtime_version text,features text[] not null default '{}',last_report_at timestamptz,client_id text,
 verified_user_id uuid,verified_discord_id text,verified_at timestamptz,configuration_revision_id uuid,
 created_at timestamptz not null default now(), unique(guild_id),unique(organization_id,id));
create table public.discord_bot_channels(
 organization_id uuid not null,server_id uuid not null,channel_id text not null check(channel_id~'^[1-9][0-9]{16,19}$'),name text not null check(length(name) between 1 and 100),channel_type integer not null check(channel_type=0),permissions_ok boolean not null default false,missing_permissions text[] not null default '{}',checked_at timestamptz not null default now(),
 primary key(organization_id,server_id,channel_id),foreign key(organization_id,server_id) references public.discord_bot_servers(organization_id,id) on delete cascade);
create table public.discord_ticket_types(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,server_id uuid not null,draft jsonb not null,version integer not null default 1,active boolean not null default false,archived boolean not null default false,legacy boolean not null default false,
 created_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,server_id,id),foreign key(organization_id,server_id) references public.discord_bot_servers(organization_id,id));
create table public.discord_ticket_type_revisions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,server_id uuid not null,type_id uuid not null,version integer not null,payload jsonb not null,created_at timestamptz not null default now(),
 unique(organization_id,id),foreign key(organization_id,server_id,type_id) references public.discord_ticket_types(organization_id,server_id,id));
create table public.discord_ticket_panels(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,server_id uuid not null,draft jsonb not null,version integer not null default 1,enabled boolean not null default false,
 message_id text,channel_id text,published_revision_id uuid,created_at timestamptz not null default now(),unique(organization_id,id),unique(organization_id,server_id,id),foreign key(organization_id,server_id) references public.discord_bot_servers(organization_id,id));
create table public.discord_ticket_panel_revisions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,server_id uuid not null,panel_id uuid not null,version integer not null,payload jsonb not null,created_at timestamptz not null default now(),
 unique(organization_id,id),foreign key(organization_id,server_id,panel_id) references public.discord_ticket_panels(organization_id,server_id,id));
create table public.discord_ticket_intents(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,server_id uuid not null,client_id text not null,guild_id text not null,actor text not null,type_revision_id uuid not null,panel_id uuid,source text not null check(source in ('panel','slash')),source_interaction_id text not null,request_hash text not null,expires_at timestamptz not null default now()+interval '30 minutes',consumed_key text,ticket_id uuid,
 unique(organization_id,client_id,source_interaction_id),foreign key(organization_id,server_id) references public.discord_bot_servers(organization_id,id),foreign key(organization_id,type_revision_id) references public.discord_ticket_type_revisions(organization_id,id),foreign key(organization_id,panel_id) references public.discord_ticket_panels(organization_id,id));
create table public.discord_bot_config_deliveries(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,server_id uuid not null,client_id text,kind text not null check(kind in ('publish_panel','disable_panel','check_channel','verify_server_admin')),panel_id uuid,revision_id uuid,channel_id text,message_id text,
 payload jsonb not null default '{}',payload_hash text not null,sequence bigint generated always as identity,state text not null default 'pending' check(state in ('pending','leased','delivered','failed','uncertain','cancelled')),
 lease_token uuid,worker_id text,leased_until timestamptz,completed_request_hash text,attempts integer not null default 0,last_error text,created_at timestamptz not null default now(),
 foreign key(organization_id,server_id) references public.discord_bot_servers(organization_id,id),foreign key(organization_id,panel_id) references public.discord_ticket_panels(organization_id,id),foreign key(organization_id,revision_id) references public.discord_ticket_panel_revisions(organization_id,id));
create table public.discord_bot_config_audit(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,server_id uuid not null,actor_user_id uuid,action text not null,version integer,created_at timestamptz not null default now(),foreign key(organization_id,server_id) references public.discord_bot_servers(organization_id,id));
alter table public.support_tickets add column type_id uuid,add column type_revision_id uuid,add column intake_snapshot jsonb,add column intake_answers jsonb;
alter table public.support_tickets add constraint ticket_type_org foreign key(organization_id,type_id) references public.discord_ticket_types(organization_id,id),add constraint ticket_revision_org foreign key(organization_id,type_revision_id) references public.discord_ticket_type_revisions(organization_id,id);
create index discord_config_claim on public.discord_bot_config_deliveries(organization_id,server_id,sequence) where state not in ('delivered','cancelled');
create index discord_intents_expiry on public.discord_ticket_intents(expires_at);
create index discord_revisions_type on public.discord_ticket_type_revisions(type_id,created_at);
create index discord_panels_server on public.discord_ticket_panels(server_id);
do $$ declare tab text; begin
 foreach tab in array array['discord_bot_servers','discord_bot_channels','discord_ticket_types','discord_ticket_type_revisions','discord_ticket_panels','discord_ticket_panel_revisions','discord_ticket_intents','discord_bot_config_deliveries','discord_bot_config_audit'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('revoke all on public.%I from public,anon,authenticated',tab);
 execute format('grant all on public.%I to service_role',tab);
 if tab<>'discord_ticket_intents' then
 execute format('grant select on public.%I to authenticated',tab);
 execute format('create policy bot_manager_read on public.%I for select to authenticated using(private.can_manage_discord_bot(organization_id))',tab);
 end if;
 end loop;
end $$;
grant usage,select on sequence public.discord_bot_config_deliveries_sequence_seq to service_role;
create function private.discord_revision_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'immutable_revision';end$$;
create trigger discord_type_immutable before update or delete on public.discord_ticket_type_revisions for each row execute function private.discord_revision_immutable();
create trigger discord_panel_immutable before update or delete on public.discord_ticket_panel_revisions for each row execute function private.discord_revision_immutable();
revoke all on function private.discord_revision_immutable() from public,anon,authenticated;
-- Import only proven, already stored legacy bindings. No template teams or images.
do $$ declare r record;s uuid;begin
 for r in select distinct on(organization_id,guild_id) organization_id,guild_id,parent_channel_id from public.support_tickets order by organization_id,guild_id,created_at loop
 insert into public.discord_bot_servers(organization_id,guild_id,name,legacy_parent_channel_id) values(r.organization_id,r.guild_id,'Bestaande Discordserver',r.parent_channel_id) returning id into s;
 insert into public.discord_ticket_types(organization_id,server_id,legacy,active,draft) values(r.organization_id,s,true,true,jsonb_build_object('name','Algemene vraag','description','','active',true,'eligibility','everyone','parentChannelId',r.parent_channel_id,'formTitle','Algemene vraag','subjectQuestionId','onderwerp','sortOrder',0,'embed',jsonb_build_object('title','Algemene vraag','description','Gesprekken vinden plaats in een privéthread.','color','#d8222a','footer',''),'questions',jsonb_build_array(jsonb_build_object('id','onderwerp','label','Onderwerp','description','','placeholder','','kind','short','required',true,'minLength',1,'maxLength',160),jsonb_build_object('id','omschrijving','label','Waarmee kunnen we je helpen?','description','','placeholder','','kind','paragraph','required',true,'minLength',1,'maxLength',4000))));
 end loop;
end$$;
-- Existing ticket content remains byte-for-byte unchanged. Null snapshots display as historical.
-- Discord and JavaScript bounds count UTF-16 units, including astral Unicode.
create function private.discord_utf16_length(v text) returns integer language sql immutable set search_path='' as $$select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0)::integer from unnest(string_to_array(v,null)) ch$$;
revoke all on function private.discord_utf16_length(text) from public,anon,authenticated;
grant execute on function private.discord_utf16_length(text) to service_role;
create function private.discord_embed_valid(e jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(e)='object' and (select count(*)=4 from jsonb_object_keys(e)) and e ?& array['title','description','color','footer'] and not exists(select 1 from jsonb_each(e) prop where jsonb_typeof(prop.value)<>'string') and private.discord_utf16_length(e->>'title') between 1 and 256 and private.discord_utf16_length(e->>'description') between 1 and 4096 and private.discord_utf16_length(e->>'footer')<=2048 and (e->>'color')~'^#[0-9a-fA-F]{6}$' and private.discord_utf16_length(e->>'title')+private.discord_utf16_length(e->>'description')+private.discord_utf16_length(e->>'footer')<=6000;
$$;
create function private.discord_type_valid(t jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare q jsonb; o jsonb; ids text[]:='{}';opts text[];k text;begin
 if jsonb_typeof(t)<>'object' or (select count(*) from jsonb_object_keys(t))<>10 or not(t ?& array['name','description','active','eligibility','parentChannelId','formTitle','subjectQuestionId','sortOrder','embed','questions']) then return false;end if;
 -- Ten semantic fields including sortOrder: explicitly reject arbitrary runtime instructions.
 if exists(select 1 from jsonb_object_keys(t) key where key not in ('name','description','active','eligibility','parentChannelId','formTitle','subjectQuestionId','sortOrder','embed','questions')) then return false;end if;
 if jsonb_typeof(t->'name')<>'string' or jsonb_typeof(t->'description')<>'string' or jsonb_typeof(t->'parentChannelId')<>'string' or jsonb_typeof(t->'formTitle')<>'string' or jsonb_typeof(t->'eligibility')<>'string' or (t->>'sortOrder')!~'^[0-9]{1,4}$' then return false;end if;
 if private.discord_utf16_length(t->>'name') not between 1 and 80 or private.discord_utf16_length(t->>'description')>100 or t->>'eligibility' not in ('everyone','linked') or jsonb_typeof(t->'active')<>'boolean' or t->>'parentChannelId'!~'^[1-9][0-9]{16,19}$' or private.discord_utf16_length(t->>'formTitle') not between 1 and 45 or not private.discord_embed_valid(t->'embed') or jsonb_typeof(t->'questions')<>'array' or jsonb_array_length(t->'questions') not between 1 and 5 then return false;end if;
 for q in select value from jsonb_array_elements(t->'questions') loop
 if jsonb_typeof(q)<>'object' or not(q ?& array['id','label','description','placeholder','kind','required']) or exists(select 1 from jsonb_each(q) prop where prop.key in ('id','label','description','placeholder','kind') and jsonb_typeof(prop.value)<>'string') then return false;end if;
 if q->>'id'!~'^[a-zA-Z0-9_-]{1,40}$' or q->>'id'=any(ids) or private.discord_utf16_length(q->>'label') not between 1 and 45 or private.discord_utf16_length(q->>'description')>100 or private.discord_utf16_length(q->>'placeholder')>100 or jsonb_typeof(q->'required')<>'boolean' then return false;end if;ids:=array_append(ids,q->>'id');k:=q->>'kind';
 if k in ('short','paragraph') then
 if not(q ?& array['minLength','maxLength']) or (select count(*) from jsonb_object_keys(q))<>8 or (q->>'minLength')!~'^[0-9]{1,4}$' or (q->>'maxLength')!~'^[0-9]{1,4}$' then return false;end if;
 if (q->>'minLength')::integer<0 or (q->>'maxLength')::integer not between 1 and 4000 or (q->>'minLength')::integer>(q->>'maxLength')::integer then return false;end if;
 elsif k in ('single','multi') then
 if not(q ?& array['options','maxValues']) or (select count(*) from jsonb_object_keys(q))<>8 or (q->>'maxValues')!~'^[0-9]{1,2}$' then return false;end if;
 if jsonb_typeof(q->'options')<>'array' or jsonb_array_length(q->'options') not between 1 and 25 or (q->>'maxValues')::integer not between 1 and jsonb_array_length(q->'options') or (k='single' and (q->>'maxValues')::integer<>1) then return false;end if;
 opts:='{}';for o in select value from jsonb_array_elements(q->'options') loop if not(o ?& array['value','label']) or (select count(*) from jsonb_object_keys(o))<>2 or jsonb_typeof(o->'value')<>'string' or jsonb_typeof(o->'label')<>'string' or o->>'value'!~'^[a-zA-Z0-9_-]{1,40}$' or o->>'value'=any(opts) or private.discord_utf16_length(o->>'label') not between 1 and 100 then return false;end if;opts:=array_append(opts,o->>'value');end loop;
 else return false;end if;
 end loop;
 if t->>'subjectQuestionId' is not null and not exists(select 1 from jsonb_array_elements(t->'questions') question_row where question_row->>'id'=t->>'subjectQuestionId' and question_row->>'kind' in ('short','paragraph')) then return false;end if;
 return true;exception when others then return false;end$$;
create function private.discord_answers(t jsonb,a jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare q jsonb;v jsonb;o jsonb;r jsonb:='{}';txt text;begin
 if jsonb_typeof(a)<>'object' or exists(select 1 from jsonb_object_keys(a) k where not exists(select 1 from jsonb_array_elements(t->'questions') question_row where question_row->>'id'=k)) then raise exception 'invalid_answers';end if;
 for q in select value from jsonb_array_elements(t->'questions') loop
 v:=a->(q->>'id');
 if q->>'kind' in ('short','paragraph') then
 if v is null and q->>'required'='false' then v:='""';end if;
 if jsonb_typeof(v)<>'string' or v is null then raise exception 'invalid_answers';end if;txt:=btrim(v#>>'{}',E' \t\n\r\v\f'||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279));
 if private.discord_utf16_length(v#>>'{}')>(q->>'maxLength')::integer or (private.discord_utf16_length(txt)>0 and private.discord_utf16_length(txt)<(q->>'minLength')::integer) or (q->>'required'='true' and txt='') then raise exception 'invalid_answers';end if;v:=to_jsonb(txt);
 else
 if v is null and q->>'required'='false' then v:='[]';end if;
 if v is null or jsonb_typeof(v)<>'array' or jsonb_array_length(v)>(q->>'maxValues')::integer or (q->>'required'='true' and jsonb_array_length(v)=0) then raise exception 'invalid_answers';end if;
 if (select count(*) from jsonb_array_elements(v))<>(select count(distinct value) from jsonb_array_elements(v)) or exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x)<>'string' or not exists(select 1 from jsonb_array_elements(q->'options') opt where opt->>'value'=x#>>'{}')) then raise exception 'invalid_answers';end if;
 end if;r:=r||jsonb_build_object(q->>'id',v);
 end loop;return r;end$$;
revoke all on function private.discord_embed_valid(jsonb),private.discord_type_valid(jsonb),private.discord_answers(jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.discord_embed_valid(jsonb),private.discord_type_valid(jsonb),private.discord_answers(jsonb,jsonb) to service_role;
create function private.discord_staff_action(p_org uuid,p_server uuid,p_op text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.discord_bot_servers;t public.discord_ticket_types;p public.discord_ticket_panels;tid uuid;rid uuid;refs jsonb:='[]';payload jsonb;rev uuid;actor text;target uuid;expected integer;begin
 if auth.uid() is null or not private.can_manage_discord_bot(p_org) then raise exception 'discord_bot_forbidden';end if;
 if p_op='server_create' then
 if length(p_data->>'name') not between 1 and 80 or p_data->>'guildId'!~'^[1-9][0-9]{16,19}$' or p_data->>'applicationId'!~'^[1-9][0-9]{16,19}$' then return jsonb_build_object('error','invalid_config');end if;
 if exists(select 1 from public.discord_bot_servers where guild_id=p_data->>'guildId') then return jsonb_build_object('error','guild_conflict');end if;
 insert into public.discord_bot_servers(organization_id,guild_id,application_id,name) values(p_org,p_data->>'guildId',p_data->>'applicationId',p_data->>'name') returning * into s;
 else
 select * into s from public.discord_bot_servers where id=p_server and organization_id=p_org for update;
 if s.id is null then return jsonb_build_object('error','server_unavailable');end if;
 if p_op in ('server_save','activate','pause') and s.version<>(p_data->>'version')::integer then return jsonb_build_object('error','version_conflict');end if;
 if p_op='server_save' then
 if length(p_data->>'name') not between 1 and 80 or p_data->>'applicationId'!~'^[1-9][0-9]{16,19}$' then return jsonb_build_object('error','invalid_config');end if;
 if s.application_id is not null and s.application_id<>p_data->>'applicationId' then return jsonb_build_object('error','invalid_config');end if;
 update public.discord_bot_servers set name=p_data->>'name',application_id=p_data->>'applicationId',version=version+1 where id=s.id returning * into s;
 elsif p_op in ('verify','activate') then
 select coalesce(i.identity_data->>'provider_id',i.identity_data->>'sub',i.provider_id) into actor from auth.identities i where i.user_id=auth.uid() and i.provider='discord' limit 1;
 if actor is null or actor!~'^[1-9][0-9]{16,19}$' then return jsonb_build_object('error','identity_required');end if;
 if p_op='activate' then
 if s.verified_user_id is distinct from auth.uid() or s.verified_discord_id is distinct from actor or s.verified_at is null or s.verified_at<now()-interval '10 minutes' then return jsonb_build_object('error','verification_required');end if;
 if s.last_report_at is null or s.last_report_at<now()-interval '5 minutes' or not s.features @> array['typed_intake','ticket_panels','label_modals'] then return jsonb_build_object('error','runtime_required');end if;
 update public.discord_bot_servers set intake_active=true,version=version+1 where id=s.id returning * into s;
 else
 if s.application_id is null then return jsonb_build_object('error','invalid_config');end if;
 if exists(select 1 from public.discord_bot_config_deliveries where server_id=s.id and kind='verify_server_admin' and state not in ('delivered','cancelled','failed')) then return jsonb_build_object('error','publication_busy');end if;
 payload:=jsonb_build_object('discordUserId',actor,'ccUserId',auth.uid(),'applicationId',s.application_id);
 insert into public.discord_bot_config_deliveries(organization_id,server_id,client_id,kind,payload,payload_hash) values(p_org,s.id,s.client_id,'verify_server_admin',payload,encode(sha256(convert_to(payload::text,'UTF8')),'hex'));
 end if;
 elsif p_op='pause' then
 update public.discord_bot_servers set intake_active=false,version=version+1 where id=s.id returning * into s;
 elsif p_op='check_channel' then
 if not exists(select 1 from public.discord_bot_channels where server_id=s.id and channel_id=p_data->>'channelId') then return jsonb_build_object('error','channel_required');end if;
 if exists(select 1 from public.discord_bot_config_deliveries where server_id=s.id and kind='check_channel' and channel_id=p_data->>'channelId' and state not in ('delivered','cancelled','failed')) then return jsonb_build_object('error','publication_busy');end if;
 payload:=jsonb_build_object('applicationId',s.application_id);
 insert into public.discord_bot_config_deliveries(organization_id,server_id,client_id,kind,channel_id,payload,payload_hash) values(p_org,s.id,s.client_id,'check_channel',p_data->>'channelId',payload,encode(sha256(convert_to(payload::text,'UTF8')),'hex'));
 elsif p_op in ('type_save','type_archive','type_duplicate') then
 target:=nullif(p_data->>'id','')::uuid;
 if target is not null then select * into t from public.discord_ticket_types where id=target and server_id=s.id and organization_id=p_org for update;
 if t.id is null then return jsonb_build_object('error','invalid_config');end if;
 if t.version<>(p_data->>'version')::integer then return jsonb_build_object('error','version_conflict');end if;end if;
 if p_op='type_archive' then
 if t.legacy then return jsonb_build_object('error','legacy_required');end if;
 update public.discord_ticket_types set archived=true,active=false,version=version+1 where id=t.id;
 elsif p_op='type_duplicate' then
 payload:=t.draft||jsonb_build_object('active',false,'name',left(t.draft->>'name',70)||' (kopie)');
 insert into public.discord_ticket_types(organization_id,server_id,draft) values(p_org,s.id,payload) returning id into target;
 else
 payload:=p_data->'draft';if not coalesce(private.discord_type_valid(payload),false) then return jsonb_build_object('error','invalid_config');end if;
 if t.legacy and (payload->>'active'<>'true' or payload->>'eligibility'<>'everyone' or payload->>'parentChannelId'<>s.legacy_parent_channel_id) then return jsonb_build_object('error','legacy_required');end if;
 if target is null then insert into public.discord_ticket_types(organization_id,server_id,draft,active) values(p_org,s.id,payload,(payload->>'active')::boolean) returning id into target;
 else update public.discord_ticket_types set draft=payload,active=(payload->>'active')::boolean,version=version+1 where id=target;end if;
 end if;
 elsif p_op='panel_save' then
 payload:=p_data->'draft';
 if jsonb_typeof(payload)<>'object' or not(payload ?& array['name','channelId','typeIds','embed']) or (select count(*) from jsonb_object_keys(payload))<>4 or jsonb_typeof(payload->'name')<>'string' or jsonb_typeof(payload->'channelId')<>'string' then return jsonb_build_object('error','invalid_config');end if;
 if length(payload->>'name') not between 1 and 80 or payload->>'channelId'!~'^[1-9][0-9]{16,19}$' or not coalesce(private.discord_embed_valid(payload->'embed'),false) or jsonb_typeof(payload->'typeIds')<>'array' or jsonb_array_length(payload->'typeIds') not between 1 and 25 or (select count(distinct value) from jsonb_array_elements(payload->'typeIds'))<>jsonb_array_length(payload->'typeIds') then return jsonb_build_object('error','invalid_config');end if;
 for tid in select (value#>>'{}')::uuid from jsonb_array_elements(payload->'typeIds') loop
 if not exists(select 1 from public.discord_ticket_types where id=tid and organization_id=p_org and server_id=s.id and not archived) then return jsonb_build_object('error','invalid_config');end if;end loop;
 target:=nullif(p_data->>'id','')::uuid;
 if target is null then insert into public.discord_ticket_panels(organization_id,server_id,draft) values(p_org,s.id,payload) returning id into target;
 else update public.discord_ticket_panels set draft=payload,version=version+1 where id=target and server_id=s.id and organization_id=p_org and version=(p_data->>'version')::integer;
 if not found then return jsonb_build_object('error','version_conflict');end if;end if;
 elsif p_op in ('publish','disable','recover') then
 target:=(p_data->>'id')::uuid;
 select * into p from public.discord_ticket_panels where id=target and organization_id=p_org and server_id=s.id for update;
 if p.id is null then return jsonb_build_object('error','invalid_config');end if;
 if p.version<>(p_data->>'version')::integer then return jsonb_build_object('error','version_conflict');end if;
 if p_op='recover' then
 update public.discord_bot_config_deliveries set state='uncertain',attempts=0 where panel_id=p.id and state in ('failed','uncertain');
 elsif p_op='disable' then
 update public.discord_ticket_panels set enabled=false,version=version+1 where id=p.id;
 update public.discord_bot_config_deliveries set state='cancelled' where panel_id=p.id and kind='publish_panel' and state in ('pending','failed');
 if p.message_id is not null then
 payload:=jsonb_build_object('applicationId',s.application_id,'expectedBotAuthorId',s.application_id);
 insert into public.discord_bot_config_deliveries(organization_id,server_id,client_id,kind,panel_id,channel_id,message_id,payload,payload_hash) values(p_org,s.id,s.client_id,'disable_panel',p.id,p.channel_id,p.message_id,payload,encode(sha256(convert_to(payload::text,'UTF8')),'hex'));end if;
 else
 if not s.intake_active or s.last_report_at is null or s.last_report_at<now()-interval '5 minutes' or not s.features @> array['typed_intake','ticket_panels','label_modals'] then return jsonb_build_object('error','runtime_required');end if;
 if exists(select 1 from public.discord_bot_config_deliveries where panel_id=p.id and state not in ('delivered','cancelled')) then return jsonb_build_object('error','publication_busy');end if;
 if not exists(select 1 from public.discord_bot_channels where server_id=s.id and channel_id=p.draft->>'channelId' and permissions_ok and checked_at>=now()-interval '10 minutes') then return jsonb_build_object('error','channel_required');end if;
 -- Channel moves require explicit disabling/reconciliation first; never abandon a live message.
 if p.message_id is not null and p.channel_id is distinct from p.draft->>'channelId' then return jsonb_build_object('error','publication_busy');end if;
 for tid in select (value#>>'{}')::uuid from jsonb_array_elements(p.draft->'typeIds') loop
 select * into t from public.discord_ticket_types where id=tid and server_id=s.id and organization_id=p_org and active and not archived for update;
 if t.id is null or not exists(select 1 from public.discord_bot_channels where server_id=s.id and channel_id=t.draft->>'parentChannelId' and permissions_ok and checked_at>=now()-interval '10 minutes') then return jsonb_build_object('error','channel_required');end if;
 end loop;
 for tid in select (value#>>'{}')::uuid from jsonb_array_elements(p.draft->'typeIds') loop
 select * into t from public.discord_ticket_types where id=tid and server_id=s.id and organization_id=p_org and active and not archived for update;
 if t.id is null or not exists(select 1 from public.discord_bot_channels where server_id=s.id and channel_id=t.draft->>'parentChannelId' and permissions_ok and checked_at>=now()-interval '10 minutes') then return jsonb_build_object('error','channel_required');end if;
 insert into public.discord_ticket_type_revisions(organization_id,server_id,type_id,version,payload) values(p_org,s.id,t.id,t.version,t.draft) returning id into rid;
 refs:=refs||jsonb_build_array(rid);
 end loop;
 payload:=jsonb_build_object('schemaVersion',2,'embed',p.draft->'embed','typeRevisionIds',refs,'channelId',p.draft->>'channelId','allowedMentions',jsonb_build_object('parse','[]'::jsonb));
 insert into public.discord_ticket_panel_revisions(organization_id,server_id,panel_id,version,payload) values(p_org,s.id,p.id,p.version,payload) returning id into rev;
 payload:=payload||jsonb_build_object('applicationId',s.application_id,'expectedBotAuthorId',s.application_id,'typeRevisions',(select jsonb_agg(rv.payload||jsonb_build_object('revisionId',rv.id,'typeId',rv.type_id)) from public.discord_ticket_type_revisions rv where refs @> jsonb_build_array(rv.id)));
 insert into public.discord_bot_config_deliveries(organization_id,server_id,client_id,kind,panel_id,revision_id,channel_id,message_id,payload,payload_hash) values(p_org,s.id,s.client_id,'publish_panel',p.id,rev,p.draft->>'channelId',p.message_id,payload,encode(sha256(convert_to(payload::text,'UTF8')),'hex'));
 update public.discord_ticket_panels set enabled=true,version=version+1 where id=p.id;
 end if;
 else return jsonb_build_object('error','invalid_config');end if;
 end if;
 insert into public.discord_bot_config_audit(organization_id,server_id,actor_user_id,action,version) values(p_org,s.id,auth.uid(),p_op,s.version);
 return jsonb_build_object('saved',true,'serverId',s.id,'id',target,'version',s.version);
exception when unique_violation then return jsonb_build_object('error','guild_conflict');when invalid_text_representation or check_violation then return jsonb_build_object('error','invalid_config');end$$;
create function public.discord_bot_staff_action(p_org uuid,p_server uuid,p_op text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.discord_staff_action(p_org,p_server,p_op,p_data)$$;
revoke all on function private.discord_staff_action(uuid,uuid,text,jsonb),public.discord_bot_staff_action(uuid,uuid,text,jsonb) from public,anon;
grant execute on function private.discord_staff_action(uuid,uuid,text,jsonb),public.discord_bot_staff_action(uuid,uuid,text,jsonb) to authenticated;

create function public.discord_bot_operation(p_org uuid,p_client text,p_guild text,p_op text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.discord_bot_servers;p public.discord_ticket_panels;t public.discord_ticket_types;r public.discord_ticket_type_revisions;pr public.discord_ticket_panel_revisions;d public.discord_bot_config_deliveries;i public.discord_ticket_intents;item record;result jsonb;claimed jsonb:='[]';v_actor text:=p_data->>'discord_user_id';v_key text:=p_data->>'idempotency_key';answers jsonb;subject text;ticket uuid;count_used integer;can_intake boolean;begin
 select * into s from public.discord_bot_servers where organization_id=p_org and guild_id=p_guild for update;
 if s.id is null then return jsonb_build_object('error','server_unavailable');end if;
 insert into public.support_ticket_rate_limits values(p_org,p_client,'config:'||coalesce(v_actor,'client'),clock_timestamp(),1) on conflict(organization_id,client_id,bucket) do update set count=case when support_ticket_rate_limits.window_at<clock_timestamp()-interval '1 minute' then 1 else support_ticket_rate_limits.count+1 end,window_at=case when support_ticket_rate_limits.window_at<clock_timestamp()-interval '1 minute' then clock_timestamp() else support_ticket_rate_limits.window_at end returning count into count_used;
 if count_used>(case when v_actor is null then 120 else 20 end) then return jsonb_build_object('error','rate_limited');end if;
 can_intake:=s.intake_active and s.last_report_at>=now()-interval '5 minutes' and s.features @> array['typed_intake','ticket_panels','label_modals'];
 if p_op='report' then
 if s.application_id is null or p_data->>'application_id' is distinct from s.application_id or p_data->>'installed'<>'true' then return jsonb_build_object('error','server_unavailable');end if;
 update public.discord_bot_servers set runtime_version=p_data->>'runtime_version',features=array(select jsonb_array_elements_text(p_data->'features')),last_report_at=now(),client_id=p_client where id=s.id;
 -- Channel catalogue is metadata only; permissions become authoritative via a leased check.
 delete from public.discord_bot_channels where server_id=s.id and not(channel_id in(select value->>'id' from jsonb_array_elements(p_data->'channels')));
 for item in select value from jsonb_array_elements(p_data->'channels') loop
 insert into public.discord_bot_channels(organization_id,server_id,channel_id,name,channel_type) values(p_org,s.id,item.value->>'id',item.value->>'name',0) on conflict(organization_id,server_id,channel_id) do update set name=excluded.name;
 end loop;return jsonb_build_object('recorded',true);
 elsif p_op='config' then
 if not coalesce(can_intake,false) then return jsonb_build_object('schemaVersion',2,'guildId',p_guild,'configurationRevisionId',s.configuration_revision_id,'generatedAt',now(),'features','[]'::jsonb,'panels','[]'::jsonb,'typeRevisions','[]'::jsonb);end if;
 return jsonb_build_object('schemaVersion',2,'guildId',p_guild,'configurationRevisionId',s.configuration_revision_id,'generatedAt',now(),'features',to_jsonb(s.features),
 'panels',coalesce((select jsonb_agg(jsonb_build_object('panelId',cp.id,'revisionId',cp.published_revision_id,'channelId',cp.channel_id,'messageId',cp.message_id,'embed',rv.payload->'embed','typeRevisionIds',rv.payload->'typeRevisionIds')) from public.discord_ticket_panels cp join public.discord_ticket_panel_revisions rv on rv.id=cp.published_revision_id where cp.server_id=s.id and cp.enabled and cp.message_id is not null),'[]'),
 'typeRevisions',coalesce((select jsonb_agg(rv.payload||jsonb_build_object('revisionId',rv.id,'typeId',rv.type_id)) from public.discord_ticket_type_revisions rv join public.discord_ticket_types tt on tt.id=rv.type_id where rv.server_id=s.id and tt.active and not tt.archived and exists(select 1 from public.discord_ticket_panels pp join public.discord_ticket_panel_revisions pv on pv.id=pp.published_revision_id where pp.server_id=s.id and pp.enabled and pp.message_id is not null and pv.payload->'typeRevisionIds' @> jsonb_build_array(rv.id))),'[]'));
 elsif p_op='revision' then
 if to_timestamp(((v_key::numeric / 4194304)::bigint + 1420070400000)/1000.0)<now()-interval '30 minutes' or to_timestamp(((v_key::numeric / 4194304)::bigint + 1420070400000)/1000.0)>now()+interval '5 minutes' then return jsonb_build_object('error','interaction_expired');end if;
 if not coalesce(can_intake,false) then return jsonb_build_object('error','intake_unavailable');end if;
 select * into r from public.discord_ticket_type_revisions where id=(p_data->>'revision_id')::uuid and organization_id=p_org and server_id=s.id;
 if r.id is not null then
 select * into t from public.discord_ticket_types where id=r.type_id and active and not archived;
 if t.id is null or not(exists(select 1 from public.discord_ticket_panels pp join public.discord_ticket_panel_revisions pv on pv.id=pp.published_revision_id where pp.server_id=s.id and pp.enabled and pp.message_id is not null and pv.payload->'typeRevisionIds' @> jsonb_build_array(r.id)) or exists(select 1 from public.discord_ticket_intents ii where ii.server_id=s.id and ii.client_id=p_client and ii.type_revision_id=r.id and ii.expires_at>now() and ii.consumed_key is null)) then return jsonb_build_object('error','revision_unavailable');end if;
 return jsonb_build_object('schemaVersion',2,'guildId',p_guild,'typeRevision',r.payload||jsonb_build_object('revisionId',r.id,'typeId',r.type_id));end if;
 select * into pr from public.discord_ticket_panel_revisions where id=(p_data->>'revision_id')::uuid and organization_id=p_org and server_id=s.id;
 if pr.id is null or not exists(select 1 from public.discord_ticket_panels where id=pr.panel_id and enabled and published_revision_id=pr.id) then return jsonb_build_object('error','revision_unavailable');end if;
 return jsonb_build_object('schemaVersion',2,'guildId',p_guild,'panelRevision',pr.payload||jsonb_build_object('revisionId',pr.id,'panelId',pr.panel_id));
 elsif p_op='claim' then
 update public.discord_bot_config_deliveries set state='uncertain',lease_token=null,worker_id=null,leased_until=null,last_error='lease_expired' where server_id=s.id and client_id=p_client and state='leased' and leased_until<=now();
 for item in select q.* from public.discord_bot_config_deliveries q where q.server_id=s.id and (q.client_id=p_client or q.client_id is null) and q.state in ('pending','uncertain') and q.attempts<8
 and (q.kind in ('verify_server_admin','check_channel') or s.features @> array['ticket_panels'])
 and not exists(select 1 from public.discord_bot_config_deliveries early where early.server_id=q.server_id and coalesce(early.panel_id::text,early.kind||':'||coalesce(early.channel_id,''))=coalesce(q.panel_id::text,q.kind||':'||coalesce(q.channel_id,'')) and early.sequence<q.sequence and early.state not in ('delivered','cancelled'))
 order by q.sequence for update skip locked limit 5 loop
 if jsonb_array_length(claimed)>0 and octet_length(claimed::text)+octet_length(item.payload::text)>1048576 then exit;end if;
 update public.discord_bot_config_deliveries set state='leased',client_id=p_client,lease_token=gen_random_uuid(),worker_id=p_data->>'worker_id',leased_until=now()+interval '60 seconds',attempts=attempts+1 where id=item.id returning * into d;
 claimed:=claimed||jsonb_build_array(jsonb_build_object('id',d.id,'kind',d.kind,'guildId',p_guild,'channelId',d.channel_id,'panelId',d.panel_id,'revisionId',d.revision_id,'messageId',d.message_id,'payload',d.payload,'payloadHash',d.payload_hash,'leaseToken',d.lease_token,'leasedUntil',d.leased_until,'nonce',d.sequence::text,'marker','besc-panel-'||coalesce(d.panel_id,d.id)::text,'reconcile',item.state='uncertain','withdrawn',d.kind='publish_panel' and (not s.intake_active or not coalesce((select enabled from public.discord_ticket_panels where id=d.panel_id),false)),'allowedMentions',jsonb_build_object('parse','[]'::jsonb)));
 end loop;return jsonb_build_object('deliveries',claimed);
 elsif p_op in ('complete','fail','inspect') then
 select * into d from public.discord_bot_config_deliveries where id=(p_data->>'delivery_id')::uuid and organization_id=p_org and server_id=s.id and client_id=p_client for update;
 if d.id is null then return jsonb_build_object('error','delivery_unavailable');end if;
 if p_op='complete' and d.state='delivered' and d.completed_request_hash=encode(sha256(convert_to(p_data::text,'UTF8')),'hex') then return jsonb_build_object('recorded',true);end if;
 if d.state<>'leased' or d.lease_token is distinct from (p_data->>'lease_token')::uuid or d.worker_id is distinct from p_data->>'worker_id' or d.leased_until<=now() then return jsonb_build_object('error','lease_conflict');end if;
 if p_op='inspect' then return jsonb_build_object('id',d.id,'kind',d.kind,'leaseToken',d.lease_token,'leasedUntil',d.leased_until,'withdrawn',d.kind='publish_panel' and (not s.intake_active or not coalesce((select enabled from public.discord_ticket_panels where id=d.panel_id),false)));end if;
 if p_op='fail' then
 update public.discord_bot_config_deliveries set state=case when p_data->>'uncertain'='true' then 'uncertain' else 'failed' end,last_error=p_data->>'error_code',lease_token=null,worker_id=null,leased_until=null where id=d.id;return jsonb_build_object('recorded',true);end if;
 if p_data->>'kind' is distinct from d.kind or p_data->>'application_id' is distinct from s.application_id or p_data->>'payload_hash' is distinct from d.payload_hash then return jsonb_build_object('error','invalid_delivery_result');end if;
 if d.kind='verify_server_admin' then
 if p_data->>'discord_user_id' is distinct from d.payload->>'discordUserId' then return jsonb_build_object('error','invalid_delivery_result');end if;
 update public.discord_bot_servers set verified_user_id=case when p_data->>'is_admin'='true' then (d.payload->>'ccUserId')::uuid else null end,verified_discord_id=case when p_data->>'is_admin'='true' then d.payload->>'discordUserId' else null end,verified_at=case when p_data->>'is_admin'='true' then now() else null end where id=s.id;
 elsif d.kind='check_channel' then
 if p_data->>'channel_id' is distinct from d.channel_id or p_data->>'channel_type'<>'0' then return jsonb_build_object('error','invalid_delivery_result');end if;
 update public.discord_bot_channels set permissions_ok=p_data->>'permissions_ok'='true',missing_permissions=array(select jsonb_array_elements_text(p_data->'missing_permissions')),checked_at=now() where server_id=s.id and channel_id=d.channel_id;
 else
 select * into p from public.discord_ticket_panels where id=d.panel_id and server_id=s.id for update;
 if d.kind='publish_panel' and (p_data->>'message_absent'='true' or p_data->>'skipped'='true') then
 if (p.enabled and s.intake_active) or (p_data->>'message_absent'='true' and d.message_id is not null) or (p_data->>'skipped'='true' and p_data->>'message_id' is distinct from d.message_id) or p_data->>'channel_id' is distinct from d.channel_id or p_data->>'revision_id' is distinct from d.revision_id::text or p_data->>'bot_author_id' is distinct from s.application_id then return jsonb_build_object('error','invalid_delivery_result');end if;
 update public.discord_bot_config_deliveries set state='delivered',completed_request_hash=encode(sha256(convert_to(p_data::text,'UTF8')),'hex'),lease_token=null,worker_id=null,leased_until=null where id=d.id;
 return jsonb_build_object('recorded',true);
 end if;
 if p_data->>'channel_id' is distinct from d.channel_id or p_data->>'bot_author_id' is distinct from s.application_id or p_data->>'message_id'!~'^[1-9][0-9]{16,19}$' or (d.message_id is not null and p_data->>'message_id' is distinct from d.message_id) or (d.kind='publish_panel' and p_data->>'revision_id' is distinct from d.revision_id::text) then return jsonb_build_object('error','invalid_delivery_result');end if;
 if d.kind='publish_panel' then
 update public.discord_ticket_panels set message_id=p_data->>'message_id',channel_id=d.channel_id,published_revision_id=d.revision_id where id=p.id;
 update public.discord_bot_servers set configuration_revision_id=gen_random_uuid() where id=s.id;
 if not p.enabled then insert into public.discord_bot_config_deliveries(organization_id,server_id,client_id,kind,panel_id,channel_id,message_id,payload,payload_hash) values(p_org,s.id,p_client,'disable_panel',p.id,d.channel_id,p_data->>'message_id',jsonb_build_object('applicationId',s.application_id,'expectedBotAuthorId',s.application_id),encode(sha256(convert_to(jsonb_build_object('applicationId',s.application_id,'expectedBotAuthorId',s.application_id)::text,'UTF8')),'hex'));end if;
 else
 if p_data->>'disabled'<>'true' then return jsonb_build_object('error','invalid_delivery_result');end if;
 update public.discord_ticket_panels set message_id=null,channel_id=null,published_revision_id=null where id=p.id and message_id=d.message_id;
 end if;end if;
 update public.discord_bot_config_deliveries set state='delivered',completed_request_hash=encode(sha256(convert_to(p_data::text,'UTF8')),'hex'),lease_token=null,worker_id=null,leased_until=null,last_error=null where id=d.id;return jsonb_build_object('recorded',true);
 elsif p_op in ('intent','intake') then
 if v_key !~ '^[1-9][0-9]{16,19}$' then return jsonb_build_object('error','interaction_expired');end if;
 if p_op='intake' then
 -- Replay is resolved before the expiry gate; it never creates another ticket.
 select * into i from public.discord_ticket_intents where id=(p_data->>'intake_intent_id')::uuid and organization_id=p_org and server_id=s.id and client_id=p_client and actor=v_actor for update;
 if i.id is null or i.actor is distinct from v_actor then return jsonb_build_object('error','intent_unavailable');end if;
 if i.consumed_key is not null then
 if i.consumed_key<>v_key then return jsonb_build_object('error','intent_consumed');end if;
 select response into result from public.support_ticket_idempotency where organization_id=p_org and client_id=p_client and operation='create' and key=v_key and request_hash=p_data->>'request_hash' and not tombstone;
 if result is null then return jsonb_build_object('error','idempotency_conflict');end if;return result;
 end if;
 if i.expires_at<=now() then return jsonb_build_object('error','intent_expired');end if;
 if i.type_revision_id is distinct from (p_data->>'type_revision_id')::uuid then return jsonb_build_object('error','revision_unavailable');end if;
 end if;
 if not coalesce(can_intake,false) then return jsonb_build_object('error','intake_unavailable');end if;
 select * into r from public.discord_ticket_type_revisions where id=(p_data->>'type_revision_id')::uuid and server_id=s.id and organization_id=p_org;
 if r.id is null then return jsonb_build_object('error','revision_unavailable');end if;
 select * into t from public.discord_ticket_types where id=r.type_id and organization_id=p_org and server_id=s.id and active and not archived for update;
 if t.id is null then return jsonb_build_object('error','intake_unavailable');end if;
 if (r.payload->>'eligibility'='linked' or t.draft->>'eligibility'='linked') and (p_data->>'verified_user_id' is null or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=(p_data->>'verified_user_id')::uuid and status='active')) then return jsonb_build_object('error','linked_account_required');end if;
 if p_op='intent' then
 select * into i from public.discord_ticket_intents where organization_id=p_org and client_id=p_client and source_interaction_id=v_key for update;
 if i.id is not null then
 if i.actor is distinct from v_actor or i.request_hash is distinct from p_data->>'request_hash' then return jsonb_build_object('error','idempotency_conflict');end if;
 if i.expires_at<=now() then return jsonb_build_object('error','intent_expired');end if;
 if i.panel_id is not null and not exists(select 1 from public.discord_ticket_panels where id=i.panel_id and enabled) then return jsonb_build_object('error','source_not_allowed');end if;
 return jsonb_build_object('intentId',i.id,'expiresAt',i.expires_at,'typeRevisionId',i.type_revision_id);
 end if;
 if p_data->>'source'='panel' then
 select * into p from public.discord_ticket_panels where id=(p_data->>'panel_id')::uuid and organization_id=p_org and server_id=s.id and enabled and message_id=p_data->>'message_id' and channel_id=p_data->>'channel_id';
 if p.id is null then return jsonb_build_object('error','source_not_allowed');end if;
 select * into pr from public.discord_ticket_panel_revisions where id=p.published_revision_id and id=(p_data->>'panel_revision_id')::uuid;
 if pr.id is null or not(pr.payload->'typeRevisionIds' @> jsonb_build_array(r.id)) then return jsonb_build_object('error','source_not_allowed');end if;
 elsif p_data->>'source'='slash' then
 if not exists(select 1 from public.discord_ticket_panels pp join public.discord_ticket_panel_revisions rv on rv.id=pp.published_revision_id where pp.server_id=s.id and pp.enabled and pp.message_id is not null and rv.payload->'typeRevisionIds' @> jsonb_build_array(r.id)) then return jsonb_build_object('error','revision_unavailable');end if;
 else return jsonb_build_object('error','source_not_allowed');end if;
 insert into public.discord_ticket_intents(organization_id,server_id,client_id,guild_id,actor,type_revision_id,panel_id,source,source_interaction_id,request_hash) values(p_org,s.id,p_client,p_guild,v_actor,r.id,p.id,p_data->>'source',v_key,p_data->>'request_hash') on conflict(organization_id,client_id,source_interaction_id) do nothing;
 select * into i from public.discord_ticket_intents where organization_id=p_org and client_id=p_client and source_interaction_id=v_key for update;
 if i.actor<>v_actor or i.request_hash<>p_data->>'request_hash' then return jsonb_build_object('error','idempotency_conflict');end if;
 if i.expires_at<=now() then return jsonb_build_object('error','intent_expired');end if;
 return jsonb_build_object('intentId',i.id,'expiresAt',i.expires_at,'typeRevisionId',r.id);
 else
 if i.panel_id is not null and not exists(select 1 from public.discord_ticket_panels where id=i.panel_id and enabled) then return jsonb_build_object('error','source_not_allowed');end if;
 answers:=private.discord_answers(r.payload,p_data->'answers');
 subject:=left(coalesce(nullif(answers->>(r.payload->>'subjectQuestionId'),''),r.payload->>'name'),160);
 result:=public.ticket_bot_operation_v1(p_org,p_client,p_guild,'create',jsonb_build_object('discord_user_id',v_actor,'parent_channel_id',r.payload->>'parentChannelId','subject',subject,'content','Je formulier is ontvangen. De ticketmedewerkers kunnen je antwoorden in Command Center lezen.','idempotency_key',v_key,'request_hash',p_data->>'request_hash'));
 if result ? 'error' then return result;end if;ticket:=(result->>'ticketId')::uuid;
 update public.support_tickets set type_id=t.id,type_revision_id=r.id,intake_snapshot=r.payload,intake_answers=answers where id=ticket;
 update public.discord_ticket_intents set consumed_key=v_key,ticket_id=ticket where id=i.id;return result;
 end if;
 end if;return jsonb_build_object('error','invalid_operation');
exception when raise_exception then if sqlerrm='invalid_answers' then return jsonb_build_object('error','invalid_answers');else raise;end if;when invalid_text_representation or check_violation then return jsonb_build_object('error','invalid_config');end$$;
revoke all on function public.discord_bot_operation(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.discord_bot_operation(uuid,text,text,text,jsonb) to service_role;
-- Keep V1 paths, delivery kinds, rights and saved parent bindings intact.
alter function public.ticket_bot_operation(uuid,text,text,text,jsonb) rename to ticket_bot_operation_v1;
create function public.ticket_bot_operation(p_org uuid,p_client text,p_guild text,p_op text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.discord_bot_servers;begin
 if p_op='create' then
 select * into s from public.discord_bot_servers where organization_id=p_org and guild_id=p_guild;
 if s.id is not null and (s.legacy_parent_channel_id is distinct from p_data->>'parent_channel_id' or not exists(select 1 from public.discord_ticket_types where server_id=s.id and legacy and active and not archived)) then return jsonb_build_object('error','channel_not_allowed');end if;
 end if;
 return public.ticket_bot_operation_v1(p_org,p_client,p_guild,p_op,p_data);end$$;
revoke all on function public.ticket_bot_operation(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ticket_bot_operation(uuid,text,text,text,jsonb) to service_role;
-- Snapshot and answers live on support_tickets and follow its existing deadline/purge.
-- Expired intents hold no answers; remove after their replay window or ticket purge.
create function private.discord_cleanup_intents() returns trigger language plpgsql set search_path='' as $$begin delete from public.discord_ticket_intents where ticket_id=old.id or (expires_at<now()-interval '24 hours' and consumed_key is null);return old;end$$;
create trigger discord_intents_ticket_purge before delete on public.support_tickets for each row execute function private.discord_cleanup_intents();
revoke all on function private.discord_cleanup_intents() from public,anon,authenticated;

create view public.discord_bot_server_overview with(security_invoker=true) as select s.*,now() as as_of from public.discord_bot_servers s;
revoke all on public.discord_bot_server_overview from public,anon;
grant select on public.discord_bot_server_overview to authenticated,service_role;
alter function public.purge_support_tickets() rename to purge_support_tickets_v1;
create function public.purge_support_tickets() returns integer language plpgsql security invoker set search_path='' as $$declare n integer;begin n:=public.purge_support_tickets_v1();delete from public.discord_ticket_intents where expires_at<now()-interval '24 hours' and consumed_key is null;return n;end$$;
revoke all on function public.purge_support_tickets() from public,anon,authenticated;
grant execute on function public.purge_support_tickets() to service_role;
alter table public.discord_ticket_panel_revisions add unique(organization_id,server_id,panel_id,id);
alter table public.discord_ticket_panels add constraint panel_current_revision_binding foreign key(organization_id,server_id,id,published_revision_id) references public.discord_ticket_panel_revisions(organization_id,server_id,panel_id,id);
alter table public.discord_bot_config_deliveries add constraint delivery_revision_binding foreign key(organization_id,server_id,panel_id,revision_id) references public.discord_ticket_panel_revisions(organization_id,server_id,panel_id,id);
alter table public.discord_ticket_type_revisions add unique(organization_id,type_id,id);
alter table public.support_tickets add constraint ticket_type_revision_binding foreign key(organization_id,type_id,type_revision_id) references public.discord_ticket_type_revisions(organization_id,type_id,id);
create index discord_config_revision_fk on public.discord_bot_config_deliveries(organization_id,revision_id);
create index discord_intents_type_fk on public.discord_ticket_intents(organization_id,type_revision_id);
commit;

