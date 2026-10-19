-- Hybrid feed delivery: ordinary authors can be materialized on write while
-- high-fanout authors remain read-merged. The post table stays authoritative.
alter table public.posts add column if not exists ranking_score double precision not null default 0;
update public.posts
set ranking_score = extract(epoch from created_at) + reaction_count * 3600 + comment_count * 900
where ranking_score = 0;

create or replace function public.refresh_post_ranking_score()
returns trigger language plpgsql set search_path=public as $$
begin
  new.ranking_score := extract(epoch from new.created_at)
    + coalesce(new.reaction_count, 0) * 3600
    + coalesce(new.comment_count, 0) * 900;
  return new;
end;
$$;
drop trigger if exists posts_ranking_score on public.posts;
create trigger posts_ranking_score before insert or update of created_at,reaction_count,comment_count
on public.posts for each row execute function public.refresh_post_ranking_score();
create index if not exists posts_ranked_feed_index on public.posts(ranking_score desc,id desc);

alter table public.feed_items add column if not exists ranking_score double precision not null default 0;
create index if not exists feed_items_user_kind_rank_cursor
  on public.feed_items(user_id,kind,ranking_score desc,source_id desc);

create table if not exists public.feed_fanout_policies (
  author_id uuid primary key references public.profiles(id) on delete cascade,
  delivery_mode text not null check (delivery_mode in ('FANOUT_WRITE','FANOUT_READ')),
  updated_at timestamptz not null default timezone('utc',now())
);
alter table public.feed_fanout_policies enable row level security;
create policy feed_fanout_policies_read on public.feed_fanout_policies for select to authenticated using (true);
revoke all on public.feed_fanout_policies from anon;
grant select on public.feed_fanout_policies to authenticated,service_role;

create or replace function public.get_ranked_feed_page(
  p_user_id uuid,
  p_limit integer default 20,
  p_before_score double precision default null,
  p_before_id uuid default null
) returns jsonb language sql stable security invoker set search_path=public as $$
with network as (
  select p_user_id as user_id
  union
  select case when f.requester_id=p_user_id then f.addressee_id else f.requester_id end
  from public.friendships f
  where f.status='ACCEPTED' and (f.requester_id=p_user_id or f.addressee_id=p_user_id)
), candidates as (
  select p.id,p.author_id,p.body,p.metadata,p.view_count,p.reaction_count,p.comment_count,p.created_at,p.updated_at,p.ranking_score,
    pr.username,pr.display_name,pr.avatar_url,
    exists(select 1 from public.post_reactions r where r.post_id=p.id and r.user_id=p_user_id) as is_liked
  from public.posts p join public.profiles pr on pr.id=p.author_id
  where (p.visibility='PUBLIC' or p.author_id in (select user_id from network))
    and (
      p.author_id=p_user_id
      or exists(select 1 from public.feed_items fi where fi.user_id=p_user_id and fi.kind='post' and fi.source_id=p.id)
      or (p.author_id in (select user_id from network)
          and coalesce((select fp.delivery_mode from public.feed_fanout_policies fp where fp.author_id=p.author_id),'FANOUT_READ')='FANOUT_READ')
    )
    and (p_before_score is null or p.ranking_score<p_before_score or (p.ranking_score=p_before_score and p.id<p_before_id))
  order by p.ranking_score desc,p.id desc
  limit greatest(1,least(coalesce(p_limit,20),50))+1
), page as (
  select * from candidates order by ranking_score desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))
), last_row as (select ranking_score,id from page order by ranking_score asc,id asc limit 1)
select jsonb_build_object(
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'author_id',author_id,'content',body,'media_url',metadata->'media_url','media_urls',metadata->'media_urls','media_type',metadata->'media_type',
    'view_count',view_count,'likes_count',reaction_count,'comments_count',comment_count,'is_liked_by_user',is_liked,
    'created_at',created_at,'updated_at',updated_at,'ranking_score',ranking_score,
    'author',jsonb_build_object('id',author_id,'user_id',author_id,'username',username,'display_name',display_name,'avatar_url',avatar_url)
  ) order by ranking_score desc,id desc) from page),'[]'::jsonb),
  'hasMore',(select count(*) from candidates)>greatest(1,least(coalesce(p_limit,20),50)),
  'nextCursor',(select jsonb_build_object('score',ranking_score,'id',id) from last_row)
);
$$;
revoke all on function public.get_ranked_feed_page(uuid,integer,double precision,uuid) from public;
grant execute on function public.get_ranked_feed_page(uuid,integer,double precision,uuid) to service_role;
