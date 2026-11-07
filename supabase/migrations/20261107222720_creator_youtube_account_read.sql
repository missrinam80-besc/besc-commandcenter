-- Package 2: authenticated discovery only; never returns jobs or credentials.
create function public.creator_youtube_account(p_org uuid,p_after uuid default null,p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s uuid:=(auth.jwt()->>'session_id')::uuid;ids uuid[];items jsonb;next_id uuid;
begin
 perform 1 from auth.users where id=u for share;
 perform 1 from auth.sessions where id=s and user_id=u for share;
 perform 1 from public.organization_members where organization_id=p_org and user_id=u for share;
 perform private.f1_lock();
 if not private.cy_session(p_org,u,s) then raise exception 'cy_not_available' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'cy_invalid_input';end if;
 select array_agg(id order by id) into ids from
  (select id from private.cy_links where organization_id=p_org and owner_id=u and (p_after is null or id>p_after) order by id limit p_limit+1) q;
 if cardinality(ids)>p_limit then next_id:=ids[p_limit];end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'provider_revocation',provider_revocation,
  'channel_id',channel_id,'valid_until',valid_until,'retain_until',retain_until) order by id),'[]'::jsonb)
 into items from private.cy_links where organization_id=p_org and owner_id=u and id=any(ids[1:p_limit]);
 return jsonb_build_object('links',items,'next_after',next_id);
end $$;
revoke all on function public.creator_youtube_account(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.creator_youtube_account(uuid,uuid,integer) to authenticated;
