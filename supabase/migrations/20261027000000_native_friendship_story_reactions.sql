create or replace function public.toggle_story_reaction(p_story_id uuid,p_reaction text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_existing text; v_current text; v_likes bigint; v_hates bigint;
begin
  if v_actor is null then raise exception 'unauthorized'; end if;
  if p_reaction not in ('like','hate') then raise exception 'bad_reaction'; end if;
  if not exists(select 1 from public.stories where id=p_story_id and expires_at>timezone('utc',now())) then raise exception 'story_not_found'; end if;
  select reaction into v_existing from public.story_reactions where story_id=p_story_id and user_id=v_actor for update;
  if v_existing=p_reaction then delete from public.story_reactions where story_id=p_story_id and user_id=v_actor;
  else insert into public.story_reactions(story_id,user_id,reaction,created_at) values(p_story_id,v_actor,p_reaction,timezone('utc',now())) on conflict(story_id,user_id) do update set reaction=excluded.reaction,created_at=excluded.created_at; v_current:=p_reaction; end if;
  select count(*) filter(where reaction='like'),count(*) filter(where reaction='hate') into v_likes,v_hates from public.story_reactions where story_id=p_story_id;
  return jsonb_build_object('currentReaction',v_current,'likeCount',v_likes,'hateCount',v_hates);
end;
$$;
revoke all on function public.toggle_story_reaction(uuid,text) from public;
grant execute on function public.toggle_story_reaction(uuid,text) to authenticated;

create or replace function public.write_friendship_document(p_document_id text,p_data jsonb,p_mode text default 'set')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_requester uuid:=public.try_uuid(p_data->>'requester_id'); v_addressee uuid:=public.try_uuid(p_data->>'addressee_id'); v_status text; v_id uuid;
begin
  v_status:=case lower(coalesce(p_data->>'status','pending')) when 'accepted' then 'ACCEPTED' when 'declined' then 'DECLINED' when 'rejected' then 'DECLINED' when 'blocked' then 'BLOCKED' else 'PENDING' end;
  if p_mode='update' and not exists(select 1 from public.friendships where legacy_document_id=p_document_id or id=public.try_uuid(p_document_id)) then raise exception 'document_not_found'; end if;
  select id into v_id from public.friendships where legacy_document_id=p_document_id or id=public.try_uuid(p_document_id) limit 1;
  if v_id is null then v_id:=coalesce(public.try_uuid(p_document_id),gen_random_uuid()); end if;
  insert into public.friendships(id,requester_id,addressee_id,status,legacy_document_id,legacy_payload)
  values(v_id,v_requester,v_addressee,v_status,p_document_id,p_data)
  on conflict((least(requester_id,addressee_id)),(greatest(requester_id,addressee_id))) do update set status=excluded.status,legacy_document_id=excluded.legacy_document_id,legacy_payload=excluded.legacy_payload,updated_at=timezone('utc',now());
  return p_data;
end;
$$;
create or replace function public.delete_friendship_document(p_document_id text)
returns void language sql security invoker set search_path=public as $$
  delete from public.friendships where legacy_document_id=p_document_id or id=public.try_uuid(p_document_id);
$$;
revoke all on function public.write_friendship_document(text,jsonb,text) from public;
revoke all on function public.delete_friendship_document(text) from public;
grant execute on function public.write_friendship_document(text,jsonb,text) to authenticated,service_role;
grant execute on function public.delete_friendship_document(text) to authenticated,service_role;
