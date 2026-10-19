-- Complete core backfill for relationship and child collections omitted from
-- first cutover. Every delete is guarded by a corresponding relational row.

alter table public.friendships add column if not exists legacy_document_id text;
alter table public.friendships add column if not exists legacy_payload jsonb not null default '{}'::jsonb;
create unique index if not exists friendships_legacy_document_id on public.friendships(legacy_document_id) where legacy_document_id is not null;

update public.profiles p set
  username=case when coalesce(d.data->>'username','') ~ '^[a-z0-9_]{3,30}$' then d.data->>'username' else p.username end,
  display_name=coalesce(d.data->>'display_name',p.display_name),
  avatar_url=coalesce(d.data->>'avatar_url',d.data->>'avatar',p.avatar_url),
  bio=left(coalesce(d.data->>'bio',p.bio),500),
  legacy_payload=d.data
from public.data_documents d
where d.collection='users' and (p.id=public.try_uuid(d.document_id) or p.id=public.try_uuid(d.data->>'user_id'));
delete from public.data_documents d where d.collection='users' and exists(select 1 from public.profiles p where p.id=public.try_uuid(d.document_id) or p.id=public.try_uuid(d.data->>'user_id'));

insert into public.friendships(id,requester_id,addressee_id,status,created_at,updated_at,legacy_document_id,legacy_payload)
select coalesce(public.try_uuid(d.document_id),gen_random_uuid()),public.try_uuid(d.data->>'requester_id'),public.try_uuid(d.data->>'addressee_id'),
       case lower(coalesce(d.data->>'status','pending')) when 'accepted' then 'ACCEPTED' when 'declined' then 'DECLINED' when 'rejected' then 'DECLINED' when 'blocked' then 'BLOCKED' else 'PENDING' end,
       coalesce(nullif(d.data->>'created_at','')::timestamptz,d.updated_at),coalesce(nullif(d.data->>'updated_at','')::timestamptz,d.updated_at),d.document_id,d.data
from public.data_documents d
join public.profiles a on a.id=public.try_uuid(d.data->>'requester_id')
join public.profiles b on b.id=public.try_uuid(d.data->>'addressee_id')
where d.collection='friendships'
on conflict((least(requester_id,addressee_id)),(greatest(requester_id,addressee_id))) do update set status=excluded.status,legacy_document_id=excluded.legacy_document_id,legacy_payload=excluded.legacy_payload,updated_at=excluded.updated_at;
delete from public.data_documents d where d.collection='friendships' and exists(select 1 from public.friendships f where f.legacy_document_id=d.document_id);

insert into public.post_reactions(post_id,user_id,reaction,taps,created_at,updated_at)
select public.try_uuid(d.data->>'post_id'),public.try_uuid(d.data->>'user_id'),coalesce(d.data->>'reaction','LIKE'),greatest(1,coalesce((d.data->>'taps')::integer,1)),coalesce(nullif(d.data->>'created_at','')::timestamptz,d.updated_at),d.updated_at
from public.data_documents d join public.posts p on p.id=public.try_uuid(d.data->>'post_id') join public.profiles u on u.id=public.try_uuid(d.data->>'user_id') where d.collection='post_likes'
on conflict(post_id,user_id,reaction) do update set taps=excluded.taps,updated_at=excluded.updated_at;
delete from public.data_documents d where d.collection='post_likes' and exists(select 1 from public.post_reactions r where r.post_id=public.try_uuid(d.data->>'post_id') and r.user_id=public.try_uuid(d.data->>'user_id'));

insert into public.post_comments(id,post_id,author_id,parent_id,body,reaction_count,created_at,updated_at,legacy_payload)
select public.try_uuid(d.document_id),public.try_uuid(d.data->>'post_id'),coalesce(public.try_uuid(d.data->>'author_id'),public.try_uuid(d.data->>'user_id')),public.try_uuid(d.data->>'parent_id'),coalesce(d.data->>'content',''),greatest(0,coalesce((d.data->>'likes_count')::integer,0)),coalesce(nullif(d.data->>'created_at','')::timestamptz,d.updated_at),d.updated_at,d.data
from public.data_documents d join public.posts p on p.id=public.try_uuid(d.data->>'post_id') join public.profiles u on u.id=coalesce(public.try_uuid(d.data->>'author_id'),public.try_uuid(d.data->>'user_id')) where d.collection='post_comments' and public.try_uuid(d.document_id) is not null
on conflict(id) do update set legacy_payload=excluded.legacy_payload;
delete from public.data_documents d where d.collection='post_comments' and exists(select 1 from public.post_comments c where c.id=public.try_uuid(d.document_id));

