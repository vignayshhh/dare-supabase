create table if not exists public.two_factor_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  method text not null default 'none' check (method in ('email','sms','none')),
  phone_number text,
  verified boolean not null default false,
  secret text,
  backup_codes text[] not null default '{}',
  last_used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.two_factor_settings enable row level security;
create policy two_factor_settings_own_select on public.two_factor_settings for select to authenticated using (user_id=auth.uid());
create policy two_factor_settings_own_insert on public.two_factor_settings for insert to authenticated with check (user_id=auth.uid());
create policy two_factor_settings_own_update on public.two_factor_settings for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
revoke all on public.two_factor_settings from anon;
grant select,insert,update on public.two_factor_settings to authenticated,service_role;
do $$
begin
  if to_regclass('public.feature_two_factor_settings_records') is not null
     and exists (select 1 from public.feature_two_factor_settings_records limit 1) then
    raise exception 'two_factor_compatibility_records_not_empty';
  end if;
  if to_regclass('public.feature_two_factor_settings_records') is not null then
    drop table public.feature_two_factor_settings_records;
  end if;
end $$;
create table if not exists public.security_logs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  details jsonb not null default '{}'::jsonb,
  severity text not null check (severity in ('low','medium','high','critical')),
  ip_address text not null default 'unknown',
  device_fingerprint text not null default 'unknown',
  user_agent text not null default 'unknown',
  path text,
  method text,
  environment text not null default 'production',
  created_at timestamptz not null default now()
);
create index if not exists security_logs_user_created_idx on public.security_logs(user_id, created_at desc);
create index if not exists security_logs_severity_created_idx on public.security_logs(severity, created_at desc);
alter table public.security_logs enable row level security;
revoke all on public.security_logs from anon;
revoke all on public.security_logs from authenticated;
grant insert on public.security_logs to authenticated;
create policy security_logs_insert_self on public.security_logs for insert to authenticated
  with check (user_id = auth.uid() or user_id is null);

create table if not exists public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.security_alerts enable row level security;
revoke all on public.security_alerts from anon, authenticated;
