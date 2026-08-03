alter table public.newsletter_subscription_requests set schema private;
alter function public.request_newsletter_subscription(text,text,text,text,text,text) set schema private;
alter function public.confirm_newsletter_subscription(text) set schema private;

revoke all on table private.newsletter_subscription_requests from public, anon, authenticated;
revoke all on function private.request_newsletter_subscription(text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function private.confirm_newsletter_subscription(text) from public, anon, authenticated;
grant execute on function private.request_newsletter_subscription(text,text,text,text,text,text) to anon, authenticated;
grant execute on function private.confirm_newsletter_subscription(text) to anon, authenticated;

create function public.request_newsletter_subscription(
  p_list_slug text,
  p_email text,
  p_display_name text,
  p_token_hash text,
  p_ip_hash text,
  p_consent_version text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.request_newsletter_subscription(
    p_list_slug, p_email, p_display_name, p_token_hash, p_ip_hash, p_consent_version
  )
$$;

create function public.confirm_newsletter_subscription(p_token_hash text)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.confirm_newsletter_subscription(p_token_hash)
$$;

revoke all on function public.request_newsletter_subscription(text,text,text,text,text,text) from public;
revoke all on function public.confirm_newsletter_subscription(text) from public;
grant execute on function public.request_newsletter_subscription(text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.confirm_newsletter_subscription(text) to anon, authenticated;
