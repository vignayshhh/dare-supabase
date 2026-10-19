-- Targeted inbox reads, delta-maintained counters, and Circle feed keyset access.
-- This migration is additive and keeps the existing RPC signatures available.

create or replace function public.get_inbox_rows(p_conversation_ids uuid[])
returns jsonb
language sql stable security invoker set search_path = public
as $$
with requested as (
  select distinct value as conversation_id
  from unnest(coalesce(p_conversation_ids, '{}'::uuid[])) value
  where value is not null
), rows as (
  select jsonb_build_object(
    'conversation_id', c.id,
    'user1_id', (array_agg(cm_all.user_id) filter (where cm_all.user_id <> auth.uid()))[1],
    'user2_id', auth.uid(),
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'last_message_at', lm.created_at,
    'last_message_content', lm.body,
    'unread_count', (select count(*) from public.messages um where um.conversation_id = c.id and um.sender_id <> auth.uid() and (cm.last_read_at is null or um.created_at > cm.last_read_at)),
    'other_user', jsonb_build_object('id', op.id, 'user_id', op.id, 'username', op.username, 'display_name', op.display_name, 'avatar_url', op.avatar_url),
    'cleared_at', cm.inbox_payload->>'cleared_at',
    'temporary_participant_ids', '[]'::jsonb
  ) as row_data, c.updated_at, c.id
  from requested r
  join public.conversations c on c.id = r.conversation_id
  join public.conversation_members cm on cm.conversation_id = c.id and cm.user_id = auth.uid()
  join public.conversation_members cm_all on cm_all.conversation_id = c.id
  left join lateral (select m.created_at, m.body from public.messages m where m.conversation_id = c.id and m.deleted_at is null order by m.created_at desc, m.id desc limit 1) lm on true
  left join public.profiles op on op.id = (select x.user_id from public.conversation_members x where x.conversation_id = c.id and x.user_id <> auth.uid() order by x.joined_at, x.user_id limit 1)
  group by c.id, c.created_at, c.updated_at, lm.created_at, lm.body, op.id, op.username, op.display_name, op.avatar_url, cm.last_read_at, cm.inbox_payload
)
select coalesce(jsonb_agg(row_data order by updated_at desc, id desc), '[]'::jsonb) from rows;
$$;
revoke all on function public.get_inbox_rows(uuid[]) from public, anon;
grant execute on function public.get_inbox_rows(uuid[]) to authenticated, service_role;

create or replace function public.get_inbox_page_v2(
  p_limit integer default 30,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
) returns jsonb
language sql stable security invoker set search_path = public
as $$
with candidates as (
  select c.id, c.created_at, c.updated_at, cm.last_read_at, cm.inbox_payload,
    lm.created_at as last_message_at, lm.body as last_message_content,
    op.id as other_id, op.username, op.display_name, op.avatar_url
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  left join lateral (select m.created_at, m.body from public.messages m where m.conversation_id = c.id and m.deleted_at is null order by m.created_at desc, m.id desc limit 1) lm on true
  left join public.profiles op on op.id = (select x.user_id from public.conversation_members x where x.conversation_id = c.id and x.user_id <> auth.uid() order by x.joined_at, x.user_id limit 1)
  where cm.user_id = auth.uid()
    and (p_before_updated_at is null or c.updated_at < p_before_updated_at or (c.updated_at = p_before_updated_at and c.id < p_before_id))
  order by c.updated_at desc, c.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 100)) + 1
), page as (
  select * from candidates order by updated_at desc, id desc limit greatest(1, least(coalesce(p_limit, 30), 100))
), last_row as (select updated_at, id from page order by updated_at asc, id asc limit 1)
select jsonb_build_object(
  'items', coalesce((select jsonb_agg(jsonb_build_object(
    'conversation_id', id, 'user1_id', other_id, 'user2_id', auth.uid(),
    'created_at', created_at, 'updated_at', updated_at, 'last_message_at', last_message_at,
    'last_message_content', last_message_content,
    'unread_count', (select count(*) from public.messages m where m.conversation_id = page.id and m.sender_id <> auth.uid() and (page.last_read_at is null or m.created_at > page.last_read_at)),
    'other_user', jsonb_build_object('id', other_id, 'user_id', other_id, 'username', username, 'display_name', display_name, 'avatar_url', avatar_url),
    'cleared_at', inbox_payload->>'cleared_at', 'temporary_participant_ids', '[]'::jsonb
  ) order by updated_at desc, id desc) from page), '[]'::jsonb),
  'hasMore', (select count(*) from candidates) > greatest(1, least(coalesce(p_limit, 30), 100)),
  'nextCursor', (select jsonb_build_object('updatedAt', updated_at, 'id', id) from last_row)
);
$$;
revoke all on function public.get_inbox_page_v2(integer, timestamptz, uuid) from public, anon;
grant execute on function public.get_inbox_page_v2(integer, timestamptz, uuid) to authenticated, service_role;
create index if not exists conversation_members_user_conversation_idx on public.conversation_members(user_id, conversation_id);
create index if not exists conversations_updated_id_idx on public.conversations(updated_at desc, id desc);

