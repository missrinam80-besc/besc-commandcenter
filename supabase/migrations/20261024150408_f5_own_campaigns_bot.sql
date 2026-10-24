begin;
-- Machine read only: no new data, roles, browser grants or campaign writes.
create function private.f5_discord_actor(o uuid,d text,u uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select count(*)=1 from auth.identities i
 join auth.users a on a.id=i.user_id join public.profiles p on p.id=a.id
 join public.organization_members m on m.user_id=a.id and m.organization_id=o
 where a.id=u and a.email_confirmed_at is not null and a.deleted_at is null and (a.banned_until is null or a.banned_until<=clock_timestamp())
 and m.status='active' and m.role in('admin','board','member','volunteer')
 and p.discord_user_id=d and i.provider='discord' and i.provider_id=d
 and jsonb_typeof(i.identity_data)='object'
 and (not i.identity_data ? 'sub' or (jsonb_typeof(i.identity_data->'sub')='string' and i.identity_data->>'sub'=d))
 and (not i.identity_data ? 'provider_id' or (jsonb_typeof(i.identity_data->'provider_id')='string' and i.identity_data->>'provider_id'=d));
$$;
revoke all on function private.f5_discord_actor(uuid,text,uuid) from public,anon,authenticated,service_role;

create function private.f5_own_campaigns(o uuid,d text,u uuid,n integer,pilot boolean,real_campaign boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare rows jsonb;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'f5_forbidden' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'f5_isolation_required';end if;
 if o is null or u is null or d is null or d !~ '^[1-9][0-9]{16,19}$' or n is null or n<0 or n>99975 or pilot is null or real_campaign is null then raise exception 'f5_invalid_fields';end if;
 -- Wait on an in-flight actor change, then use fresh READ COMMITTED checks.
 -- SHARE locks are transaction-local; this operation never updates business data.
 perform 1 from auth.users where id=u for share;
 perform 1 from public.profiles where id=u for share;
 perform 1 from auth.identities where user_id=u and provider='discord' order by id for share;
 perform 1 from public.organization_members where organization_id=o and user_id=u for share;
 if not private.f5_discord_actor(o,d,u) then raise exception 'f5_account_unavailable' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'synthetic',x.synthetic) order by x.sort_title,x.id),'[]'::jsonb) into rows from (
   select c.id,left(c.title,160) title,c.title sort_title,p.synthetic
   from private.campaign_pilots p join public.campaigns c on c.id=p.campaign_id and c.organization_id=p.organization_id
   where p.organization_id=o and p.closed_at is null and c.deleted_at is null
   and ((p.synthetic and pilot and c.title like 'TESTFIXTURE%') or (not p.synthetic and real_campaign))
   and exists(select 1 from private.campaign_participants a
     join private.campaign_policies s on s.id=a.policy_id and s.organization_id=a.organization_id and s.campaign_id=a.campaign_id
     join public.community_people person on person.id=a.person_id and person.organization_id=a.organization_id
     where a.organization_id=o and a.campaign_id=c.id and a.account_user_id=u
     and person.account_user_id=u and person.deleted_at is null
     and a.accepted_at is not null and a.withdrawn_at is null and a.expires_at>clock_timestamp() and s.withdrawn_at is null)
   order by c.title,c.id limit 6 offset n
 ) x;
 if not private.f5_discord_actor(o,d,u) then raise exception 'f5_account_unavailable' using errcode='42501';end if;
 return jsonb_build_object('campaigns',rows);
end $$;
revoke all on function private.f5_own_campaigns(uuid,text,uuid,integer,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function private.f5_own_campaigns(uuid,text,uuid,integer,boolean,boolean) to service_role;

create function public.f5_bot_own_campaigns(p_organization_id uuid,p_discord_id text,p_expected_user_id uuid,p_offset integer,p_include_pilot boolean,p_include_real boolean) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'f5_forbidden' using errcode='42501';end if;
 return private.f5_own_campaigns(p_organization_id,p_discord_id,p_expected_user_id,p_offset,p_include_pilot,p_include_real);
end $$;
revoke all on function public.f5_bot_own_campaigns(uuid,text,uuid,integer,boolean,boolean) from public,anon,authenticated;
grant execute on function public.f5_bot_own_campaigns(uuid,text,uuid,integer,boolean,boolean) to service_role;
commit;
