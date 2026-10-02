-- Server-only OAuth grants. No raw access/refresh tokens or authorization codes.
create table public.social_mcp_oauth_grants (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id text not null,
  resource text not null,
  scope text not null check (scope = 'social:read'),
  redirect_uri text not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index social_mcp_oauth_grants_user_idx on public.social_mcp_oauth_grants(user_id, organization_id);
create index social_mcp_oauth_grants_expiry_idx on public.social_mcp_oauth_grants(expires_at);
create table public.social_mcp_oauth_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  grant_id uuid not null references public.social_mcp_oauth_grants(id) on delete cascade,
  kind text not null check (kind in ('code', 'access', 'refresh')),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index social_mcp_oauth_tokens_grant_idx on public.social_mcp_oauth_tokens(grant_id);
alter table public.social_mcp_oauth_grants enable row level security;
alter table public.social_mcp_oauth_tokens enable row level security;
revoke all on public.social_mcp_oauth_grants, public.social_mcp_oauth_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.social_mcp_oauth_grants, public.social_mcp_oauth_tokens to service_role;

-- Atomic consume/rotation, serialized per grant (including parallel refreshes).
-- SECURITY INVOKER: only service_role may call this; no public privilege escalation.
create function public.exchange_social_mcp_token(
  p_token_hash text, p_kind text, p_client_id text, p_redirect_uri text,
  p_resource text, p_code_challenge text, p_access_hash text, p_refresh_hash text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  credential public.social_mcp_oauth_tokens%rowtype;
  permission public.social_mcp_oauth_grants%rowtype;
begin
  if p_kind is null or p_kind not in ('code', 'refresh') then return null; end if;
  select * into credential from public.social_mcp_oauth_tokens where token_hash = p_token_hash;
  if not found or credential.kind <> p_kind then return null; end if;
  select * into permission from public.social_mcp_oauth_grants where id = credential.grant_id for update;
  if not found or permission.client_id is distinct from p_client_id or permission.resource is distinct from p_resource
    or permission.revoked_at is not null or permission.expires_at <= now() then return null; end if;
  -- Re-read after locking the grant, so simultaneous requests cannot consume twice.
  select * into credential from public.social_mcp_oauth_tokens where token_hash = p_token_hash;
  if credential.expires_at <= now() then return null; end if;
  if p_kind = 'code' and (permission.redirect_uri is distinct from p_redirect_uri or permission.code_challenge is distinct from p_code_challenge) then return null; end if;
  if credential.used_at is not null then
    update public.social_mcp_oauth_grants set revoked_at = now() where id = permission.id;
    return null;
  end if;
  update public.social_mcp_oauth_tokens set used_at = now() where token_hash = p_token_hash;
  if p_kind = 'refresh' then
    update public.social_mcp_oauth_tokens set used_at = now() where grant_id = permission.id and kind = 'access' and used_at is null;
  end if;
  insert into public.social_mcp_oauth_tokens(token_hash, grant_id, kind, expires_at) values
    (p_access_hash, permission.id, 'access', least(now() + interval '15 minutes', permission.expires_at)),
    (p_refresh_hash, permission.id, 'refresh', permission.expires_at);
  return to_jsonb(permission);
end;
$$;
revoke all on function public.exchange_social_mcp_token(text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.exchange_social_mcp_token(text,text,text,text,text,text,text,text) to service_role;
