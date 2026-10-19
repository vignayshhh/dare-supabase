begin;
create or replace function public.get_circle_event_conversation(p_event uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_event circle_events; v_id uuid;
begin
 select * into v_event from circle_events where id=p_event for update;
 if not found or not public.has_circle_access(v_event.circle_id) then raise exception 'Event unavailable'; end if;
 select id into v_id from conversations where event_id=p_event and kind='GROUP' limit 1;
 if v_id is null then
   insert into conversations(kind,title,circle_id,event_id) values('GROUP',v_event.name,v_event.circle_id,p_event) returning id into v_id;
 end if;
 insert into conversation_members(conversation_id,user_id) values(v_id,auth.uid()) on conflict do nothing;
 return v_id;
end $$;
revoke all on function public.get_circle_event_conversation(uuid) from public,anon;
grant execute on function public.get_circle_event_conversation(uuid) to authenticated;
commit;
