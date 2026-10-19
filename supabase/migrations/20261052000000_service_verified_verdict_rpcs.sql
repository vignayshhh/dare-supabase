-- Server routes already verify the session with withSecurity. These RPCs accept
-- that verified actor explicitly because service-role clients have no auth.uid.
create or replace function public.set_verdict_vote_native(p_verdict_id uuid,p_choice text,p_remove boolean,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_one integer; v_two integer; v_total integer;
begin
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
$$;

create or replace function public.create_verdict_comment_native(p_verdict_id uuid,p_text text,p_parent_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_count integer;
begin
  if p_actor_id is null then raise exception 'not_authenticated'; end if;
  if length(trim(coalesce(p_text,'')))=0 or length(p_text)>1000 then raise exception 'bad_text'; end if;
  perform 1 from public.verdicts where id=p_verdict_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_parent_id is not null and not exists(select 1 from public.verdict_comments where id=p_parent_id and verdict_id=p_verdict_id) then raise exception 'bad_parent'; end if;
  insert into public.verdict_comments(verdict_id,user_id,text,parent_id) values(p_verdict_id,p_actor_id,trim(p_text),p_parent_id) returning id into v_id;
  update public.verdicts set comments_count=comments_count+1,updated_at=timezone('utc',now()) where id=p_verdict_id returning comments_count into v_count;
  return jsonb_build_object('id',v_id,'verdict_id',p_verdict_id,'user_id',p_actor_id,'text',trim(p_text),'parent_id',p_parent_id,'comments_count',v_count);
end;
$$;
revoke all on function public.set_verdict_vote_native(uuid,text,boolean,uuid) from public;
revoke all on function public.create_verdict_comment_native(uuid,text,uuid,uuid) from public;
grant execute on function public.set_verdict_vote_native(uuid,text,boolean,uuid) to service_role;
grant execute on function public.create_verdict_comment_native(uuid,text,uuid,uuid) to service_role;
drop function if exists public.set_verdict_vote(uuid,text,boolean);
drop function if exists public.create_verdict_comment(uuid,text,uuid);
