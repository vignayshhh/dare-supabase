create or replace function public.get_inbox_page(p_user_id uuid,p_limit integer default 100)
returns jsonb language sql stable security invoker set search_path=public as $$
select coalesce(jsonb_agg(row_data order by (row_data->>'updated_at')::timestamptz desc), '[]'::jsonb)
from (
  select jsonb_build_object(
    'conversation_id',c.id,'user1_id',(array_agg(cm_all.user_id) filter(where cm_all.user_id <> p_user_id))[1],
    'user2_id',p_user_id,'created_at',c.created_at,'updated_at',c.updated_at,
    'last_message_at',lm.created_at,'last_message_content',lm.body,
    'unread_count',(select count(*) from public.messages um where um.conversation_id=c.id and um.sender_id<>p_user_id and (cm.last_read_at is null or um.created_at>cm.last_read_at)),
    'other_user',jsonb_build_object('id',other_profile.id,'user_id',other_profile.id,'username',other_profile.username,'display_name',other_profile.display_name,'avatar_url',other_profile.avatar_url),
    'cleared_at',null,'temporary_participant_ids','[]'::jsonb
  ) row_data
  from public.conversation_members cm
  join public.conversations c on c.id=cm.conversation_id
  join public.conversation_members cm_all on cm_all.conversation_id=c.id
  left join lateral (select m.created_at,m.body from public.messages m where m.conversation_id=c.id and m.deleted_at is null order by m.created_at desc,m.id desc limit 1) lm on true
  left join public.profiles other_profile on other_profile.id=(select x.user_id from public.conversation_members x where x.conversation_id=c.id and x.user_id<>p_user_id order by x.joined_at limit 1)
  where cm.user_id=p_user_id
  group by c.id,c.created_at,c.updated_at,lm.created_at,lm.body,other_profile.id,other_profile.username,other_profile.display_name,other_profile.avatar_url,cm.last_read_at
  order by c.updated_at desc
  limit greatest(1,least(coalesce(p_limit,100),100))
) q;
$$;
revoke all on function public.get_inbox_page(uuid,integer) from public;
grant execute on function public.get_inbox_page(uuid,integer) to authenticated,service_role;
