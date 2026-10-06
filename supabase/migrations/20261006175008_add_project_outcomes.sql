begin;
alter table public.projects
  add column goal text,
  add column deliverables text,
  add column acceptance_criteria text,
  add column closure_evaluation text,
  add constraint project_goal_length check(goal is null or char_length(goal)<=2000),
  add constraint project_deliverables_length check(deliverables is null or char_length(deliverables)<=5000),
  add constraint project_acceptance_length check(acceptance_criteria is null or char_length(acceptance_criteria)<=5000),
  add constraint project_evaluation_length check(closure_evaluation is null or char_length(closure_evaluation)<=5000);
-- Only guard a new transition to done. Historical completed records are not reclassified.
create function private.guard_project_closure() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.status='done' and (tg_op='INSERT' or old.status is distinct from 'done') then
    if coalesce(new.goal,'') !~ '[^[:space:]]' or coalesce(new.deliverables,'') !~ '[^[:space:]]'
       or coalesce(new.acceptance_criteria,'') !~ '[^[:space:]]' or coalesce(new.closure_evaluation,'') !~ '[^[:space:]]' then
      raise exception 'project_closure_required' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_project_closure() from public, anon, authenticated;
create trigger guard_project_closure before insert or update on public.projects for each row execute function private.guard_project_closure();
-- No backfill, status changes, grants or RLS changes. Existing audit triggers stay in place.
commit;
