create table public.integration_connections (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 provider text not null check(provider in('google_workspace','discord','vercel_ai_gateway','openai','anthropic','facebook','instagram','linkedin','youtube','twitch','tiktok','other')),
 display_name text not null,status text not null default 'not_configured' check(status in('not_configured','configured','connected','error','disabled')),
 account_label text,configuration jsonb not null default '{}',last_sync_at timestamptz,last_error text,created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz,unique(organization_id,provider,display_name)
);
create table public.ai_prompt_templates (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null,category text not null default 'general',description text,system_prompt text,prompt_template text not null,
 preferred_model text not null default 'openai/gpt-5.4',status text not null default 'active' check(status in('draft','active','archived')),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz
);
create table public.ai_generations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 template_id uuid references public.ai_prompt_templates(id) on delete set null,provider text not null,model text not null,input_text text not null,output_text text,
 status text not null default 'pending' check(status in('pending','completed','failed','cancelled')),input_tokens integer,output_tokens integer,cost_amount numeric(12,6),
 error_message text,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),completed_at timestamptz
);
alter table public.integration_connections enable row level security;alter table public.ai_prompt_templates enable row level security;alter table public.ai_generations enable row level security;
grant select,insert,update,delete on public.integration_connections,public.ai_prompt_templates,public.ai_generations to authenticated;
create policy "managers read integrations" on public.integration_connections for select to authenticated using(private.is_org_manager(organization_id));
create policy "managers create integrations" on public.integration_connections for insert to authenticated with check(private.is_org_manager(organization_id) and created_by=(select auth.uid()));
create policy "managers update integrations" on public.integration_connections for update to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));
create policy "managers delete integrations" on public.integration_connections for delete to authenticated using(private.is_org_manager(organization_id));
create policy "members read active prompts" on public.ai_prompt_templates for select to authenticated using(private.is_active_member(organization_id) and(status='active' or private.is_org_manager(organization_id)));
create policy "managers create prompts" on public.ai_prompt_templates for insert to authenticated with check(private.is_org_manager(organization_id) and created_by=(select auth.uid()));
create policy "managers update prompts" on public.ai_prompt_templates for update to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));
create policy "managers delete prompts" on public.ai_prompt_templates for delete to authenticated using(private.is_org_manager(organization_id));
create policy "members read own generations or managers" on public.ai_generations for select to authenticated using(private.is_active_member(organization_id) and(created_by=(select auth.uid()) or private.is_org_manager(organization_id)));
create policy "members create generations" on public.ai_generations for insert to authenticated with check(private.is_active_member(organization_id) and created_by=(select auth.uid()));
create policy "managers update generations" on public.ai_generations for update to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));
create index integrations_org_idx on public.integration_connections(organization_id,provider) where deleted_at is null;create index prompts_org_idx on public.ai_prompt_templates(organization_id,status,category) where deleted_at is null;create index generations_org_idx on public.ai_generations(organization_id,created_at desc);create index generations_creator_idx on public.ai_generations(created_by,created_at desc);
