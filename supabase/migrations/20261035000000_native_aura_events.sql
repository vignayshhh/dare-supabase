alter table public.aura_events add column if not exists kind text;
alter table public.aura_events add column if not exists title text;
alter table public.aura_events add column if not exists message text;
alter table public.aura_events add column if not exists qualifier text;
alter table public.aura_events add column if not exists idempotency_key text;
alter table public.aura_events add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.aura_events add column if not exists current_aura_after integer;
alter table public.aura_events add column if not exists lifetime_aura_after integer;
alter table public.aura_events add column if not exists celebrated_at timestamptz;
create unique index if not exists aura_events_idempotency_key_unique on public.aura_events(idempotency_key) where idempotency_key is not null;
create index if not exists aura_events_user_created on public.aura_events(user_id,created_at desc);

create or replace function public.celebrate_aura_event(p_event_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_user_id is null then raise exception 'missing user' using errcode='22023'; end if;
  update public.aura_events set celebrated_at=coalesce(celebrated_at,timezone('utc',now()))
  where id=p_event_id and user_id=p_user_id;
  if not found then raise exception 'aura event not found' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.celebrate_aura_event(uuid,uuid) from public;
grant execute on function public.celebrate_aura_event(uuid,uuid) to service_role;
