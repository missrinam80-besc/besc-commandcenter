alter function public.portal_sponsor_dashboard(uuid) set schema private;
alter function public.portal_streamer_dashboard(uuid) set schema private;

revoke all on function private.portal_sponsor_dashboard(uuid) from public, anon;
revoke all on function private.portal_streamer_dashboard(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.portal_sponsor_dashboard(uuid) to authenticated;
grant execute on function private.portal_streamer_dashboard(uuid) to authenticated;

create function public.portal_sponsor_dashboard(p_access_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.portal_sponsor_dashboard(p_access_id)
$$;
create function public.portal_streamer_dashboard(p_access_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.portal_streamer_dashboard(p_access_id)
$$;

revoke all on function public.portal_sponsor_dashboard(uuid) from public, anon;
revoke all on function public.portal_streamer_dashboard(uuid) from public, anon;
grant execute on function public.portal_sponsor_dashboard(uuid) to authenticated;
grant execute on function public.portal_streamer_dashboard(uuid) to authenticated;
