create extension if not exists pg_trgm;

alter table public.profiles
  add column if not exists dares_completed integer not null default 0 check (dares_completed >= 0),
  add column if not exists dares_refused integer not null default 0 check (dares_refused >= 0);

create index if not exists profiles_username_trgm_idx
  on public.profiles using gin (lower(username) gin_trgm_ops);
create index if not exists profiles_display_name_trgm_idx
  on public.profiles using gin (lower(display_name) gin_trgm_ops);

create or replace function public.search_profiles(
  p_query text,
  p_limit integer default 20
) returns setof public.profiles
language sql
stable
security invoker
set search_path = public
as $$
  select profile.*
  from public.profiles profile
  where profile.visibility = 'PUBLIC'
    and length(btrim(p_query)) between 1 and 50
    and (
      lower(profile.username) like lower(btrim(p_query)) || '%'
      or lower(profile.display_name) like lower(btrim(p_query)) || '%'
    )
  order by
    case when lower(profile.username) = lower(btrim(p_query)) then 0
         when lower(profile.username) like lower(btrim(p_query)) || '%' then 1
         else 2 end,
    lower(profile.username), profile.id
  limit least(greatest(coalesce(p_limit, 20), 1), 20);
$$;

revoke all on function public.search_profiles(text, integer) from public;
grant execute on function public.search_profiles(text, integer) to authenticated, service_role;

drop policy if exists alerts_recipient_delete on public.alerts;
create policy alerts_recipient_delete on public.alerts
  for delete to authenticated using (recipient_id = auth.uid());

create or replace function public.delete_sent_friend_request_alert(
  p_recipient_id uuid,
  p_friendship_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  delete from public.alerts
  where recipient_id = p_recipient_id
    and actor_id = auth.uid()
    and type = 'FRIEND_REQUEST'
    and payload ->> 'entityId' = p_friendship_id::text;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.delete_sent_friend_request_alert(uuid, uuid) from public;
grant execute on function public.delete_sent_friend_request_alert(uuid, uuid) to authenticated, service_role;
