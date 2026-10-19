-- Increment birthday drop comment counters without scanning the comment table.
-- The API route performs the existing room/actor authorization before calling this
-- service-role RPC, so the function only exposes the narrow counter operation.
create or replace function public.increment_birthday_drop_reply_count(p_drop_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  update public.birthday_drops
     set reply_count = coalesce(reply_count, 0) + 1,
         updated_at = timezone('utc', now())
   where id = p_drop_id
   returning reply_count into next_count;

  if next_count is null then
    raise exception using errcode = 'P0002', message = 'birthday_drop_not_found';
  end if;

  return next_count;
end;
$$;

revoke all on function public.increment_birthday_drop_reply_count(uuid) from public, anon, authenticated;
grant execute on function public.increment_birthday_drop_reply_count(uuid) to service_role;

-- The function enforces p_user_id = auth.uid() for authenticated callers.
-- This lets the browser story repository use the same bounded feed path as
-- the API instead of re-reading friendships, stories, views, and profiles.
grant execute on function public.get_friend_stories(uuid, integer) to authenticated;

create or replace function public.add_birthday_drop_reaction(
  p_drop_id uuid,
  p_user_id uuid,
  p_reaction text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  insert into public.birthday_drop_reactions(drop_id, user_id, reaction)
  values (p_drop_id, p_user_id, p_reaction)
  on conflict (drop_id, user_id, reaction) do nothing;

  get diagnostics affected = row_count;
  if affected = 0 then return false; end if;

  update public.birthday_drops
     set reaction_count = coalesce(reaction_count, 0) + 1,
         updated_at = timezone('utc', now())
   where id = p_drop_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_drop_not_found';
  end if;
  return true;
end;
$$;

revoke all on function public.add_birthday_drop_reaction(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.add_birthday_drop_reaction(uuid, uuid, text) to service_role;
