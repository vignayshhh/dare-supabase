create or replace function public.get_inbox_page(p_user_id uuid,p_limit integer default 100)
returns jsonb language sql stable security invoker set search_path=public as $$
select coalesce(jsonb_agg(row_data order by (row_data->>'updated_at')::timestamptz desc), '[]'::jsonb) from (
select jsonb_build_object(
  'conversation_id',c.id,
  'user1_id',(array_agg(cm_all.user_id) filter(where cm_all.user_id<>p_user_id))[1],
  'user2_id',p_user_id,
  'created_at',c.created_at,
  'updated_at',c.updated_at,
  'last_message_at',lm.created_at,
  'last_message_content',lm.body,
  'unread_count',(select count(*) from public.messages um where um.conversation_id=c.id and um.sender_id<>p_user_id and (cm.last_read_at is null or um.created_at>cm.last_read_at)),
  'other_user',jsonb_build_object('id',op.id,'user_id',op.id,'username',op.username,'display_name',op.display_name,'avatar_url',op.avatar_url),
  'cleared_at',cm.inbox_payload->>'cleared_at',
  'hidden_message_ids',(select coalesce(jsonb_agg(h.message_id),'[]'::jsonb) from public.message_user_hides h join public.messages hm on hm.id=h.message_id where h.user_id=p_user_id and hm.conversation_id=c.id),
  'last_seen_by_user',coalesce((select jsonb_object_agg(cm_seen.user_id::text,cm_seen.last_read_at) from public.conversation_members cm_seen where cm_seen.conversation_id=c.id and cm_seen.last_read_at is not null),'{}'::jsonb),
  'last_seen_message_id_by_user',coalesce((select jsonb_object_agg(cm_seen.user_id::text,seen_message.id) from public.conversation_members cm_seen join lateral (select m.id from public.messages m where m.conversation_id=c.id and m.created_at<=cm_seen.last_read_at order by m.created_at desc,m.id desc limit 1) seen_message on true where cm_seen.conversation_id=c.id and cm_seen.last_read_at is not null),'{}'::jsonb),
  'temporary_participant_ids','[]'::jsonb
) row_data
from public.conversation_members cm
join public.conversations c on c.id=cm.conversation_id
join public.conversation_members cm_all on cm_all.conversation_id=c.id
left join lateral(select m.created_at,m.body from public.messages m where m.conversation_id=c.id and m.deleted_at is null order by m.created_at desc,m.id desc limit 1) lm on true
left join public.profiles op on op.id=(select x.user_id from public.conversation_members x where x.conversation_id=c.id and x.user_id<>p_user_id order by x.joined_at limit 1)
where cm.user_id=p_user_id
group by c.id,c.created_at,c.updated_at,lm.created_at,lm.body,op.id,op.username,op.display_name,op.avatar_url,cm.last_read_at,cm.inbox_payload
order by c.updated_at desc limit greatest(1,least(coalesce(p_limit,100),100))
) q;
$$;
