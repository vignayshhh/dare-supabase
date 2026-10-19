begin;
alter table public.circles add column chat_epoch uuid not null default gen_random_uuid();

-- Channel authorization is cached. Rotate the topic when membership changes so
-- a removed member's already-open socket receives no future message content.
create function public.rotate_circle_chat_topic() returns trigger language plpgsql security definer set search_path=public as $$
declare v_circle uuid; v_epoch uuid;
begin
 v_circle:=case when TG_OP='DELETE' then old.circle_id else new.circle_id end;
 select chat_epoch into v_epoch from circles where id=v_circle for update;
 update circles set chat_epoch=gen_random_uuid() where id=v_circle;
 perform realtime.send('{}'::jsonb,'rotate','circle-chat:'||v_circle::text||':'||v_epoch::text,true);
 return null;
end $$;
create trigger circle_chat_membership_changed after insert or delete on public.circle_members
 for each row execute function public.rotate_circle_chat_topic();

-- A Circle already supplies membership: no copy of its member list per message.
create table public.circle_chat_messages (
 id uuid primary key default gen_random_uuid(),
 seq bigint generated always as identity unique,
 circle_id uuid not null references public.circles(id),
 author_id uuid not null references public.profiles(id),
 author_name text not null,
 body text not null check(length(body) between 1 and 2000),
 created_at timestamptz not null default now(),
 source_message_id uuid references public.circle_chat_messages(id),
 interaction_kind text check(interaction_kind in ('dare','truth','prediction','deal','promise','jail')),
 interaction_id uuid,
 status text,
 status_until timestamptz,
 unique(interaction_kind,interaction_id)
);
create index circle_chat_page on public.circle_chat_messages(circle_id,seq desc);
alter table public.circle_chat_messages enable row level security;
create policy circle_chat_read on public.circle_chat_messages for select to authenticated
 using(public.has_circle_access(circle_id));
grant select on public.circle_chat_messages to authenticated;
grant all on public.circle_chat_messages to service_role;

-- Serialize only this sender's sends; retries reuse the same client UUID.
create function public.send_circle_chat(p_id uuid,p_circle uuid,p_body text)
returns public.circle_chat_messages language plpgsql security definer set search_path=public as $$
declare v_row circle_chat_messages; v_name text;
begin
 if not public.has_circle_access(p_circle) then raise exception 'Circle unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,825));
 select * into v_row from circle_chat_messages where id=p_id;
 if found then
   if v_row.author_id<>auth.uid() or v_row.circle_id<>p_circle or v_row.body<>btrim(p_body) then raise exception 'Message ID conflict'; end if;
   return v_row;
 end if;
 if length(btrim(p_body)) not between 1 and 2000 then raise exception 'Message must contain 1–2000 characters'; end if;
 if (select count(*) from (select 1 from circle_chat_messages where author_id=auth.uid() and created_at>now()-interval '10 seconds' limit 16) s)>=15 then raise exception 'Slow down a little'; end if;
 select coalesce(nullif(display_name,''),username,'Circle member') into v_name from profiles where id=auth.uid();
 insert into circle_chat_messages(id,circle_id,author_id,author_name,body)
 values(p_id,p_circle,auth.uid(),left(v_name,80),btrim(p_body)) returning * into v_row;
 return v_row;
end $$;
create index circle_chat_sender_rate on public.circle_chat_messages(author_id,created_at desc);
revoke all on function public.send_circle_chat(uuid,uuid,text) from public,anon;
grant execute on function public.send_circle_chat(uuid,uuid,text) to authenticated;

-- One compact event; no presence, receipt, inbox or notification write per send.
create function public.broadcast_circle_chat() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='UPDATE' then
  perform realtime.send(jsonb_build_object('id',new.id,'status',new.status,'status_until',new.status_until),'status','circle-chat:'||new.circle_id::text||':'||(select chat_epoch::text from circles where id=new.circle_id),true);
 else
  perform realtime.send(to_jsonb(new),'message','circle-chat:'||new.circle_id::text||':'||(select chat_epoch::text from circles where id=new.circle_id),true);
 end if;
 return null;
end $$;
create trigger circle_chat_broadcast after insert or update on public.circle_chat_messages
 for each row execute function public.broadcast_circle_chat();
