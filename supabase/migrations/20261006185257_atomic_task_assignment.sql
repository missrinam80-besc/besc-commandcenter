begin;
-- Replacing the task assignee is one transaction under the caller's existing RLS.
create function public.replace_task_assignee(p_task_id uuid, p_organization_id uuid, p_user_id uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  task_org uuid;
  expected_deletes bigint;
  actual_deletes bigint;
  assigned_user uuid;
begin
  select t.organization_id into task_org from public.tasks t
  where t.id=p_task_id and t.organization_id=p_organization_id and t.deleted_at is null
    and exists(select 1 from public.organization_members m where m.organization_id=t.organization_id
      and m.user_id=(select auth.uid()) and m.status='active')
  for update;
  if not found then raise exception 'task_assignment_unavailable' using errcode='42501'; end if;
  if p_user_id is not null and not exists(select 1 from public.organization_members m
    where m.organization_id=task_org and m.user_id=p_user_id and m.status='active') then
    raise exception 'task_assignee_unavailable' using errcode='42501';
  end if;
  select count(*) into expected_deletes from public.task_assignees where task_id=p_task_id;
  delete from public.task_assignees where task_id=p_task_id;
  get diagnostics actual_deletes = row_count;
  if actual_deletes<>expected_deletes then
    raise exception 'task_assignment_not_replaced' using errcode='42501';
  end if;
  if p_user_id is not null then
    insert into public.task_assignees(task_id,user_id) values(p_task_id,p_user_id) returning user_id into assigned_user;
    if assigned_user is distinct from p_user_id then
      raise exception 'task_assignment_not_replaced' using errcode='42501';
    end if;
  end if;
  return p_task_id;
end;
$$;
revoke all on function public.replace_task_assignee(uuid,uuid,uuid) from public,anon;
grant execute on function public.replace_task_assignee(uuid,uuid,uuid) to authenticated;
commit;
