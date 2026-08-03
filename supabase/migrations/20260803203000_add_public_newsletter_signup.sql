alter table public.mailing_lists
  add column public_slug text,
  add column public_signup_enabled boolean not null default false;

create unique index mailing_lists_public_slug_idx
  on public.mailing_lists(lower(public_slug))
  where public_slug is not null;

alter table public.mailing_subscribers
  add column consent_version text,
  add column consent_source text,
  add column confirmed_at timestamptz;

create table public.newsletter_subscription_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mailing_list_id uuid not null references public.mailing_lists(id) on delete cascade,
  email text not null check (char_length(email) between 5 and 320),
  display_name text,
  token_hash text not null unique,
  ip_hash text not null,
  consent_version text not null,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscription_requests enable row level security;
revoke all on public.newsletter_subscription_requests from anon, authenticated;

create index newsletter_subscription_requests_rate_idx
  on public.newsletter_subscription_requests(lower(email), ip_hash, created_at desc);

create or replace function public.request_newsletter_subscription(
  p_list_slug text,
  p_email text,
  p_display_name text,
  p_token_hash text,
  p_ip_hash text,
  p_consent_version text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.mailing_lists;
begin
  select * into target
  from public.mailing_lists
  where lower(public_slug) = lower(trim(p_list_slug))
    and public_signup_enabled
    and status = 'active';

  if target.id is null
    or lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(trim(p_token_hash)) < 32
    or length(trim(p_ip_hash)) < 32
    or length(trim(p_consent_version)) < 2 then
    return false;
  end if;

  if (select count(*) from public.newsletter_subscription_requests
      where created_at > now() - interval '1 hour'
        and (lower(email) = lower(trim(p_email)) or ip_hash = p_ip_hash)) >= 5 then
    return false;
  end if;

  insert into public.newsletter_subscription_requests (
    organization_id, mailing_list_id, email, display_name, token_hash,
    ip_hash, consent_version, expires_at
  ) values (
    target.organization_id, target.id, lower(trim(p_email)), nullif(trim(p_display_name), ''),
    p_token_hash, p_ip_hash, p_consent_version, now() + interval '24 hours'
  );
  return true;
end $$;

create or replace function public.confirm_newsletter_subscription(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.newsletter_subscription_requests;
  list_owner uuid;
  subscriber_id uuid;
begin
  select * into request
  from public.newsletter_subscription_requests
  where token_hash = p_token_hash
    and confirmed_at is null
    and expires_at > now()
  for update;

  if request.id is null then return false; end if;

  select created_by into list_owner
  from public.mailing_lists
  where id = request.mailing_list_id
    and organization_id = request.organization_id
    and public_signup_enabled
    and status = 'active';
  if list_owner is null then return false; end if;

  select id into subscriber_id
  from public.mailing_subscribers
  where mailing_list_id = request.mailing_list_id
    and lower(email) = lower(request.email);

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

revoke all on function public.request_newsletter_subscription(text,text,text,text,text,text) from public;
revoke all on function public.confirm_newsletter_subscription(text) from public;
grant execute on function public.request_newsletter_subscription(text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.confirm_newsletter_subscription(text) to anon, authenticated;
