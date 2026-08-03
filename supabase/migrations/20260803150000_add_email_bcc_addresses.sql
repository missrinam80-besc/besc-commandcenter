alter table public.email_communications
add column if not exists bcc_addresses text[] not null default '{}';

comment on column public.email_communications.bcc_addresses is
  'Blind-copy recipients passed to Gmail; managed with the same permissions as the communication record.';
