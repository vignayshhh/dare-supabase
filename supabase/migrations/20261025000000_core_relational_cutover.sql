-- Move active feed, story, inbox/message, and alert records out of the
-- transitional data_documents table.  app_documents is a read-only response
-- mapping used while UI service contracts are converted; dedicated tables are
-- authoritative.

alter table public.profiles add column if not exists legacy_payload jsonb not null default '{}'::jsonb;
alter table public.posts add column if not exists view_count integer not null default 0 check (view_count >= 0);
alter table public.posts add column if not exists legacy_payload jsonb not null default '{}'::jsonb;
alter table public.post_comments add column if not exists legacy_payload jsonb not null default '{}'::jsonb;
alter table public.stories add column if not exists legacy_payload jsonb not null default '{}'::jsonb;
alter table public.conversations add column if not exists legacy_payload jsonb not null default '{}'::jsonb;
alter table public.conversation_members add column if not exists inbox_payload jsonb not null default '{}'::jsonb;
alter table public.messages add column if not exists legacy_payload jsonb not null default '{}'::jsonb;
alter table public.alerts add column if not exists legacy_payload jsonb not null default '{}'::jsonb;
create unique index if not exists story_reactions_one_per_user on public.story_reactions(story_id,user_id);

create table if not exists public.feed_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  related_post_id uuid references public.posts(id) on delete cascade,
  related_dare_id uuid references public.dares(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists feed_events_actor_created on public.feed_events(actor_id, created_at desc, id desc);

create table if not exists public.message_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists message_events_conversation_created on public.message_events(conversation_id, created_at desc, id desc);

alter table public.feed_events enable row level security;
alter table public.message_events enable row level security;

drop policy if exists feed_events_read on public.feed_events;
create policy feed_events_read on public.feed_events for select to authenticated
using (actor_id = auth.uid() or public.are_friends(actor_id, auth.uid()));
drop policy if exists feed_events_insert on public.feed_events;
create policy feed_events_insert on public.feed_events for insert to authenticated
with check (actor_id = auth.uid());

drop policy if exists message_events_members on public.message_events;
create policy message_events_members on public.message_events for select to authenticated
using (public.is_conversation_member(conversation_id));
drop policy if exists message_events_insert on public.message_events;
create policy message_events_insert on public.message_events for insert to authenticated
with check (actor_id = auth.uid() and public.is_conversation_member(conversation_id));

drop policy if exists alerts_actor_insert on public.alerts;
create policy alerts_actor_insert on public.alerts for insert to authenticated
with check (actor_id = auth.uid() and recipient_id <> auth.uid());

-- One safe UUID parser for fresh data plus any early non-UUID compatibility IDs.
create or replace function public.try_uuid(p_value text)
returns uuid language plpgsql immutable strict set search_path = public as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- Backfill only rows whose relational parents exist. Failed/unmappable rows stay
-- in data_documents and are therefore never discarded.
insert into public.posts(id, author_id, body, visibility, metadata, reaction_count, comment_count, view_count, created_at, updated_at, legacy_payload)
select public.try_uuid(d.document_id), public.try_uuid(d.data->>'author_id'), coalesce(d.data->>'content',''),
       case when upper(coalesce(d.data->>'visibility','PUBLIC')) in ('PUBLIC','FRIENDS','PRIVATE') then upper(coalesce(d.data->>'visibility','PUBLIC')) else 'PUBLIC' end,
       jsonb_build_object('media_url',d.data->'media_url','media_urls',d.data->'media_urls','media_type',d.data->'media_type'),
       greatest(0,coalesce((d.data->>'likes_count')::integer,0)), greatest(0,coalesce((d.data->>'comments_count')::integer,0)),
       greatest(0,coalesce((d.data->>'view_count')::integer,0)),
       coalesce((d.data->>'created_at')::timestamptz,d.updated_at), coalesce((d.data->>'updated_at')::timestamptz,d.updated_at), d.data
from public.data_documents d join public.profiles p on p.id=public.try_uuid(d.data->>'author_id')
where d.collection='posts' and public.try_uuid(d.document_id) is not null
on conflict(id) do update set legacy_payload=excluded.legacy_payload;

insert into public.stories(id,author_id,body,media_bucket,media_path,visibility,expires_at,created_at,legacy_payload)
select public.try_uuid(d.document_id),public.try_uuid(coalesce(d.data->>'userId',d.data->>'user_id')),
       coalesce(d.data->>'caption',''),null,coalesce(d.data->>'mediaUrl',d.data->>'media_url'),
       case when upper(coalesce(d.data->>'visibility','FRIENDS')) in ('PUBLIC','FRIENDS','PRIVATE') then upper(coalesce(d.data->>'visibility','FRIENDS')) else 'FRIENDS' end,
       coalesce((coalesce(d.data->>'expiresAt',d.data->>'expires_at'))::timestamptz,timezone('utc',now())+interval '24 hours'),
       coalesce((coalesce(d.data->>'createdAt',d.data->>'created_at'))::timestamptz,d.updated_at),d.data
from public.data_documents d join public.profiles p on p.id=public.try_uuid(coalesce(d.data->>'userId',d.data->>'user_id'))
where d.collection='stories' and public.try_uuid(d.document_id) is not null
on conflict(id) do update set legacy_payload=excluded.legacy_payload;

insert into public.conversations(id,kind,title,last_message_at,created_at,updated_at,legacy_payload)
select public.try_uuid(d.document_id),'DIRECT',null,
       nullif(coalesce(d.data->>'last_message_at',d.data->>'lastMessageAt'),'')::timestamptz,
       coalesce(nullif(d.data->>'created_at','')::timestamptz,d.updated_at),
       coalesce(nullif(d.data->>'updated_at','')::timestamptz,d.updated_at),d.data
from public.data_documents d where d.collection='conversations' and public.try_uuid(d.document_id) is not null
on conflict(id) do update set legacy_payload=excluded.legacy_payload;

insert into public.conversation_members(conversation_id,user_id,role,joined_at,inbox_payload)
select c.id,public.try_uuid(member.value),'MEMBER',c.created_at,'{}'::jsonb
from public.conversations c cross join lateral jsonb_array_elements_text(coalesce(c.legacy_payload->'participant_ids','[]'::jsonb)) member
join public.profiles p on p.id=public.try_uuid(member.value)
on conflict(conversation_id,user_id) do nothing;

insert into public.messages(id,conversation_id,sender_id,body,media_path,created_at,updated_at,legacy_payload)
select public.try_uuid(d.document_id),public.try_uuid(d.data->>'conversation_id'),public.try_uuid(d.data->>'sender_id'),
       coalesce(d.data->>'content',d.data->>'body',''),coalesce(d.data->>'media_url',d.data->>'media_path'),
       coalesce(nullif(d.data->>'created_at','')::timestamptz,d.updated_at),coalesce(nullif(d.data->>'updated_at','')::timestamptz,d.updated_at),d.data
from public.data_documents d
join public.conversations c on c.id=public.try_uuid(d.data->>'conversation_id')
join public.profiles p on p.id=public.try_uuid(d.data->>'sender_id')
where d.collection='messages' and public.try_uuid(d.document_id) is not null
on conflict(id) do update set legacy_payload=excluded.legacy_payload;

insert into public.alerts(id,recipient_id,actor_id,type,payload,read_at,created_at,legacy_payload)
select public.try_uuid(d.document_id),public.try_uuid(coalesce(d.data->>'userId',d.data->>'recipient_id')),
       public.try_uuid(coalesce(d.data->>'actorId',d.data->>'actor_id')),coalesce(d.data->>'type','SYSTEM_NOTIFICATION'),
       coalesce(d.data->'metadata','{}'::jsonb),case when coalesce((d.data->>'isRead')::boolean,false) then coalesce(nullif(d.data->>'updatedAt','')::timestamptz,d.updated_at) end,
       coalesce(nullif(coalesce(d.data->>'createdAt',d.data->>'created_at'),'')::timestamptz,d.updated_at),d.data
from public.data_documents d join public.profiles p on p.id=public.try_uuid(coalesce(d.data->>'userId',d.data->>'recipient_id'))
where d.collection='alerts' and public.try_uuid(d.document_id) is not null
on conflict(id) do update set legacy_payload=excluded.legacy_payload;

-- Remove only successfully materialized core rows.
delete from public.data_documents d where d.collection='posts' and exists(select 1 from public.posts x where x.id=public.try_uuid(d.document_id));
delete from public.data_documents d where d.collection='stories' and exists(select 1 from public.stories x where x.id=public.try_uuid(d.document_id));
delete from public.data_documents d where d.collection='conversations' and exists(select 1 from public.conversations x where x.id=public.try_uuid(d.document_id));
delete from public.data_documents d where d.collection='messages' and exists(select 1 from public.messages x where x.id=public.try_uuid(d.document_id));
delete from public.data_documents d where d.collection='alerts' and exists(select 1 from public.alerts x where x.id=public.try_uuid(d.document_id));

create or replace view public.app_documents with (security_invoker=true) as
select 'users'::text collection,p.id::text document_id,
       p.legacy_payload || jsonb_build_object('user_id',p.id,'id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'bio',p.bio,'visibility',p.visibility,'current_aura',p.current_aura,'lifetime_aura',p.lifetime_aura,'has_completed_profile_creation',p.has_completed_profile_creation,'is_18_plus',p.is_18_plus,'consent_accepted',p.consent_accepted,'is_online',p.is_online,'last_active_at',p.last_active_at,'created_at',p.created_at,'updated_at',p.updated_at) data,p.updated_at
from public.profiles p
union all
select 'posts',p.id::text,p.legacy_payload || jsonb_build_object('author_id',p.author_id,'content',p.body,'visibility',p.visibility,'media_url',p.metadata->'media_url','media_urls',p.metadata->'media_urls','media_type',p.metadata->'media_type','view_count',p.view_count,'likes_count',p.reaction_count,'comments_count',p.comment_count,'created_at',p.created_at,'updated_at',p.updated_at),p.updated_at from public.posts p
union all
select 'post_likes',r.post_id::text||'_'||r.user_id::text,jsonb_build_object('post_id',r.post_id,'user_id',r.user_id,'reaction',r.reaction,'taps',r.taps,'created_at',r.created_at,'updated_at',r.updated_at),r.updated_at from public.post_reactions r
union all
select 'post_comments',c.id::text,c.legacy_payload || jsonb_build_object('post_id',c.post_id,'user_id',c.author_id,'author_id',c.author_id,'parent_id',c.parent_id,'content',c.body,'likes_count',c.reaction_count,'created_at',c.created_at,'updated_at',c.updated_at),c.updated_at from public.post_comments c
union all
select 'stories',s.id::text,s.legacy_payload || jsonb_build_object('userId',s.author_id,'user_id',s.author_id,'mediaUrl',coalesce(s.legacy_payload->>'mediaUrl',s.media_path),'mediaType',coalesce(s.legacy_payload->>'mediaType','image'),'caption',s.body,'createdAt',s.created_at,'expiresAt',s.expires_at,'viewCount',(select count(*) from public.story_views v where v.story_id=s.id)),s.created_at from public.stories s
union all
select 'story_views',v.story_id::text||'_'||v.viewer_id::text,jsonb_build_object('storyId',v.story_id,'storyOwnerId',s.author_id,'userId',v.viewer_id,'viewCount',1,'firstViewedAt',v.viewed_at,'lastViewedAt',v.viewed_at),v.viewed_at from public.story_views v join public.stories s on s.id=v.story_id
union all
select 'story_view_stats',s.id::text,jsonb_build_object('storyId',s.id,'storyOwnerId',s.author_id,'uniqueViewCount',count(v.viewer_id),'updatedAt',max(v.viewed_at)),coalesce(max(v.viewed_at),s.created_at) from public.stories s left join public.story_views v on v.story_id=s.id group by s.id
union all
select 'story_reactions',r.story_id::text||'_'||r.user_id::text,jsonb_build_object('storyId',r.story_id,'userId',r.user_id,'type',r.reaction,'createdAt',r.created_at),r.created_at from public.story_reactions r
union all
select 'conversations',c.id::text,c.legacy_payload || jsonb_build_object('participant_ids',(select coalesce(jsonb_agg(m.user_id),'[]'::jsonb) from public.conversation_members m where m.conversation_id=c.id),'last_message_at',c.last_message_at,'created_at',c.created_at,'updated_at',c.updated_at),c.updated_at from public.conversations c
union all
select 'user_chat_inbox/'||m.user_id::text||'/threads',m.conversation_id::text,m.inbox_payload || jsonb_build_object('conversation_id',m.conversation_id,'user_id',m.user_id,'last_read_at',m.last_read_at),coalesce(c.updated_at,m.joined_at) from public.conversation_members m join public.conversations c on c.id=m.conversation_id
union all
select 'messages',m.id::text,m.legacy_payload || jsonb_build_object('conversation_id',m.conversation_id,'sender_id',m.sender_id,'content',m.body,'body',m.body,'media_url',m.media_path,'reply_to_id',m.reply_to_id,'created_at',m.created_at,'updated_at',m.updated_at),m.updated_at from public.messages m where m.deleted_at is null
union all
select 'message_events',e.id::text,e.payload || jsonb_build_object('conversation_id',e.conversation_id,'message_id',e.message_id,'user_id',e.actor_id,'event_type',e.event_type,'created_at',e.created_at),e.created_at from public.message_events e
union all
select 'alerts',a.id::text,a.legacy_payload || jsonb_build_object('userId',a.recipient_id,'recipient_id',a.recipient_id,'actorId',a.actor_id,'actor_id',a.actor_id,'type',a.type,'metadata',a.payload,'isRead',a.read_at is not null,'createdAt',a.created_at,'updatedAt',coalesce(a.read_at,a.created_at)),coalesce(a.read_at,a.created_at) from public.alerts a
union all
select 'feed_events',e.id::text,e.payload || jsonb_build_object('user_id',e.actor_id,'event_type',e.event_type,'related_post_id',e.related_post_id,'related_dare_id',e.related_dare_id,'created_at',e.created_at),e.created_at from public.feed_events e
union all
select d.collection,d.document_id,d.data,d.updated_at from public.data_documents d
where d.collection not in ('users','posts','post_likes','post_comments','stories','story_views','story_view_stats','story_reactions','conversations','messages','message_events','alerts','feed_events')
  and d.collection not like 'user_chat_inbox/%/threads';

grant select on public.app_documents to authenticated,service_role;

create or replace function public.write_core_document(p_collection text,p_document_id text,p_data jsonb,p_mode text default 'set')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_id uuid:=public.try_uuid(p_document_id); v_actor uuid; v_conversation uuid; v_existing jsonb; v_data jsonb:=coalesce(p_data,'{}'::jsonb); v_now timestamptz:=timezone('utc',now()); v_parts text[];
begin
  if v_id is null and p_collection not like 'user_chat_inbox/%/threads' and p_collection not in ('post_likes','story_views','story_reactions') then raise exception 'invalid_document_id'; end if;
  if p_mode in ('merge','update') then select data into v_existing from public.app_documents where collection=p_collection and document_id=p_document_id; if p_mode='update' and v_existing is null then raise exception 'document_not_found'; end if; v_data:=coalesce(v_existing,'{}'::jsonb)||v_data; end if;
  if p_mode='create' and exists(select 1 from public.app_documents where collection=p_collection and document_id=p_document_id) then raise exception 'document_exists'; end if;

  if p_collection='users' then
    update public.profiles set username=coalesce(v_data->>'username',username),display_name=coalesce(v_data->>'display_name',display_name),avatar_url=coalesce(v_data->>'avatar_url',avatar_url),bio=coalesce(v_data->>'bio',bio),legacy_payload=v_data where id=v_id;
  elsif p_collection='posts' then
    v_actor=public.try_uuid(v_data->>'author_id');
    insert into public.posts(id,author_id,body,visibility,metadata,view_count,created_at,updated_at,legacy_payload) values(v_id,v_actor,coalesce(v_data->>'content',''),case when upper(coalesce(v_data->>'visibility','PUBLIC')) in ('PUBLIC','FRIENDS','PRIVATE') then upper(coalesce(v_data->>'visibility','PUBLIC')) else 'PUBLIC' end,jsonb_build_object('media_url',v_data->'media_url','media_urls',v_data->'media_urls','media_type',v_data->'media_type'),greatest(0,coalesce((v_data->>'view_count')::integer,0)),coalesce(nullif(v_data->>'created_at','')::timestamptz,v_now),coalesce(nullif(v_data->>'updated_at','')::timestamptz,v_now),v_data) on conflict(id) do update set body=excluded.body,visibility=excluded.visibility,metadata=excluded.metadata,view_count=excluded.view_count,updated_at=v_now,legacy_payload=excluded.legacy_payload;
  elsif p_collection='post_comments' then
    insert into public.post_comments(id,post_id,author_id,parent_id,body,created_at,updated_at,legacy_payload) values(v_id,public.try_uuid(v_data->>'post_id'),coalesce(public.try_uuid(v_data->>'author_id'),public.try_uuid(v_data->>'user_id')),public.try_uuid(v_data->>'parent_id'),coalesce(v_data->>'content',''),coalesce(nullif(v_data->>'created_at','')::timestamptz,v_now),v_now,v_data) on conflict(id) do update set body=excluded.body,updated_at=v_now,legacy_payload=excluded.legacy_payload;
  elsif p_collection='post_likes' then
    insert into public.post_reactions(post_id,user_id,reaction,taps) values(public.try_uuid(v_data->>'post_id'),public.try_uuid(v_data->>'user_id'),coalesce(v_data->>'reaction','LIKE'),greatest(1,coalesce((v_data->>'taps')::integer,1))) on conflict(post_id,user_id,reaction) do update set taps=excluded.taps,updated_at=v_now;
  elsif p_collection='stories' then
    v_actor=coalesce(public.try_uuid(v_data->>'userId'),public.try_uuid(v_data->>'user_id'));
    insert into public.stories(id,author_id,body,media_path,visibility,expires_at,created_at,legacy_payload) values(v_id,v_actor,coalesce(v_data->>'caption',''),coalesce(v_data->>'mediaUrl',v_data->>'media_url'),case when upper(coalesce(v_data->>'visibility','FRIENDS')) in ('PUBLIC','FRIENDS','PRIVATE') then upper(coalesce(v_data->>'visibility','FRIENDS')) else 'FRIENDS' end,coalesce(nullif(coalesce(v_data->>'expiresAt',v_data->>'expires_at'),'')::timestamptz,v_now+interval '24 hours'),coalesce(nullif(coalesce(v_data->>'createdAt',v_data->>'created_at'),'')::timestamptz,v_now),v_data) on conflict(id) do update set body=excluded.body,media_path=excluded.media_path,visibility=excluded.visibility,expires_at=excluded.expires_at,legacy_payload=excluded.legacy_payload;
  elsif p_collection='story_views' then
    insert into public.story_views(story_id,viewer_id,viewed_at) values(public.try_uuid(v_data->>'storyId'),public.try_uuid(v_data->>'userId'),coalesce(nullif(v_data->>'lastViewedAt','')::timestamptz,v_now)) on conflict(story_id,viewer_id) do update set viewed_at=excluded.viewed_at;
  elsif p_collection='story_reactions' then
    insert into public.story_reactions(story_id,user_id,reaction,created_at) values(public.try_uuid(v_data->>'storyId'),public.try_uuid(v_data->>'userId'),coalesce(v_data->>'type',v_data->>'reaction','like'),coalesce(nullif(v_data->>'createdAt','')::timestamptz,v_now)) on conflict(story_id,user_id) do update set reaction=excluded.reaction,created_at=excluded.created_at;
  elsif p_collection='conversations' then
    insert into public.conversations(id,last_message_at,created_at,updated_at,legacy_payload) values(v_id,nullif(coalesce(v_data->>'last_message_at',v_data->>'lastMessageAt'),'')::timestamptz,coalesce(nullif(v_data->>'created_at','')::timestamptz,v_now),v_now,v_data) on conflict(id) do update set last_message_at=excluded.last_message_at,updated_at=v_now,legacy_payload=excluded.legacy_payload;
    insert into public.conversation_members(conversation_id,user_id)
    select v_id,user_id from (
      select public.try_uuid(value) user_id from jsonb_array_elements_text(coalesce(v_data->'participant_ids','[]'::jsonb))
      union select public.try_uuid(v_data->>'user1_id')
      union select public.try_uuid(v_data->>'user2_id')
    ) members where user_id is not null on conflict do nothing;
  elsif p_collection like 'user_chat_inbox/%/threads' then
    v_parts:=string_to_array(p_collection,'/'); v_actor:=public.try_uuid(v_parts[2]); v_conversation:=v_id;
    insert into public.conversation_members(conversation_id,user_id,inbox_payload,last_read_at) values(v_conversation,v_actor,v_data,nullif(v_data->>'last_read_at','')::timestamptz) on conflict(conversation_id,user_id) do update set inbox_payload=excluded.inbox_payload,last_read_at=coalesce(excluded.last_read_at,public.conversation_members.last_read_at);
  elsif p_collection='messages' then
    insert into public.messages(id,conversation_id,sender_id,body,media_path,reply_to_id,created_at,updated_at,legacy_payload) values(v_id,public.try_uuid(v_data->>'conversation_id'),public.try_uuid(v_data->>'sender_id'),coalesce(v_data->>'content',v_data->>'body',''),coalesce(v_data->>'media_url',v_data->>'media_path'),public.try_uuid(v_data->>'reply_to_id'),coalesce(nullif(v_data->>'created_at','')::timestamptz,v_now),v_now,v_data) on conflict(id) do update set body=excluded.body,media_path=excluded.media_path,deleted_at=null,updated_at=v_now,legacy_payload=excluded.legacy_payload;
  elsif p_collection='message_events' then
    insert into public.message_events(id,conversation_id,message_id,actor_id,event_type,payload,created_at) values(v_id,public.try_uuid(v_data->>'conversation_id'),public.try_uuid(v_data->>'message_id'),coalesce(public.try_uuid(v_data->>'user_id'),auth.uid()),coalesce(v_data->>'event_type','UNKNOWN'),v_data,coalesce(nullif(v_data->>'created_at','')::timestamptz,v_now)) on conflict(id) do update set payload=excluded.payload;
  elsif p_collection='alerts' then
    insert into public.alerts(id,recipient_id,actor_id,type,payload,read_at,created_at,legacy_payload) values(v_id,coalesce(public.try_uuid(v_data->>'userId'),public.try_uuid(v_data->>'recipient_id')),coalesce(public.try_uuid(v_data->>'actorId'),public.try_uuid(v_data->>'actor_id')),coalesce(v_data->>'type','SYSTEM_NOTIFICATION'),coalesce(v_data->'metadata','{}'::jsonb),case when coalesce((v_data->>'isRead')::boolean,false) then v_now end,coalesce(nullif(coalesce(v_data->>'createdAt',v_data->>'created_at'),'')::timestamptz,v_now),v_data) on conflict(id) do update set payload=excluded.payload,read_at=excluded.read_at,legacy_payload=excluded.legacy_payload;
  elsif p_collection='feed_events' then
    insert into public.feed_events(id,actor_id,event_type,related_post_id,related_dare_id,payload,created_at) values(v_id,public.try_uuid(v_data->>'user_id'),coalesce(v_data->>'event_type','UNKNOWN'),public.try_uuid(v_data->>'related_post_id'),public.try_uuid(v_data->>'related_dare_id'),v_data,coalesce(nullif(v_data->>'created_at','')::timestamptz,v_now)) on conflict(id) do update set payload=excluded.payload;
  else raise exception 'unsupported_core_collection';
  end if;
  select data into v_data from public.app_documents where collection=p_collection and document_id=p_document_id;
  return v_data;
end;
$$;

create or replace function public.delete_core_document(p_collection text,p_document_id text)
returns void language plpgsql security invoker set search_path=public as $$
declare v_id uuid:=public.try_uuid(p_document_id); v_parts text[];
begin
  if p_collection='posts' then delete from public.posts where id=v_id;
  elsif p_collection='post_likes' then delete from public.post_reactions where post_id=public.try_uuid(split_part(p_document_id,'_',1)) and user_id=public.try_uuid(split_part(p_document_id,'_',2));
  elsif p_collection='post_comments' then delete from public.post_comments where id=v_id;
  elsif p_collection='stories' then delete from public.stories where id=v_id;
  elsif p_collection='story_views' then delete from public.story_views where story_id=public.try_uuid(split_part(p_document_id,'_',1)) and viewer_id=public.try_uuid(split_part(p_document_id,'_',2));
  elsif p_collection='story_reactions' then delete from public.story_reactions where story_id=public.try_uuid(split_part(p_document_id,'_',1)) and user_id=public.try_uuid(split_part(p_document_id,'_',2));
  elsif p_collection='conversations' then delete from public.conversations where id=v_id;
  elsif p_collection='messages' then delete from public.messages where id=v_id;
  elsif p_collection='message_events' then delete from public.message_events where id=v_id;
  elsif p_collection='alerts' then delete from public.alerts where id=v_id;
  elsif p_collection='feed_events' then delete from public.feed_events where id=v_id;
  elsif p_collection like 'user_chat_inbox/%/threads' then v_parts:=string_to_array(p_collection,'/'); delete from public.conversation_members where conversation_id=v_id and user_id=public.try_uuid(v_parts[2]);
  else raise exception 'unsupported_core_collection'; end if;
end;
$$;

revoke all on function public.try_uuid(text) from public;
revoke all on function public.write_core_document(text,text,jsonb,text) from public;
revoke all on function public.delete_core_document(text,text) from public;
grant execute on function public.try_uuid(text) to authenticated,service_role;
grant execute on function public.write_core_document(text,text,jsonb,text) to authenticated,service_role;
grant execute on function public.delete_core_document(text,text) to authenticated,service_role;

create or replace function public.apply_app_document_batch(p_ops jsonb)
returns integer language plpgsql volatile security invoker set search_path=public as $$
declare operation jsonb; current_data jsonb; resolved jsonb; applied integer:=0; operation_kind text; collection_name text; document_key text; is_core boolean;
begin
  if jsonb_typeof(p_ops)<>'array' or jsonb_array_length(p_ops)>500 then raise exception 'invalid_batch'; end if;
  for operation in select value from jsonb_array_elements(p_ops) loop
    operation_kind:=operation->>'kind'; collection_name:=operation->>'collection'; document_key:=operation->>'id';
    is_core:=collection_name in ('users','posts','post_likes','post_comments','stories','story_views','story_view_stats','story_reactions','conversations','messages','message_events','alerts','feed_events') or collection_name like 'user_chat_inbox/%/threads';
    if document_key is null then raise exception 'invalid_batch_target'; end if;
    if is_core then
      if operation_kind='delete' then perform public.delete_core_document(collection_name,document_key);
      elsif operation_kind in ('set','update') then
        select data into current_data from public.app_documents where collection=collection_name and document_id=document_key;
        if operation_kind='update' and current_data is null then raise exception 'document_not_found'; end if;
        resolved:=public.resolve_data_document_value(coalesce(operation->'data','{}'::jsonb),case when operation_kind='set' and not coalesce((operation->>'merge')::boolean,false) then '{}'::jsonb else coalesce(current_data,'{}'::jsonb) end);
        perform public.write_core_document(collection_name,document_key,resolved,case when operation_kind='update' then 'update' when coalesce((operation->>'merge')::boolean,false) then 'merge' else 'set' end);
      else raise exception 'unsupported_batch_operation'; end if;
    else
      if not public.data_document_collection_allowed(collection_name) then raise exception 'invalid_batch_target'; end if;
      if operation_kind='delete' then delete from public.data_documents where collection=collection_name and document_id=document_key;
      elsif operation_kind in ('set','update') then
        select data into current_data from public.data_documents where collection=collection_name and document_id=document_key for update;
        if operation_kind='update' and current_data is null then raise exception 'document_not_found'; end if;
        resolved:=public.resolve_data_document_value(coalesce(operation->'data','{}'::jsonb),case when operation_kind='set' and not coalesce((operation->>'merge')::boolean,false) then '{}'::jsonb else coalesce(current_data,'{}'::jsonb) end);
        insert into public.data_documents(collection,document_id,data,updated_at) values(collection_name,document_key,resolved,timezone('utc',now())) on conflict(collection,document_id) do update set data=excluded.data,updated_at=excluded.updated_at;
      else raise exception 'unsupported_batch_operation'; end if;
    end if;
    applied:=applied+1;
  end loop;
  return applied;
end;
$$;
revoke all on function public.apply_app_document_batch(jsonb) from public;
grant execute on function public.apply_app_document_batch(jsonb) to authenticated,service_role;

create or replace function public.create_post_with_event(p_post_id uuid,p_post_data jsonb,p_event_id uuid,p_event_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_author uuid:=public.try_uuid(p_post_data->>'author_id'); v_now timestamptz:=timezone('utc',now());
begin
  if auth.role()<>'service_role' and v_author<>auth.uid() then raise exception 'forbidden'; end if;
  insert into public.posts(id,author_id,body,metadata,view_count,created_at,updated_at,legacy_payload)
  values(p_post_id,v_author,coalesce(p_post_data->>'content',''),jsonb_build_object('media_url',p_post_data->'media_url','media_urls',p_post_data->'media_urls','media_type',p_post_data->'media_type'),greatest(0,coalesce((p_post_data->>'view_count')::integer,0)),coalesce(nullif(p_post_data->>'created_at','')::timestamptz,v_now),v_now,p_post_data);
  insert into public.feed_events(id,actor_id,event_type,related_post_id,payload,created_at)
  values(p_event_id,v_author,coalesce(p_event_data->>'event_type','POST_CREATED'),p_post_id,p_event_data,v_now);
  return p_post_data||jsonb_build_object('id',p_post_id);
end;
$$;

create or replace function public.set_post_like(p_post_id uuid,p_liked boolean,p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=coalesce(auth.uid(),p_actor_id); v_exists boolean; v_count integer; v_author uuid;
begin
  if v_actor is null then raise exception 'unauthorized'; end if;
  if auth.uid() is not null and p_actor_id is not null and p_actor_id<>auth.uid() then raise exception 'forbidden'; end if;
  select author_id into v_author from public.posts where id=p_post_id for update;
  if v_author is null then raise exception 'post_not_found'; end if;
  select exists(select 1 from public.post_reactions where post_id=p_post_id and user_id=v_actor and reaction='LIKE') into v_exists;
  if p_liked and not v_exists then insert into public.post_reactions(post_id,user_id,reaction) values(p_post_id,v_actor,'LIKE');
  elsif not p_liked and v_exists then delete from public.post_reactions where post_id=p_post_id and user_id=v_actor and reaction='LIKE'; end if;
  select reaction_count into v_count from public.posts where id=p_post_id;
  return jsonb_build_object('duplicate',p_liked and v_exists,'liked',p_liked,'count',v_count,'milestone',case when p_liked and not v_exists and v_count in (10,25,50,100,250,500,1000) then v_count end);
end;
$$;

create or replace function public.create_post_comment(p_post_id uuid,p_comment_id uuid,p_content text,p_parent_id uuid default null,p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=coalesce(auth.uid(),p_actor_id); v_row public.post_comments;
begin
  if v_actor is null then raise exception 'unauthorized'; end if;
  if auth.uid() is not null and p_actor_id is not null and p_actor_id<>auth.uid() then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.posts where id=p_post_id) then raise exception 'post_not_found'; end if;
  insert into public.post_comments(id,post_id,author_id,parent_id,body,legacy_payload)
  values(p_comment_id,p_post_id,v_actor,p_parent_id,p_content,jsonb_build_object('post_id',p_post_id,'author_id',v_actor,'user_id',v_actor,'parent_id',p_parent_id,'content',p_content)) returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.record_story_view(p_story_id uuid,p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=coalesce(auth.uid(),p_actor_id); v_duplicate boolean; v_count bigint;
begin
  if v_actor is null then raise exception 'unauthorized'; end if;
  if auth.uid() is not null and p_actor_id is not null and p_actor_id<>auth.uid() then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.stories where id=p_story_id and expires_at>timezone('utc',now())) then raise exception 'story_not_found'; end if;
  select exists(select 1 from public.story_views where story_id=p_story_id and viewer_id=v_actor) into v_duplicate;
  insert into public.story_views(story_id,viewer_id,viewed_at) values(p_story_id,v_actor,timezone('utc',now())) on conflict(story_id,viewer_id) do update set viewed_at=excluded.viewed_at;
  select count(*) into v_count from public.story_views where story_id=p_story_id;
  return jsonb_build_object('duplicate',v_duplicate,'viewCount',v_count);
end;
$$;

drop function if exists public.create_legacy_post_with_event(text,jsonb,text,jsonb);
drop function if exists public.toggle_legacy_post_like(text,text,boolean);
drop function if exists public.create_legacy_post_comment(text,text,text,text,text);
drop function if exists public.record_legacy_story_view(text,text);

revoke all on function public.create_post_with_event(uuid,jsonb,uuid,jsonb) from public;
revoke all on function public.set_post_like(uuid,boolean,uuid) from public;
revoke all on function public.create_post_comment(uuid,uuid,text,uuid,uuid) from public;
revoke all on function public.record_story_view(uuid,uuid) from public;
grant execute on function public.create_post_with_event(uuid,jsonb,uuid,jsonb) to authenticated,service_role;
grant execute on function public.set_post_like(uuid,boolean,uuid) to authenticated,service_role;
grant execute on function public.create_post_comment(uuid,uuid,text,uuid,uuid) to authenticated,service_role;
grant execute on function public.record_story_view(uuid,uuid) to authenticated,service_role;

do $$ begin
  alter publication supabase_realtime add table public.feed_events;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.message_events;
exception when duplicate_object then null; end $$;
