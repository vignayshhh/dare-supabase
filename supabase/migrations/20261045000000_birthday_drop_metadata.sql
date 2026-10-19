alter table public.birthday_drops add column if not exists metadata jsonb not null default '{}'::jsonb;
