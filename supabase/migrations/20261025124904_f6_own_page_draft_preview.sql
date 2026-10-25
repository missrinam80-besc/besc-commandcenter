begin;
-- Read only: no role, review, publication, site or data changes. A chair may
-- inspect only their own latest page drafts, including after an editor task ends.
create function public.f6_own_page_drafts(p_site_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare o uuid; result jsonb;
begin
 perform private.f4_read_gate();
 select organization_id into o from public.publication_sites where id=p_site_id;
 if o is null or not private.f2_account(o) or not private.f1_chair(o) then
  raise exception 'f6_preview_not_authorized' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'dossier_id',x.dossier_id,'revision_id',x.id,'revision',x.revision,
  'status','draft','payload',x.payload
 ) order by x.created_at desc,x.id desc),'[]'::jsonb) into result
 from (
  select r.* from private.site_content_revisions r
  join private.site_content_dossiers d on d.id=r.dossier_id and d.organization_id=r.organization_id
  where d.site_id=p_site_id and d.organization_id=o and d.kind='page'
   and r.created_by=auth.uid() and r.status='draft'
   and r.revision=(select max(latest.revision) from private.site_content_revisions latest where latest.dossier_id=d.id)
   and private.f4_content_proof_access(r) and coalesce(private.f4_content_current(r),false)
  order by r.created_at desc,r.id desc limit 50
 )x;
 return jsonb_build_object('items',result);
end$$;
revoke all on function public.f6_own_page_drafts(uuid) from public,anon,authenticated,service_role;
grant execute on function public.f6_own_page_drafts(uuid) to authenticated;
comment on function public.f6_own_page_drafts(uuid) is
 'Private own-draft text preview for a current verified chair. No review or release authority is added.';
commit;
