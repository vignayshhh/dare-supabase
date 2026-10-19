-- A post reaction represents one person in the headline like count, while
-- `taps` preserves that person's intentional repeat-like total.
create or replace function public.set_post_like(
  p_post_id uuid,
  p_liked boolean,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), p_actor_id);
  v_exists boolean;
  v_count integer;
  v_taps integer;
  v_author uuid;
begin
  if v_actor is null then
    raise exception 'unauthorized';
  end if;
  if auth.uid() is not null and p_actor_id is not null and p_actor_id <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select author_id into v_author
  from public.posts
  where id = p_post_id
  for update;
  if v_author is null then
    raise exception 'post_not_found';
  end if;

  select exists(
    select 1 from public.post_reactions
    where post_id = p_post_id and user_id = v_actor and reaction = 'LIKE'
  ) into v_exists;

  if p_liked and v_exists then
    update public.post_reactions
    set taps = least(coalesce(taps, 1) + 1, 50), updated_at = timezone('utc', now())
    where post_id = p_post_id and user_id = v_actor and reaction = 'LIKE'
    returning taps into v_taps;
  elsif p_liked then
    insert into public.post_reactions(post_id, user_id, reaction, taps)
    values (p_post_id, v_actor, 'LIKE', 1)
    returning taps into v_taps;
  elsif v_exists then
    delete from public.post_reactions
    where post_id = p_post_id and user_id = v_actor and reaction = 'LIKE';
    v_taps := 0;
  else
    v_taps := 0;
  end if;

  select reaction_count into v_count from public.posts where id = p_post_id;
  return jsonb_build_object(
    'duplicate', p_liked and v_exists,
    'liked', p_liked,
    'count', v_count,
    'tapCount', v_taps,
    'milestone', case when p_liked and not v_exists and v_count in (10,25,50,100,250,500,1000) then v_count end
  );
end;
$$;
