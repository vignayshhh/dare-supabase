create table if not exists public.message_user_hides (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, message_id)
);
alter table public.message_user_hides enable row level security;
create policy message_user_hides_own on public.message_user_hides for select to authenticated using (user_id=auth.uid());

create or replace function public.hide_message_for_me(p_message_id uuid) returns void language plpgsql security invoker set search_path=public as $$
begin
  insert into public.message_user_hides(user_id,message_id)
  select auth.uid(),m.id from public.messages m
  where m.id=p_message_id and exists(select 1 from public.conversation_members cm where cm.conversation_id=m.conversation_id and cm.user_id=auth.uid())
  on conflict do nothing;
  if not found then raise exception 'message_access_denied'; end if;
end; $$;
revoke all on function public.hide_message_for_me(uuid) from public;
grant execute on function public.hide_message_for_me(uuid) to authenticated;

create or replace function public.get_inbox_page(p_user_id uuid,p_limit integer default 100)
returns jsonb language sql stable security invoker set search_path=public as $$
select coalesce(jsonb_agg(row_data order by (row_data->>'updated_at')::timestamptz desc), '[]'::jsonb) from (
select jsonb_build_object('conversation_id',c.id,'user1_id',(array_agg(cm_all.user_id) filter(where cm_all.user_id<>p_user_id))[1],'user2_id',p_user_id,'created_at',c.created_at,'updated_at',c.updated_at,'last_message_at',lm.created_at,'last_message_content',lm.body,'unread_count',(select count(*) from public.messages um where um.conversation_id=c.id and um.sender_id<>p_user_id and (cm.last_read_at is null or um.created_at>cm.last_read_at)),'other_user',jsonb_build_object('id',op.id,'user_id',op.id,'username',op.username,'display_name',op.display_name,'avatar_url',op.avatar_url),'cleared_at',cm.inbox_payload->>'cleared_at','hidden_message_ids',(select coalesce(jsonb_agg(h.message_id),'[]'::jsonb) from public.message_user_hides h join public.messages hm on hm.id=h.message_id where h.user_id=p_user_id and hm.conversation_id=c.id),'temporary_participant_ids','[]'::jsonb) row_data
from public.conversation_members cm join public.conversations c on c.id=cm.conversation_id join public.conversation_members cm_all on cm_all.conversation_id=c.id left join lateral(select m.created_at,m.body from public.messages m where m.conversation_id=c.id and m.deleted_at is null order by m.created_at desc,m.id desc limit 1) lm on true left join public.profiles op on op.id=(select x.user_id from public.conversation_members x where x.conversation_id=c.id and x.user_id<>p_user_id order by x.joined_at limit 1)
where cm.user_id=p_user_id group by c.id,c.created_at,c.updated_at,lm.created_at,lm.body,op.id,op.username,op.display_name,op.avatar_url,cm.last_read_at,cm.inbox_payload order by c.updated_at desc limit greatest(1,least(coalesce(p_limit,100),100)))q;
$$;
