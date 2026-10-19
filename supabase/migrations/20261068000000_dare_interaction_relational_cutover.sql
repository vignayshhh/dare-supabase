-- Dedicated relational storage for dare views, media likes, comments and comment likes.
-- The generic feature-record tables remain only as a one-time cutover source.
create table if not exists public.dare_views (
  dare_id uuid not null references public.dares(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (dare_id, user_id)
);
create index if not exists dare_views_dare_created on public.dare_views(dare_id, created_at desc);

create table if not exists public.dare_media_likes (
  dare_id uuid not null references public.dares(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (dare_id, user_id)
);

create table if not exists public.dare_comments (
  id uuid primary key default gen_random_uuid(),
  dare_id uuid not null references public.dares(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null default '',
  display_name text not null default '',
  avatar_url text not null default '',
  text text not null,
  likes integer not null default 0 check (likes >= 0),
  parent_id uuid references public.dare_comments(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists dare_comments_dare_created on public.dare_comments(dare_id, created_at asc, id);

create table if not exists public.dare_comment_likes (
  comment_id uuid not null references public.dare_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (comment_id, user_id)
);

create table if not exists public.override_votes (
  id uuid primary key default gen_random_uuid(),
  dare_id uuid not null references public.dares(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  vote_type text not null check (vote_type in ('real','fake')),
  is_override boolean not null default true,
  override_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (dare_id, voter_id)
);
create index if not exists override_votes_dare on public.override_votes(dare_id, created_at desc);
alter table public.override_votes enable row level security;
create policy override_votes_read on public.override_votes for select to authenticated using (true);
create policy override_votes_self_write on public.override_votes for all to authenticated using (voter_id=auth.uid()) with check (voter_id=auth.uid());
grant select, insert, update, delete on public.override_votes to authenticated;

create or replace function public.increment_profile_dare_stat(p_user_id uuid, p_field text, p_amount integer default 1)
returns public.profiles
language plpgsql security invoker set search_path=public
as $$
declare result public.profiles;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'forbidden'; end if;
  if p_field = 'dares_completed' then
    update public.profiles set dares_completed = greatest(0, dares_completed + greatest(0, p_amount)), updated_at=timezone('utc',now()) where id=p_user_id returning * into result;
  elsif p_field = 'dares_refused' then
    update public.profiles set dares_refused = greatest(0, dares_refused + greatest(0, p_amount)), updated_at=timezone('utc',now()) where id=p_user_id returning * into result;
  else raise exception 'invalid_stat'; end if;
  return result;
end $$;

alter table public.moderation_actions add column if not exists expires_at timestamptz;

create or replace function public.increment_comment_reaction(p_comment_id uuid, p_delta integer)
returns public.post_comments
language sql
security invoker
set search_path = public
as $$
  update public.post_comments
     set reaction_count = greatest(0, reaction_count + least(1, greatest(-1, p_delta))),
         updated_at = timezone('utc', now())
   where id = p_comment_id
  returning *;
$$;
revoke all on function public.increment_comment_reaction(uuid, integer) from public;
grant execute on function public.increment_comment_reaction(uuid, integer) to authenticated;
revoke all on function public.increment_profile_dare_stat(uuid,text,integer) from public;
grant execute on function public.increment_profile_dare_stat(uuid,text,integer) to authenticated, service_role;

alter table public.dare_views enable row level security;
alter table public.dare_media_likes enable row level security;
alter table public.dare_comments enable row level security;
alter table public.dare_comment_likes enable row level security;
create policy dare_views_member_read on public.dare_views for select to authenticated using (user_id = auth.uid() or exists (select 1 from public.dares d where d.id=dare_id and (d.creator_id=auth.uid() or d.receiver_id=auth.uid())));
create policy dare_views_self_write on public.dare_views for insert to authenticated with check (user_id=auth.uid());
create policy dare_media_likes_read on public.dare_media_likes for select to authenticated using (true);
create policy dare_media_likes_self_write on public.dare_media_likes for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy dare_comments_read on public.dare_comments for select to authenticated using (true);
create policy dare_comments_self_write on public.dare_comments for insert to authenticated with check (user_id=auth.uid());
create policy dare_comments_self_update on public.dare_comments for update using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy dare_comments_self_delete on public.dare_comments for delete using (user_id=auth.uid());
create policy dare_comment_likes_read on public.dare_comment_likes for select to authenticated using (true);
create policy dare_comment_likes_self_write on public.dare_comment_likes for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
grant select, insert, update, delete on public.dare_views, public.dare_media_likes, public.dare_comments, public.dare_comment_likes to authenticated;

do $$
begin
  if to_regclass('public.feature_dare_views_records') is not null then
    insert into public.dare_views(dare_id,user_id,created_at)
    select nullif(data->>'dare_id','')::uuid, nullif(data->>'user_id','')::uuid, coalesce(nullif(data->>'created_at','')::timestamptz, created_at)
    from public.feature_dare_views_records where collection='dare_views'
    on conflict (dare_id,user_id) do nothing;
  end if;
  if to_regclass('public.feature_dare_media_likes_records') is not null then
    insert into public.dare_media_likes(dare_id,user_id,created_at)
    select nullif(data->>'dare_id','')::uuid, nullif(data->>'user_id','')::uuid, coalesce(nullif(data->>'created_at','')::timestamptz, created_at)
    from public.feature_dare_media_likes_records where collection='dare_media_likes'
    on conflict (dare_id,user_id) do nothing;
  end if;
  if to_regclass('public.feature_dare_comments_records') is not null then
    insert into public.dare_comments(id,dare_id,user_id,username,display_name,avatar_url,text,likes,parent_id,created_at)
    select nullif(document_id,'')::uuid, nullif(data->>'dare_id','')::uuid, nullif(data->>'user_id','')::uuid,
      coalesce(data->>'username',''), coalesce(data->>'display_name',''), coalesce(data->>'avatar_url',''),
      coalesce(data->>'text',''), greatest(0,coalesce((data->>'likes')::integer,0)), nullif(data->>'parent_id','')::uuid,
      coalesce(nullif(data->>'created_at','')::timestamptz, created_at)
    from public.feature_dare_comments_records where collection='dare_comments'
    on conflict (id) do nothing;
  end if;
  if to_regclass('public.feature_dare_comment_likes_records') is not null then
    insert into public.dare_comment_likes(comment_id,user_id,created_at)
    select nullif(data->>'comment_id','')::uuid, nullif(data->>'user_id','')::uuid, coalesce(nullif(data->>'created_at','')::timestamptz, created_at)
    from public.feature_dare_comment_likes_records where collection='dare_comment_likes'
    on conflict (comment_id,user_id) do nothing;
  end if;
end $$;
