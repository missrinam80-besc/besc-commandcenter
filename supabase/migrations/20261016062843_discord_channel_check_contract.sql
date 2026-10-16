begin;
-- Match the existing bot contract: check_channel binds its channel twice.
-- Existing deliveries (including leased/uncertain ones) are intentionally not
-- rewritten, rehashed, retried, cancelled or replaced by this schema migration.
create or replace function private.discord_staff_action(p_org uuid,p_server uuid,p_op text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 payload:=jsonb_build_object('applicationId',s.application_id,'channelId',p_data->>'channelId');
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
-- CREATE OR REPLACE keeps the existing owner, ACL and security-definer boundary.
notify pgrst, 'reload schema';
commit;
