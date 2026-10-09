-- Run after managed_dossier_choices in an isolated PostgreSQL fixture, never on DEV data.
begin;
insert into public.organizations(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.organization_members(organization_id,user_id,role,status) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin','active'),
 ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','member','active');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin
 if (select count(*) from public.dossier_choice_options where set_key='events.event_type')<>10 then raise exception 'new organization defaults not seeded: count %, uid %, active %', (select count(*) from public.dossier_choice_options where set_key='events.event_type'),auth.uid(),private.is_active_member('11111111-1111-4111-8111-111111111111'); end if;
end $$;
insert into public.dossier_choice_options(organization_id,set_key,value,label) values('11111111-1111-4111-8111-111111111111','events.event_type','test_type','TESTFIXTURE custom type');
insert into public.events(id,organization_id,event_type) values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','test_type');
update public.dossier_choice_options set label='TESTFIXTURE renamed',position=7 where set_key='events.event_type' and value='test_type';
do $$ begin
 if (select event_type from public.events where id='33333333-3333-4333-8333-333333333333')<>'test_type' then raise exception 'rename changed record'; end if;
 if (select usage_count from public.dossier_choice_usage('11111111-1111-4111-8111-111111111111') where set_key='events.event_type' and value='test_type')<>1 then raise exception 'usage count wrong'; end if;
 begin
  delete from public.dossier_choice_options where set_key='events.event_type' and value='test_type';
  raise exception 'used option deleted';
 exception when foreign_key_violation then if sqlerrm<>'choice_in_use' then raise; end if; end;
 begin
  delete from public.dossier_choice_options where set_key='events.event_type' and value='community';
  raise exception 'default option deleted';
 exception when check_violation then if sqlerrm<>'choice_default_protected' then raise; end if; end;
 begin
  insert into public.dossier_choice_options(organization_id,set_key,value,label) values('11111111-1111-4111-8111-111111111111','events.status','custom_status','BAD');
  raise exception 'workflow became editable';
 exception when check_violation then if sqlerrm<>'choice_protected_set' then raise; end if; end;
 begin
  insert into public.events(organization_id,event_type) values('11111111-1111-4111-8111-111111111111','missing_type');
  raise exception 'unknown option saved';
 exception when foreign_key_violation then if sqlerrm<>'choice_unavailable' then raise; end if; end;
 begin
  perform * from public.dossier_choice_usage('22222222-2222-4222-8222-222222222222');
  raise exception 'cross org usage exposed';
 exception when insufficient_privilege then if sqlerrm<>'choice_no_access' then raise; end if; end;
end $$;
update public.events set deleted_at=now() where id='33333333-3333-4333-8333-333333333333';
do $$ begin
 begin
  delete from public.dossier_choice_options where set_key='events.event_type' and value='test_type';
  raise exception 'archived use lost';
 exception when foreign_key_violation then if sqlerrm<>'choice_in_use' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$ declare n integer; begin
 begin
  insert into public.dossier_choice_options(organization_id,set_key,value,label) values('11111111-1111-4111-8111-111111111111','events.event_type','unauthorized','BAD');
  raise exception 'member managed options';
 exception when insufficient_privilege then null; end;
 update public.dossier_choice_options set label='BAD' where value='test_type';get diagnostics n=row_count;
 if n<>0 then raise exception 'member renamed option'; end if;
 delete from public.dossier_choice_options where value='test_type';get diagnostics n=row_count;
 if n<>0 then raise exception 'member deleted option'; end if;
end $$;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
delete from public.events where id='33333333-3333-4333-8333-333333333333';
delete from public.dossier_choice_options where value='test_type';
do $$ declare n integer; begin
 if exists(select 1 from public.dossier_choice_options where value='test_type') then raise exception 'unused option not removed'; end if;
 delete from public.dossier_choice_options where organization_id='22222222-2222-4222-8222-222222222222';get diagnostics n=row_count;
 if n<>0 then raise exception 'cross org options deleted'; end if;
end $$;
rollback;
