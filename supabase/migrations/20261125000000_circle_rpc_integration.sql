-- Preserve existing RPC wire formats while enforcing Circle context.
begin;
CREATE OR REPLACE FUNCTION public.set_verdict_vote_native(p_verdict_id uuid, p_choice text, p_remove boolean, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_one integer; v_two integer; v_total integer;
begin
  if auth.uid() is null or p_actor_id is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.verdicts where id=p_verdict_id and public.has_circle_access(circle_id)) then raise exception 'Circle access required'; end if;
  if p_actor_id is null then raise exception 'not_authenticated'; end if;
  if not p_remove and p_choice not in ('one','two') then raise exception 'bad_choice'; end if;
  perform 1 from public.verdicts where id=p_verdict_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_remove then delete from public.verdict_votes where verdict_id=p_verdict_id and user_id=p_actor_id;
  else insert into public.verdict_votes(verdict_id,user_id,choice) values(p_verdict_id,p_actor_id,p_choice)
    on conflict(verdict_id,user_id) do update set choice=excluded.choice,updated_at=timezone('utc',now()); end if;
  select count(*) filter(where choice='one'),count(*) filter(where choice='two'),count(*) into v_one,v_two,v_total from public.verdict_votes where verdict_id=p_verdict_id;
  update public.verdicts set choice_one_votes=v_one,choice_two_votes=v_two,total_votes=v_total,updated_at=timezone('utc',now()) where id=p_verdict_id;
  return jsonb_build_object('verdict_id',p_verdict_id,'my_vote',case when p_remove then null else p_choice end,'total_votes',v_total,'choice_one_votes',v_one,'choice_two_votes',v_two);
end;
$function$;

grant execute on function public.set_verdict_vote_native(uuid,text,boolean,uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.create_verdict_comment_native(p_verdict_id uuid, p_text text, p_parent_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_count integer;
begin
  if auth.uid() is null or p_actor_id is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.verdicts where id=p_verdict_id and public.has_circle_access(circle_id)) then raise exception 'Circle access required'; end if;
  if p_actor_id is null then raise exception 'not_authenticated'; end if;
  if length(trim(coalesce(p_text,'')))=0 or length(p_text)>1000 then raise exception 'bad_text'; end if;
  perform 1 from public.verdicts where id=p_verdict_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_parent_id is not null and not exists(select 1 from public.verdict_comments where id=p_parent_id and verdict_id=p_verdict_id) then raise exception 'bad_parent'; end if;
  insert into public.verdict_comments(verdict_id,user_id,text,parent_id) values(p_verdict_id,p_actor_id,trim(p_text),p_parent_id) returning id into v_id;
  update public.verdicts set comments_count=comments_count+1,updated_at=timezone('utc',now()) where id=p_verdict_id returning comments_count into v_count;
  return jsonb_build_object('id',v_id,'verdict_id',p_verdict_id,'user_id',p_actor_id,'text',trim(p_text),'parent_id',p_parent_id,'comments_count',v_count);
end;
$function$;

grant execute on function public.create_verdict_comment_native(uuid,text,uuid,uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(p_other_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_me uuid:=auth.uid(); v_id uuid; v_created timestamptz; v_updated timestamptz;
begin
  if v_me is null or p_other_user_id is null or v_me=p_other_user_id then raise exception 'invalid conversation participants' using errcode='22023'; end if;
  if not public.is_circle_member(public.active_circle_id(),v_me) or not public.is_circle_member(public.active_circle_id(),p_other_user_id) then raise exception 'users must be friends to create a conversation' using errcode='42501'; end if;
  select c.id,c.created_at,c.updated_at into v_id,v_created,v_updated
  from public.conversations c
  where c.kind = 'DIRECT' and public.has_circle_access(c.circle_id)
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
$function$;

CREATE OR REPLACE FUNCTION public.get_friend_stories(p_user_id uuid, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      and public.has_circle_access(s.circle_id)
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
$function$;

commit;
