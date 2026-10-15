begin;

-- A registered server always has an opaque revision, including legacy imports
-- and servers whose intake has never been activated. Preserve existing UUIDs.
alter table public.discord_bot_servers
  alter column configuration_revision_id set default gen_random_uuid();
update public.discord_bot_servers
  set configuration_revision_id = gen_random_uuid()
  where configuration_revision_id is null;
alter table public.discord_bot_servers
  alter column configuration_revision_id set not null;

-- Change the stored revision for configuration changes, not for reads,
-- runtime heartbeats, channel checks or administrative display names.
create function private.discord_server_configuration_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.intake_active is distinct from old.intake_active
    or new.application_id is distinct from old.application_id
    or (select array_agg(f order by f) from unnest(new.features) f)
       is distinct from (select array_agg(f order by f) from unnest(old.features) f)
  then
    new.configuration_revision_id := gen_random_uuid();
  end if;
  return new;
end;
$$;
revoke all on function private.discord_server_configuration_revision() from public, anon, authenticated;
create trigger discord_server_configuration_revision
  before update on public.discord_bot_servers
  for each row execute function private.discord_server_configuration_revision();

-- Published bindings and type availability can change the bot's configuration
-- before/without another successful panel publication. Draft-only edits do not.
create function private.discord_child_configuration_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'discord_ticket_panels' then
    if tg_op = 'UPDATE' and
      row(new.enabled, new.published_revision_id, new.channel_id, new.message_id)
      is not distinct from
      row(old.enabled, old.published_revision_id, old.channel_id, old.message_id)
    then return null; end if;
  elsif tg_table_name = 'discord_ticket_types' then
    if tg_op = 'UPDATE' and row(new.active, new.archived)
      is not distinct from row(old.active, old.archived)
    then return null; end if;
  end if;
  update public.discord_bot_servers
    set configuration_revision_id = gen_random_uuid()
    where organization_id = old.organization_id and id = old.server_id;
  return null;
end;
$$;
revoke all on function private.discord_child_configuration_revision() from public, anon, authenticated;
create trigger discord_panel_configuration_revision
  after update or delete on public.discord_ticket_panels
  for each row execute function private.discord_child_configuration_revision();
create trigger discord_type_configuration_revision
  after update or delete on public.discord_ticket_types
  for each row execute function private.discord_child_configuration_revision();

notify pgrst, 'reload schema';
commit;