-- Member changes carry the same minimal conversation identifier as message changes,
-- so peer receipt and membership changes can use the targeted inbox read.
create or replace function public.broadcast_inbox_member_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare member_row record; conversation_uuid uuid := coalesce(new.conversation_id, old.conversation_id);
begin
  for member_row in select cm.user_id from public.conversation_members cm where cm.conversation_id = conversation_uuid loop
    perform realtime.send(jsonb_build_object('conversationId', conversation_uuid, 'changeKind', 'member', 'changedAt', timezone('utc', now())), 'inbox_changed', 'inbox:' || member_row.user_id::text, true);
  end loop;
  return coalesce(new, old);
end;
$$;
drop trigger if exists conversation_members_broadcast_inbox_change on public.conversation_members;
create trigger conversation_members_broadcast_inbox_change after insert or update or delete on public.conversation_members for each row execute function public.broadcast_inbox_member_change();
revoke all on function public.broadcast_inbox_member_change() from public, anon, authenticated;
grant execute on function public.broadcast_inbox_member_change() to service_role;

-- Delta maintenance preserves the persisted SUM(taps) reaction semantics.
create or replace function public.sync_post_reaction_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare old_post uuid := case when tg_op in ('UPDATE','DELETE') then old.post_id end;
declare new_post uuid := case when tg_op in ('UPDATE','INSERT') then new.post_id end;
declare delta integer := 0;
begin
  if tg_op = 'INSERT' then delta := new.taps;
  elsif tg_op = 'DELETE' then delta := -old.taps;
  elsif old_post is not distinct from new_post and old.taps = new.taps then return new;
  else delta := new.taps - old.taps; end if;
  if old_post is not null and old_post is distinct from new_post then
    update public.posts set reaction_count = greatest(0, reaction_count - old.taps) where id = old_post;
    delta := new.taps;
  end if;
  if new_post is not null then update public.posts set reaction_count = greatest(0, reaction_count + delta) where id = new_post; end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists post_reactions_count on public.post_reactions;
create trigger post_reactions_count after insert or update of post_id, taps or delete on public.post_reactions for each row execute function public.sync_post_reaction_count();

create or replace function public.sync_post_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then update public.posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
  elsif old.post_id is distinct from new.post_id then
    update public.posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  else return new; end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists post_comments_count on public.post_comments;
create trigger post_comments_count after insert or update of post_id or delete on public.post_comments for each row execute function public.sync_post_comment_count();

-- Feed reads are Circle-scoped and use timestamp/id keyset ordering. The old
-- score cursor remains accepted by converting its epoch once before filtering.
create or replace function public.get_ranked_feed_page(p_user_id uuid, p_limit integer default 20, p_before_score double precision default null, p_before_id uuid default null)
returns jsonb language sql stable security invoker set search_path = public as $$
with params as (select case when p_before_score is null then null::timestamptz else to_timestamp(p_before_score) end as before_created), network as (
  select p_user_id user_id union select case when f.requester_id=p_user_id then f.addressee_id else f.requester_id end from public.friendships f where f.status='ACCEPTED' and (f.requester_id=p_user_id or f.addressee_id=p_user_id)
), candidates as (
  select p.id,p.author_id,p.body,p.metadata,p.view_count,p.reaction_count,p.comment_count,p.created_at,p.updated_at,
    pr.username,pr.display_name,pr.avatar_url,
    exists(select 1 from public.post_reactions r where r.post_id=p.id and r.user_id=p_user_id) is_liked
  from public.posts p join public.profiles pr on pr.id=p.author_id cross join params
  where (public.active_circle_id() is null or p.circle_id=public.active_circle_id())
    and (p.visibility='PUBLIC' or p.author_id in (select user_id from network))
    and (p.author_id=p_user_id or p.author_id in (select user_id from network))
    and (params.before_created is null or p.created_at < params.before_created or (p.created_at=params.before_created and p.id<p_before_id))
  order by p.created_at desc,p.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1
), page as (select * from candidates order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))), last_row as (select created_at,id from page order by created_at asc,id asc limit 1)
select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'author_id',author_id,'content',body,'media_url',metadata->'media_url','media_urls',metadata->'media_urls','media_type',metadata->'media_type','view_count',view_count,'likes_count',reaction_count,'comments_count',comment_count,'is_liked_by_user',is_liked,'created_at',created_at,'updated_at',updated_at,'author',jsonb_build_object('id',author_id,'user_id',author_id,'username',username,'display_name',display_name,'avatar_url',avatar_url)) order by created_at desc,id desc) from page),'[]'::jsonb),'hasMore',(select count(*) from candidates)>greatest(1,least(coalesce(p_limit,20),50)),'nextCursor',(select jsonb_build_object('score',extract(epoch from created_at),'id',id,'version',2) from last_row));
$$;
revoke all on function public.get_ranked_feed_page(uuid,integer,double precision,uuid) from public;
grant execute on function public.get_ranked_feed_page(uuid,integer,double precision,uuid) to service_role;
create index if not exists posts_circle_created_id_idx on public.posts(circle_id, created_at desc, id desc);
