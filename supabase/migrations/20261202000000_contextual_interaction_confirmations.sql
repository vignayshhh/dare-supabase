begin;
create table public.drama_confirmations (
 post_id uuid not null references public.drama_posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id),
 status text not null default 'pending' check(status in ('pending','accepted','declined')),
 primary key(post_id,user_id)
);
alter table public.drama_confirmations enable row level security;
create policy drama_confirmation_read on public.drama_confirmations for select to authenticated using(
 exists(select 1 from public.drama_posts p where p.id=post_id and public.has_circle_access(p.circle_id)));
grant select on public.drama_confirmations to authenticated;
grant all on public.drama_confirmations to service_role;

create function public.invite_drama_participants() returns trigger language plpgsql security definer set search_path=public as $$
declare v_target uuid; v_targets uuid[]:='{}'; v_name text; v_message uuid;
begin
 if new.kind='prediction' or (new.kind='deal' and new.payload->>'scope'='friend') then
  v_target:=nullif(new.payload->'subject'->>'id','')::uuid;
 elsif new.kind='promise' and new.payload->>'audience'='friend' then
  v_target:=nullif(new.payload->>'targetId','')::uuid;
  if v_target is null then raise exception 'Choose the person receiving this promise'; end if;
 end if;
 if v_target is not null then
  if not public.is_circle_member(new.circle_id,v_target) then raise exception 'Participant is not in this Circle'; end if;
  if v_target<>new.creator_id then v_targets:=array[v_target]; end if;
 elsif (new.kind='deal' and new.payload->>'scope' in ('group','crew')) or (new.kind='promise' and new.payload->>'audience'='crew') then
  select coalesce(array_agg(user_id),'{}') into v_targets from circle_members where circle_id=new.circle_id and user_id<>new.creator_id;
 end if;
 if new.kind in ('deal','promise') then
  insert into drama_confirmations(post_id,user_id) select new.id,unnest(v_targets);
  if cardinality(v_targets)>0 then
   update circle_chat_messages set status='awaiting confirmation' where interaction_kind=new.kind and interaction_id=new.id;
  end if;
 end if;
 select coalesce(nullif(display_name,''),username,'Circle member') into v_name from profiles where id=new.creator_id;
 select id into v_message from circle_chat_messages where interaction_kind=new.kind and interaction_id=new.id;
 insert into alerts(recipient_id,actor_id,type,circle_id,payload)
 select target,new.creator_id,'SYSTEM_NOTIFICATION',new.circle_id,jsonb_build_object('entityId',new.id,
 'message',v_name||case when new.kind='prediction' then ' made a prediction about you' else ' needs your confirmation on a '||new.kind end,
 'metadata',jsonb_build_object('interactionKind',new.kind,'interactionId',new.id,'chatMessageId',v_message,'actorName',v_name))
 from unnest(v_targets) target;
 return null;
end $$;
-- Runs after sync_chat_interaction so alerts can link to its durable card.
create trigger zz_invite_drama_participants after insert on public.drama_posts for each row execute function public.invite_drama_participants();

create function public.confirm_drama_participation(p_post uuid,p_accept boolean)
returns void language plpgsql security definer set search_path=public as $$
declare v_post drama_posts; v_pending boolean; v_declined boolean;
begin
 select * into v_post from drama_posts where id=p_post for update;
 if not found or not public.has_circle_access(v_post.circle_id) or v_post.resolution is not null then raise exception 'Interaction unavailable'; end if;
 update drama_confirmations set status=case when p_accept then 'accepted' else 'declined' end
 where post_id=p_post and user_id=auth.uid() and status='pending';
 if not found then raise exception 'No pending confirmation'; end if;
 select bool_or(status='pending'),bool_or(status='declined') into v_pending,v_declined from drama_confirmations where post_id=p_post;
 update circle_chat_messages set status=case when v_declined then 'declined' when v_pending then 'awaiting confirmation' else 'confirmed' end
 where interaction_kind=v_post.kind and interaction_id=p_post;
 -- Reuse the existing drama subscription to refresh the normal category card.
 update drama_posts set updated_at=now() where id=p_post;
 insert into alerts(recipient_id,actor_id,type,circle_id,payload)
 values(v_post.creator_id,auth.uid(),'SYSTEM_NOTIFICATION',v_post.circle_id,jsonb_build_object('entityId',p_post,
 'message',case when p_accept then 'Your '||v_post.kind||' was confirmed' else 'Your '||v_post.kind||' was declined' end,
 'metadata',jsonb_build_object('interactionKind',v_post.kind,'interactionId',p_post)));
end $$;
revoke all on function public.confirm_drama_participation(uuid,boolean) from public,anon;
grant execute on function public.confirm_drama_participation(uuid,boolean) to authenticated;

create function public.guard_drama_confirmation() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.resolution is distinct from old.resolution and new.resolution is not null and exists(
 select 1 from drama_confirmations where post_id=new.id and status<>'accepted') then raise exception 'All participants must confirm first'; end if;
 if exists(select 1 from drama_confirmations where post_id=new.id) and new.payload is distinct from old.payload then raise exception 'Agreed terms cannot change'; end if;
 return new;
end $$;
create trigger guard_drama_confirmation before update on public.drama_posts for each row execute function public.guard_drama_confirmation();
commit;
