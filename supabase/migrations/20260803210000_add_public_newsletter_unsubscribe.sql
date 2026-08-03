create table private.newsletter_unsubscribe_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mailing_list_id uuid not null references public.mailing_lists(id) on delete cascade,
  subscriber_id uuid not null references public.mailing_subscribers(id) on delete cascade,
  token_hash text not null unique,
  ip_hash text not null,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table private.newsletter_unsubscribe_requests enable row level security;
revoke all on table private.newsletter_unsubscribe_requests from public, anon, authenticated;
create index newsletter_unsubscribe_requests_rate_idx
  on private.newsletter_unsubscribe_requests(subscriber_id, ip_hash, created_at desc);

create function private.request_newsletter_unsubscription(
  p_list_slug text, p_email text, p_token_hash text, p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
begin
  select s.id subscriber_id, s.organization_id, s.mailing_list_id into target
  from public.mailing_subscribers s
  join public.mailing_lists l on l.id = s.mailing_list_id
  where lower(l.public_slug) = lower(trim(p_list_slug))
    and l.public_signup_enabled
    and lower(s.email) = lower(trim(p_email))
    and s.status = 'subscribed';
  if target.subscriber_id is null or length(trim(p_token_hash)) < 32 or length(trim(p_ip_hash)) < 32 then
    return false;
  end if;
  if (select count(*) from private.newsletter_unsubscribe_requests
      where created_at > now() - interval '1 hour'
        and (subscriber_id = target.subscriber_id or ip_hash = p_ip_hash)) >= 5 then
    return false;
  end if;
  insert into private.newsletter_unsubscribe_requests(
    organization_id, mailing_list_id, subscriber_id, token_hash, ip_hash, expires_at
  ) values (
    target.organization_id, target.mailing_list_id, target.subscriber_id,
    p_token_hash, p_ip_hash, now() + interval '24 hours'
  );
  return true;
end $$;

create function private.confirm_newsletter_unsubscription(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request private.newsletter_unsubscribe_requests;
begin
  select * into request from private.newsletter_unsubscribe_requests
  where token_hash = p_token_hash and confirmed_at is null and expires_at > now()
  for update;
  if request.id is null then return false; end if;
  update public.mailing_subscribers
  set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
  where id = request.subscriber_id
    and organization_id = request.organization_id
    and mailing_list_id = request.mailing_list_id;
  update private.newsletter_unsubscribe_requests set confirmed_at = now() where id = request.id;
  return true;
end $$;

revoke all on function private.request_newsletter_unsubscription(text,text,text,text) from public, anon, authenticated;
revoke all on function private.confirm_newsletter_unsubscription(text) from public, anon, authenticated;
grant execute on function private.request_newsletter_unsubscription(text,text,text,text) to anon, authenticated;
grant execute on function private.confirm_newsletter_unsubscription(text) to anon, authenticated;

create function public.request_newsletter_unsubscription(
  p_list_slug text, p_email text, p_token_hash text, p_ip_hash text
)
returns boolean language sql security invoker set search_path = '' as $$
  select private.request_newsletter_unsubscription(p_list_slug, p_email, p_token_hash, p_ip_hash)
$$;

create function public.confirm_newsletter_unsubscription(p_token_hash text)
returns boolean language sql security invoker set search_path = '' as $$
  select private.confirm_newsletter_unsubscription(p_token_hash)
$$;

revoke all on function public.request_newsletter_unsubscription(text,text,text,text) from public;
revoke all on function public.confirm_newsletter_unsubscription(text) from public;
grant execute on function public.request_newsletter_unsubscription(text,text,text,text) to anon, authenticated;
grant execute on function public.confirm_newsletter_unsubscription(text) to anon, authenticated;