insert into public.story_views(story_id,viewer_id,viewed_at)
select public.try_uuid(d.data->>'storyId'),public.try_uuid(d.data->>'userId'),coalesce(nullif(d.data->>'lastViewedAt','')::timestamptz,d.updated_at)
from public.data_documents d join public.stories s on s.id=public.try_uuid(d.data->>'storyId') join public.profiles p on p.id=public.try_uuid(d.data->>'userId') where d.collection='story_views'
on conflict(story_id,viewer_id) do update set viewed_at=excluded.viewed_at;
delete from public.data_documents d where d.collection in ('story_views','story_view_stats') and (d.collection='story_view_stats' or exists(select 1 from public.story_views v where v.story_id=public.try_uuid(d.data->>'storyId') and v.viewer_id=public.try_uuid(d.data->>'userId')));

insert into public.story_reactions(story_id,user_id,reaction,created_at)
select public.try_uuid(d.data->>'storyId'),public.try_uuid(d.data->>'userId'),coalesce(d.data->>'type','like'),coalesce(nullif(d.data->>'createdAt','')::timestamptz,d.updated_at)
from public.data_documents d join public.stories s on s.id=public.try_uuid(d.data->>'storyId') join public.profiles p on p.id=public.try_uuid(d.data->>'userId') where d.collection='story_reactions'
on conflict(story_id,user_id) do update set reaction=excluded.reaction,created_at=excluded.created_at;
delete from public.data_documents d where d.collection in ('story_reactions','story_reaction_stats') and (d.collection='story_reaction_stats' or exists(select 1 from public.story_reactions r where r.story_id=public.try_uuid(d.data->>'storyId') and r.user_id=public.try_uuid(d.data->>'userId')));

