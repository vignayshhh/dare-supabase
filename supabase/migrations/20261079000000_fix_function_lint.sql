-- Resolve post-deployment function lint findings without rewriting applied history.

create or replace function public.try_timestamptz(p_value text)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
begin
  return nullif(p_value, '')::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function public.toggle_challenge_comment_like(
  p_comment_id uuid,
  p_user_id uuid,
  p_challenge_id uuid default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_removed_id uuid;
  v_comment_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not authorized';
  end if;

  select comments.id into v_comment_id
  from public.challenge_proof_comments as comments
  where comments.id = p_comment_id
  for update;

  if v_comment_id is null then
    raise exception 'comment not found';
  end if;

  delete from public.challenge_comment_likes as likes
  where likes.comment_id = p_comment_id
    and likes.user_id = p_user_id
  returning likes.id into v_removed_id;

  if v_removed_id is not null then
    return false;
  end if;

  insert into public.challenge_comment_likes (comment_id, challenge_id, user_id)
  values (p_comment_id, p_challenge_id, p_user_id)
  on conflict (comment_id, user_id) do nothing;

  return true;
end;
$$;

revoke all on function public.toggle_challenge_comment_like(uuid, uuid, uuid) from public;
grant execute on function public.toggle_challenge_comment_like(uuid, uuid, uuid) to authenticated;
