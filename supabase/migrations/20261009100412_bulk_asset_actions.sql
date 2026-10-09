begin;
create function public.bulk_asset_action(p_organization_id uuid,p_ids uuid[],p_mode text,
 p_change_location boolean default false,p_location text default null,
 p_change_status boolean default false,p_status text default null) returns integer
language plpgsql security invoker set search_path='' as $$
declare expected integer; matched integer; updated integer; stamp timestamptz:=now();
begin
 if auth.uid() is null or not private.is_org_manager(p_organization_id) then raise exception 'asset_bulk_no_access' using errcode='42501';end if;
 expected:=cardinality(p_ids);
 if expected is null or expected<1 or expected>1000 or array_position(p_ids,null) is not null
 or (select count(distinct id) from unnest(p_ids) id)<>expected
 or p_mode is null or p_mode not in ('update','archive','delete') then raise exception 'asset_bulk_fields' using errcode='23514';end if;
 if p_mode='update' and (not (coalesce(p_change_location,false) or coalesce(p_change_status,false))
 or (p_change_location and char_length(p_location)>300)
 or (p_change_status and (p_status is null or p_status not in ('planned','active','maintenance','loaned','retired','lost','archived')))) then raise exception 'asset_bulk_fields' using errcode='23514';end if;
 -- Lock all selected rows, in a stable order, and refuse missing/hidden/deleted items.
 select count(*) into matched from (select id from public.assets
 where organization_id=p_organization_id and id=any(p_ids) and deleted_at is null order by id for update) locked;
 if matched<>expected then raise exception 'asset_selection_unavailable' using errcode='40001';end if;
 update public.assets set
 location=case when p_mode='update' and p_change_location then nullif(trim(p_location),'') else location end,
 status=case when p_mode='archive' then 'archived' when p_mode='update' and p_change_status then p_status else status end,
 deleted_at=case when p_mode='delete' then stamp else deleted_at end,updated_at=stamp
 where organization_id=p_organization_id and id=any(p_ids) and deleted_at is null;
 get diagnostics updated=row_count;
 if updated<>expected then raise exception 'asset_selection_unavailable' using errcode='40001';end if;
 return updated;
end $$;
revoke all on function public.bulk_asset_action(uuid,uuid[],text,boolean,text,boolean,text) from public,anon;
grant execute on function public.bulk_asset_action(uuid,uuid[],text,boolean,text,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
