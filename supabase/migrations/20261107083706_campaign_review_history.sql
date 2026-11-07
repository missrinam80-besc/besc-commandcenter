-- Read existing, committed decisions only. No history reconstruction or writes.
create index campaign_review_history_lookup on private.campaign_receipts
 (organization_id,campaign_id,(payload->>'id'),created_at desc) where operation='post.review';

create function public.f3_review_history(p_organization_id uuid,p_campaign_id uuid,p_contribution_id uuid,p_before_revision integer default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare post private.campaign_contributions; participant private.campaign_participants; result jsonb;
begin
 if auth.uid() is null or not private.f3_active(p_organization_id,p_campaign_id) then
  raise exception 'f3_not_available' using errcode='42501';
 end if;
 select * into post from private.campaign_contributions where organization_id=p_organization_id and campaign_id=p_campaign_id and id=p_contribution_id;
 if post.id is null or not private.f3_participant_valid(p_organization_id,p_campaign_id,post.participant_id)
  or not (private.f3_role(p_organization_id,p_campaign_id,array['editor','reviewer','reader']) or private.f3_own(p_organization_id,p_campaign_id,post.participant_id)) then
  raise exception 'f3_not_available' using errcode='42501';
 end if;
 if p_before_revision is not null and p_before_revision<1 then raise exception 'f3_invalid_revision' using errcode='22023';end if;
 select * into participant from private.campaign_participants where id=post.participant_id;
 with eligible as (
  select r.request_id,r.actor,coalesce(nullif(btrim(p.display_name),''),'Onbekende beoordelaar') reviewer_name,r.created_at,
   (r.payload->>'expected_revision')::integer from_revision,r.payload->>'decision' decision,
   r.payload->>'availability' availability,r.payload->>'reason' reason
  from private.campaign_receipts r left join public.profiles p on p.id=r.actor
  where r.organization_id=p_organization_id and r.campaign_id=p_campaign_id and r.operation='post.review'
   and r.payload->>'id'=post.id::text and r.result->>'id'=post.id::text
   and r.created_at>=participant.accepted_at
   and (p_before_revision is null or (r.payload->>'expected_revision')::integer<p_before_revision)
  order by (r.payload->>'expected_revision')::integer desc,r.created_at desc,r.request_id desc limit 26
 ), page as (select * from eligible order by from_revision desc,created_at desc,request_id desc limit 25)
 select jsonb_build_object('post_id',post.id,'items',coalesce((select jsonb_agg(jsonb_build_object(
   'request_id',request_id,'reviewer_id',actor,'reviewer_name',reviewer_name,'reviewed_at',created_at,
   'from_revision',from_revision,'to_revision',from_revision+1,'decision',decision,'availability',availability,'reason',reason
  ) order by from_revision desc,created_at desc,request_id desc) from page),'[]'::jsonb),
  'has_more',(select count(*)>25 from eligible),'next_before_revision',case when (select count(*)>25 from eligible) then (select min(from_revision) from page) else null end) into result;
 return result;
end $$;
-- The fixed RPC needs definer access to private receipts. It rechecks the real
-- session and current purpose on every page; no direct private-table grants.
revoke all on function public.f3_review_history(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.f3_review_history(uuid,uuid,uuid,integer) to authenticated;
