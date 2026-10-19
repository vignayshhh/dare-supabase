create or replace function public.get_direct_conversation(p_other_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
select coalesce((select jsonb_build_object('id',c.id,'user1_id',auth.uid(),'user2_id',p_other_user_id,'created_at',c.created_at,'updated_at',c.updated_at)
  from public.conversations c
  where c.kind='DIRECT'
    and exists (select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=auth.uid())
    and exists (select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=p_other_user_id)
    and 2=(select count(*) from public.conversation_members m where m.conversation_id=c.id)
  order by c.updated_at desc,c.id desc limit 1), '{}'::jsonb);
$$;

create or replace function public.get_or_create_direct_conversation(p_other_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_me uuid:=auth.uid(); v_id uuid; v_created timestamptz; v_updated timestamptz;
begin
  if v_me is null or p_other_user_id is null or v_me=p_other_user_id then raise exception 'invalid conversation participants' using errcode='22023'; end if;
  if not public.are_friends(v_me,p_other_user_id) then raise exception 'users must be friends to create a conversation' using errcode='42501'; end if;
  select c.id,c.created_at,c.updated_at into v_id,v_created,v_updated
  from public.conversations c
  where c.kind = 'DIRECT'
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = v_me)
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = p_other_user_id)
    and 2 = (select count(*) from public.conversation_members m where m.conversation_id = c.id)
  order by c.updated_at desc, c.id desc
  limit 1;

  if v_id is null then
    insert into public.conversations(kind) values ('DIRECT') returning id, created_at, updated_at into v_id, v_created, v_updated;
    insert into public.conversation_members(conversation_id, user_id, role)
      values (v_id, v_me, 'MEMBER'), (v_id, p_other_user_id, 'MEMBER');
  end if;

  return jsonb_build_object(
    'id', v_id,
    'user1_id', v_me,
    'user2_id', p_other_user_id,
    'created_at', v_created,
    'updated_at', v_updated
  );
end;
$$;

revoke all on function public.get_direct_conversation(uuid) from public;
grant execute on function public.get_direct_conversation(uuid) to authenticated, service_role;
revoke all on function public.get_or_create_direct_conversation(uuid) from public;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated, service_role;
