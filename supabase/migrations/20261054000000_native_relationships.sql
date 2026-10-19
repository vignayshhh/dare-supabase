create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade, target_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('conflict','alliance','favorite','rival')), reason text not null, target_reason text, status text not null check (status in ('unacknowledged','mutual','countered','resolved')),
  owner_snapshot jsonb not null default '{}'::jsonb, target_snapshot jsonb not null default '{}'::jsonb, month_key text, watchers_count integer not null default 0 check (watchers_count >= 0), resolved_by jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), resolved_at timestamptz
);
create index if not exists relationships_owner_created_idx on public.relationships(owner_id, created_at desc, id desc);
create index if not exists relationships_target_created_idx on public.relationships(target_id, created_at desc, id desc);
alter table public.relationships enable row level security;
drop policy if exists relationships_select on public.relationships;
create policy relationships_select on public.relationships for select to authenticated using (owner_id = auth.uid() or target_id = auth.uid());
drop policy if exists relationships_insert on public.relationships;
create policy relationships_insert on public.relationships for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists relationships_update on public.relationships;
create policy relationships_update on public.relationships for update to authenticated using (owner_id = auth.uid() or target_id = auth.uid()) with check (owner_id = auth.uid() or target_id = auth.uid());
create or replace function public.mark_relationship_resolved_native(p_relationship_id uuid, p_actor_id uuid default null) returns public.relationships language plpgsql security definer set search_path = public as $$
declare v_actor uuid := coalesce(p_actor_id, auth.uid()); v_row public.relationships; v_resolved jsonb;
begin
  if v_actor is null or auth.uid() is distinct from v_actor then raise exception 'unauthorized'; end if;
  select * into v_row from public.relationships where id = p_relationship_id and (owner_id = v_actor or target_id = v_actor) for update;
  if v_row.id is null then raise exception 'relationship_not_found'; end if;
  v_resolved := coalesce(v_row.resolved_by, '{}'::jsonb) || jsonb_build_object(v_actor::text, true);
  update public.relationships set resolved_by = v_resolved, status = case when (v_resolved ? owner_id::text) and (v_resolved ? target_id::text) then 'resolved' else status end, resolved_at = case when (v_resolved ? owner_id::text) and (v_resolved ? target_id::text) then timezone('utc', now()) else resolved_at end, updated_at = timezone('utc', now()) where id = p_relationship_id returning * into v_row;
  return v_row;
end; $$;
revoke all on function public.mark_relationship_resolved_native(uuid, uuid) from public;
grant execute on function public.mark_relationship_resolved_native(uuid, uuid) to authenticated, service_role;
grant select, insert, update, delete on public.relationships to authenticated, service_role;
do $$ begin alter publication supabase_realtime add table public.relationships; exception when duplicate_object then null; when undefined_object then null; end $$;
