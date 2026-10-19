-- Chat-invite service still uses a feature-scoped response record. Keep its
-- storage isolated from core tables and from the retired generic store.
create table if not exists public.feature_chat_invites_records (
  collection text not null,
  document_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key(collection, document_id)
);
create index if not exists feature_chat_invites_records_updated on public.feature_chat_invites_records(collection,updated_at desc,document_id);
alter table public.feature_chat_invites_records enable row level security;
drop policy if exists feature_chat_invites_records_access on public.feature_chat_invites_records;
create policy feature_chat_invites_records_access on public.feature_chat_invites_records for all to authenticated using (true) with check (true);
grant select,insert,update,delete on public.feature_chat_invites_records to authenticated,service_role;
