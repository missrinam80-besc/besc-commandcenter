alter table public.content_items add column campaign_id uuid references public.campaigns(id) on delete set null, add column partner_id uuid references public.partners(id) on delete set null;
alter table public.events add column partner_id uuid references public.partners(id) on delete set null;
create index content_items_campaign_idx on public.content_items(campaign_id) where deleted_at is null;
create index content_items_partner_idx on public.content_items(partner_id) where deleted_at is null;
create index events_partner_idx on public.events(partner_id) where deleted_at is null;
