alter table public.stories
  drop constraint if exists stories_visibility_check;

alter table public.stories
  add constraint stories_visibility_check
  check (visibility in ('PUBLIC', 'FRIENDS', 'PRIVATE', 'CLOSE_FRIENDS'));

drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories
for select to authenticated
using (
  expires_at > timezone('utc', now())
  and (
    visibility = 'PUBLIC'
    or author_id = auth.uid()
    or (visibility = 'FRIENDS' and public.are_friends(author_id, auth.uid()))
    or (
      visibility = 'CLOSE_FRIENDS'
      and exists (
        select 1 from public.close_friends cf
        where cf.owner_id = stories.author_id
          and cf.close_friend_id = auth.uid()
      )
    )
  )
);

create or replace function public.get_friend_stories(
  p_user_id uuid,
  p_limit integer default 100
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with eligible as (
    select
      s.id,
      s.author_id,
      s.body,
      s.media_path,
      s.visibility,
      s.expires_at,
      s.created_at,
      s.legacy_payload,
      p.username as author_username,
      p.display_name as author_display_name,
      p.avatar_url as author_avatar,
      dedicated.id as dedicated_to_id,
      dedicated.username as dedicated_to_username,
      dedicated.display_name as dedicated_to_display_name,
      dedicated.avatar_url as dedicated_to_avatar,
      (select count(*)::integer from public.story_views v where v.story_id = s.id) as view_count,
      exists (
        select 1 from public.story_views viewer_state
        where viewer_state.story_id = s.id and viewer_state.viewer_id = p_user_id
      ) as has_viewed
    from public.stories s
    join public.profiles p on p.id = s.author_id
    left join public.profiles dedicated on dedicated.id = public.safe_uuid(
      coalesce(
        s.legacy_payload ->> 'dedicatedToUserId',
        s.legacy_payload ->> 'dedicated_to_user_id'
      )
    )
    where (p_user_id = auth.uid() or auth.role() = 'service_role')
      and s.expires_at > timezone('utc', now())
      and (
        s.author_id = p_user_id
        or (
          s.visibility = 'PUBLIC'
          and exists (
            select 1 from public.friendships f
            where upper(f.status) = 'ACCEPTED'
              and ((f.requester_id = p_user_id and f.addressee_id = s.author_id)
                or (f.addressee_id = p_user_id and f.requester_id = s.author_id))
          )
        )
        or (
          s.visibility = 'FRIENDS'
          and exists (
            select 1 from public.friendships f
            where upper(f.status) = 'ACCEPTED'
              and ((f.requester_id = p_user_id and f.addressee_id = s.author_id)
                or (f.addressee_id = p_user_id and f.requester_id = s.author_id))
          )
        )
        or (
          s.visibility = 'CLOSE_FRIENDS'
          and exists (
            select 1 from public.close_friends cf
            where cf.owner_id = s.author_id
              and cf.close_friend_id = p_user_id
          )
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
      'visibility', visibility,
      'expires_at', expires_at,
      'created_at', created_at,
      'metadata', coalesce(legacy_payload, '{}'::jsonb),
      'view_count', view_count,
      'has_viewed', has_viewed,
      'author_username', author_username,
      'author_display_name', author_display_name,
      'author_avatar', author_avatar,
      'dedicated_to_id', dedicated_to_id,
      'dedicated_to_username', dedicated_to_username,
      'dedicated_to_display_name', dedicated_to_display_name,
      'dedicated_to_avatar', dedicated_to_avatar
    ) order by created_at desc, id desc
  ), '[]'::jsonb)
  from eligible;
$$;

revoke all on function public.get_friend_stories(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_friend_stories(uuid, integer) to service_role;
