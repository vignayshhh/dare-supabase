-- One bounded feed read: visibility, author, counters, and current reaction
-- state are resolved in PostgreSQL instead of N+1 adapter reads.
create or replace function public.get_feed_page(
  p_user_id uuid,
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
) returns jsonb
language sql stable security invoker set search_path=public as $$
with network as (
  select p_user_id as user_id
  union
  select case when f.requester_id = p_user_id then f.addressee_id else f.requester_id end
  from public.friendships f
  where f.status='ACCEPTED' and (f.requester_id=p_user_id or f.addressee_id=p_user_id)
), candidates as (
  select p.id,p.author_id,p.body,p.metadata,p.view_count,p.reaction_count,p.comment_count,p.created_at,p.updated_at,
         pr.username,pr.display_name,pr.avatar_url,
         exists(select 1 from public.post_reactions r where r.post_id=p.id and r.user_id=p_user_id) as is_liked
  from public.posts p
  join public.profiles pr on pr.id=p.author_id
  where (p.visibility='PUBLIC' or p.author_id in (select user_id from network))
    and (p_before_created_at is null or p.created_at < p_before_created_at or (p.created_at=p_before_created_at and p.id < p_before_id))
  order by p.created_at desc,p.id desc
  limit greatest(1,least(coalesce(p_limit,20),50))+1
), page as (
  select * from candidates order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))
), last_row as (select created_at,id from page order by created_at asc,id asc limit 1)
select jsonb_build_object(
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'author_id',author_id,'content',body,'media_url',metadata->'media_url','media_urls',metadata->'media_urls','media_type',metadata->'media_type',
    'view_count',view_count,'likes_count',reaction_count,'comments_count',comment_count,'is_liked_by_user',is_liked,
    'created_at',created_at,'updated_at',updated_at,
    'author',jsonb_build_object('id',author_id,'user_id',author_id,'username',username,'display_name',display_name,'avatar_url',avatar_url)
  ) order by created_at desc,id desc) from page),'[]'::jsonb),
  'hasMore',(select count(*) from candidates)>greatest(1,least(coalesce(p_limit,20),50)),
  'nextCursor',(select jsonb_build_object('createdAt',created_at,'id',id) from last_row)
);
$$;
revoke all on function public.get_feed_page(uuid,integer,timestamptz,uuid) from public;
grant execute on function public.get_feed_page(uuid,integer,timestamptz,uuid) to service_role;
