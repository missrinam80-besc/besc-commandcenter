alter table public.meetings
add column ends_at timestamptz;

alter table public.meetings
add constraint meetings_end_after_start_check
check (ends_at is null or meeting_at is null or ends_at > meeting_at);