-- Add friendships plus computed story-reaction stats to relational response map.
create or replace view public.app_documents with (security_invoker=true) as
select 'users'::text collection,p.id::text document_id,p.legacy_payload || jsonb_build_object('user_id',p.id,'id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'bio',p.bio,'visibility',p.visibility,'current_aura',p.current_aura,'lifetime_aura',p.lifetime_aura,'has_completed_profile_creation',p.has_completed_profile_creation,'is_18_plus',p.is_18_plus,'consent_accepted',p.consent_accepted,'is_online',p.is_online,'last_active_at',p.last_active_at,'created_at',p.created_at,'updated_at',p.updated_at) data,p.updated_at from public.profiles p
union all select 'friendships',coalesce(f.legacy_document_id,f.id::text),f.legacy_payload || jsonb_build_object('requester_id',f.requester_id,'addressee_id',f.addressee_id,'status',lower(f.status),'created_at',f.created_at,'updated_at',f.updated_at),f.updated_at from public.friendships f
union all select 'posts',p.id::text,p.legacy_payload || jsonb_build_object('author_id',p.author_id,'content',p.body,'visibility',p.visibility,'media_url',p.metadata->'media_url','media_urls',p.metadata->'media_urls','media_type',p.metadata->'media_type','view_count',p.view_count,'likes_count',p.reaction_count,'comments_count',p.comment_count,'created_at',p.created_at,'updated_at',p.updated_at),p.updated_at from public.posts p
union all select 'post_likes',r.post_id::text||'_'||r.user_id::text,jsonb_build_object('post_id',r.post_id,'user_id',r.user_id,'reaction',r.reaction,'taps',r.taps,'created_at',r.created_at,'updated_at',r.updated_at),r.updated_at from public.post_reactions r
union all select 'post_comments',c.id::text,c.legacy_payload || jsonb_build_object('post_id',c.post_id,'user_id',c.author_id,'author_id',c.author_id,'parent_id',c.parent_id,'content',c.body,'likes_count',c.reaction_count,'created_at',c.created_at,'updated_at',c.updated_at),c.updated_at from public.post_comments c
union all select 'stories',s.id::text,s.legacy_payload || jsonb_build_object('userId',s.author_id,'user_id',s.author_id,'mediaUrl',coalesce(s.legacy_payload->>'mediaUrl',s.media_path),'mediaType',coalesce(s.legacy_payload->>'mediaType','image'),'caption',s.body,'createdAt',s.created_at,'expiresAt',s.expires_at,'viewCount',(select count(*) from public.story_views v where v.story_id=s.id)),s.created_at from public.stories s
union all select 'story_views',v.story_id::text||'_'||v.viewer_id::text,jsonb_build_object('storyId',v.story_id,'storyOwnerId',s.author_id,'userId',v.viewer_id,'viewCount',1,'firstViewedAt',v.viewed_at,'lastViewedAt',v.viewed_at),v.viewed_at from public.story_views v join public.stories s on s.id=v.story_id
union all select 'story_view_stats',s.id::text,jsonb_build_object('storyId',s.id,'storyOwnerId',s.author_id,'uniqueViewCount',count(v.viewer_id),'updatedAt',max(v.viewed_at)),coalesce(max(v.viewed_at),s.created_at) from public.stories s left join public.story_views v on v.story_id=s.id group by s.id
union all select 'story_reactions',r.story_id::text||'_'||r.user_id::text,jsonb_build_object('storyId',r.story_id,'userId',r.user_id,'type',r.reaction,'createdAt',r.created_at),r.created_at from public.story_reactions r
union all select 'story_reaction_stats',s.id::text,jsonb_build_object('storyId',s.id,'likeCount',count(r.*) filter(where r.reaction='like'),'hateCount',count(r.*) filter(where r.reaction='hate')),coalesce(max(r.created_at),s.created_at) from public.stories s left join public.story_reactions r on r.story_id=s.id group by s.id
union all select 'conversations',c.id::text,c.legacy_payload || jsonb_build_object('participant_ids',(select coalesce(jsonb_agg(m.user_id),'[]'::jsonb) from public.conversation_members m where m.conversation_id=c.id),'last_message_at',c.last_message_at,'created_at',c.created_at,'updated_at',c.updated_at),c.updated_at from public.conversations c
union all select 'user_chat_inbox/'||m.user_id::text||'/threads',m.conversation_id::text,m.inbox_payload || jsonb_build_object('conversation_id',m.conversation_id,'user_id',m.user_id,'last_read_at',m.last_read_at),coalesce(c.updated_at,m.joined_at) from public.conversation_members m join public.conversations c on c.id=m.conversation_id
union all select 'messages',m.id::text,m.legacy_payload || jsonb_build_object('conversation_id',m.conversation_id,'sender_id',m.sender_id,'content',m.body,'body',m.body,'media_url',m.media_path,'reply_to_id',m.reply_to_id,'created_at',m.created_at,'updated_at',m.updated_at),m.updated_at from public.messages m where m.deleted_at is null
union all select 'message_events',e.id::text,e.payload || jsonb_build_object('conversation_id',e.conversation_id,'message_id',e.message_id,'user_id',e.actor_id,'event_type',e.event_type,'created_at',e.created_at),e.created_at from public.message_events e
union all select 'alerts',a.id::text,a.legacy_payload || jsonb_build_object('userId',a.recipient_id,'recipient_id',a.recipient_id,'actorId',a.actor_id,'actor_id',a.actor_id,'type',a.type,'metadata',a.payload,'isRead',a.read_at is not null,'createdAt',a.created_at,'updatedAt',coalesce(a.read_at,a.created_at)),coalesce(a.read_at,a.created_at) from public.alerts a
union all select 'feed_events',e.id::text,e.payload || jsonb_build_object('user_id',e.actor_id,'event_type',e.event_type,'related_post_id',e.related_post_id,'related_dare_id',e.related_dare_id,'created_at',e.created_at),e.created_at from public.feed_events e
union all select d.collection,d.document_id,d.data,d.updated_at from public.data_documents d where d.collection not in ('users','friendships','posts','post_likes','post_comments','stories','story_views','story_view_stats','story_reactions','story_reaction_stats','conversations','messages','message_events','alerts','feed_events') and d.collection not like 'user_chat_inbox/%/threads';
grant select on public.app_documents to authenticated,service_role;

