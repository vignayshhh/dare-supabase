-- Bound story selection before aggregation.  The previous function applied
-- LIMIT after jsonb_agg(), which limited the single aggregate row rather than
-- the stories being aggregated.
create or replace function public.get_friend_stories(p_user_id uuid, p_limit integer default 100)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with eligible as (
    select s.id, s.author_id, s.body, s.media_path, s.expires_at, s.created_at,
           s.legacy_payload,
           p.username as author_username,
           p.display_name as author_display_name,
           p.avatar_url as author_avatar,
           (select count(*)::integer from public.story_views v where v.story_id = s.id) as view_count
    from public.stories s
    join public.profiles p on p.id = s.author_id
    where s.expires_at > timezone('utc', now())
      and (
        s.author_id = p_user_id
        or exists (
          select 1
          from public.friendships f
          where f.status = 'ACCEPTED'
            and ((f.requester_id = p_user_id and f.addressee_id = s.author_id)
              or (f.addressee_id = p_user_id and f.requester_id = s.author_id))
        )
      )
    order by s.created_at desc, s.id desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'author_id', author_id,
      'body', body,
      'media_path', media_path,
      'expires_at', expires_at,
      'created_at', created_at,
      'metadata', coalesce(legacy_payload, '{}'::jsonb),
      'view_count', view_count,
      'author_username', author_username,
      'author_display_name', author_display_name,
      'author_avatar', author_avatar
    ) order by created_at desc, id desc
  ), '[]'::jsonb)
  from eligible;
$$;

revoke all on function public.get_friend_stories(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_friend_stories(uuid, integer) to service_role;

create index if not exists stories_active_author_cursor
  on public.stories(author_id, expires_at, created_at desc, id desc);

create index if not exists friendships_status_requester_addressee
  on public.friendships(status, requester_id, addressee_id);
