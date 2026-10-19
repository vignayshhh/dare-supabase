create or replace function public.get_friend_stories(p_user_id uuid,p_limit integer default 100)
returns jsonb language sql security definer set search_path=public as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc,s.id desc),'[]'::jsonb)
  from public.stories s
  where s.expires_at>timezone('utc',now())
    and (s.author_id=p_user_id or exists(select 1 from public.friendships f where f.status='ACCEPTED' and ((f.requester_id=p_user_id and f.addressee_id=s.author_id) or (f.addressee_id=p_user_id and f.requester_id=s.author_id))))
  limit greatest(1,least(coalesce(p_limit,100),200));
$$;
revoke all on function public.get_friend_stories(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_friend_stories(uuid,integer) to service_role;