create policy circle_chat_broadcast_read on realtime.messages for select to authenticated
 using(extension='broadcast' and realtime.topic() like 'circle-chat:%'
 and exists(select 1 from public.circle_members m where m.user_id=auth.uid()
 and exists(select 1 from public.circles c where c.id=m.circle_id and c.deleted_at is null
 and 'circle-chat:'||c.id::text||':'||c.chat_epoch::text=realtime.topic())));
create policy circle_chat_broadcast_boundary on realtime.messages as restrictive for select to authenticated
 using(realtime.topic() not like 'circle-chat:%' or exists(
 select 1 from public.circles c where 'circle-chat:'||c.id::text||':'||c.chat_epoch::text=realtime.topic()
 and public.is_circle_member(c.id)));
create policy circle_chat_no_client_broadcast on realtime.messages as restrictive for insert to authenticated
 with check(realtime.topic() not like 'circle-chat:%');

-- Source is captured inside the existing create transaction. No second client
-- write, orphan card, duplicate workflow or new notification pipeline.
alter table public.dares add column source_message_id uuid references public.circle_chat_messages(id);
alter table public.truths add column source_message_id uuid references public.circle_chat_messages(id);
alter table public.drama_posts add column source_message_id uuid references public.circle_chat_messages(id);
create function public.attach_chat_source() returns trigger language plpgsql security definer set search_path=public as $$
declare v_source circle_chat_messages; v_id uuid;
begin
 if TG_OP='UPDATE' then
   if new.source_message_id is distinct from old.source_message_id then raise exception 'Message source cannot change'; end if;
   return new;
 end if;
 v_id:=nullif(nullif(current_setting('request.headers',true),'')::jsonb->>'x-chat-source-id','')::uuid;
 new.source_message_id:=coalesce(v_id,new.source_message_id);
 if new.source_message_id is null then return new; end if;
 select * into v_source from circle_chat_messages where id=new.source_message_id;
 if not found or not public.has_circle_access(v_source.circle_id) or v_source.circle_id<>new.circle_id
 or new.creator_id<>auth.uid() then raise exception 'Message unavailable in this Circle'; end if;
 return new;
end $$;
create function public.sync_chat_interaction() returns trigger language plpgsql security definer set search_path=public as $$
declare v_source circle_chat_messages; v_kind text; v_status text; v_data jsonb:=to_jsonb(new);
begin
 if new.source_message_id is null then return null; end if;
 v_kind:=case TG_TABLE_NAME when 'dares' then 'dare' when 'truths' then 'truth' else v_data->>'kind' end;
 if v_kind not in ('dare','truth','prediction','deal','promise') then return null; end if;
 v_status:=coalesce(v_data->>'workflow_state',v_data->>'status',v_data->>'resolution','open');
 if TG_OP='UPDATE' and v_status=coalesce(to_jsonb(old)->>'workflow_state',to_jsonb(old)->>'status',to_jsonb(old)->>'resolution','open') then return null; end if;
 if TG_OP='INSERT' then
   select * into v_source from circle_chat_messages where id=new.source_message_id;
   insert into circle_chat_messages(circle_id,author_id,author_name,body,source_message_id,interaction_kind,interaction_id,status,status_until)
   select new.circle_id,new.creator_id,left(coalesce(nullif(p.display_name,''),p.username,'Circle member'),80),
    left(coalesce(nullif(v_data->>'body',''),v_data->>'question',v_data->'payload'->>'text',v_data->'payload'->>'event',v_data->'payload'->>'promise',v_source.body),240),
    new.source_message_id,v_kind,new.id,v_status,
    coalesce(v_data->'payload'->>'deadline',v_data->'payload'->>'resolutionDate',v_data->'payload'->>'dueAt',v_data->>'expires_at')::timestamptz from profiles p where p.id=new.creator_id;
 else
   update circle_chat_messages set status=v_status where interaction_kind=v_kind and interaction_id=new.id and status is distinct from v_status;
 end if;
 return null;
end $$;
do $$ declare t text; begin
 foreach t in array array['dares','truths','drama_posts'] loop
  execute format('create trigger zz_attach_chat_source before insert or update on public.%I for each row execute function public.attach_chat_source()',t);
  execute format('create trigger sync_chat_interaction after insert or update on public.%I for each row execute function public.sync_chat_interaction()',t);
 end loop;
end $$;
commit;
