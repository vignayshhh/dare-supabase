create table if not exists public.truth_comments (
  id uuid primary key default gen_random_uuid(),
  truth_id uuid not null references public.truths(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.truth_comments(id) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 2000),
  likes_count integer not null default 0 check (likes_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists truth_comments_truth_created_idx on public.truth_comments(truth_id, created_at desc, id desc);
create index if not exists truth_comments_parent_idx on public.truth_comments(parent_id) where parent_id is not null;
create table if not exists public.truth_comment_likes (
  comment_id uuid not null references public.truth_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (comment_id, user_id)
);
alter table public.truth_comments enable row level security;
alter table public.truth_comment_likes enable row level security;
drop policy if exists truth_votes_select on public.truth_votes;
create policy truth_votes_select on public.truth_votes for select to authenticated using (exists (select 1 from public.truths t where t.id = truth_id and (t.creator_id = auth.uid() or t.receiver_id = auth.uid() or t.visibility = 'PUBLIC')));
drop policy if exists truth_comments_select on public.truth_comments;
create policy truth_comments_select on public.truth_comments for select to authenticated using (exists (select 1 from public.truths t where t.id = truth_id and (t.creator_id = auth.uid() or t.receiver_id = auth.uid() or t.visibility = 'PUBLIC')));
drop policy if exists truth_comments_insert on public.truth_comments;
create policy truth_comments_insert on public.truth_comments for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.truths t where t.id = truth_id and (t.creator_id = auth.uid() or t.receiver_id = auth.uid() or t.visibility = 'PUBLIC')));
drop policy if exists truth_comments_update on public.truth_comments;
create policy truth_comments_update on public.truth_comments for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists truth_comments_delete on public.truth_comments;
create policy truth_comments_delete on public.truth_comments for delete to authenticated using (user_id = auth.uid());
drop policy if exists truth_comment_likes_all on public.truth_comment_likes;
create policy truth_comment_likes_all on public.truth_comment_likes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function public.like_truth_comment_native(p_comment_id uuid, p_actor_id uuid default null) returns public.truth_comments language plpgsql security definer set search_path = public as $$
declare v_actor uuid := coalesce(p_actor_id, auth.uid()); v_row public.truth_comments;
begin
  if v_actor is null or auth.uid() is distinct from v_actor then raise exception 'unauthorized'; end if;
  insert into public.truth_comment_likes(comment_id, user_id) values (p_comment_id, v_actor) on conflict do nothing;
  update public.truth_comments c set likes_count = (select count(*) from public.truth_comment_likes l where l.comment_id = c.id), updated_at = timezone('utc', now()) where c.id = p_comment_id returning c.* into v_row;
  if v_row.id is null then raise exception 'truth_comment_not_found'; end if;
  return v_row;
end; $$;
revoke all on function public.like_truth_comment_native(uuid, uuid) from public;
grant execute on function public.like_truth_comment_native(uuid, uuid) to authenticated, service_role;
grant select, insert, update, delete on public.truth_comments, public.truth_comment_likes to authenticated, service_role;

create or replace function public.set_truth_vote_native(p_truth_id uuid, p_vote text, p_actor_id uuid default null) returns public.truth_votes
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := coalesce(p_actor_id, auth.uid()); v_row public.truth_votes;
begin
  if v_actor is null or auth.uid() is distinct from v_actor or upper(p_vote) not in ('TRUTH','LIE') then raise exception 'unauthorized_or_invalid_vote'; end if;
  if not exists (select 1 from public.truths t where t.id = p_truth_id and (t.creator_id = v_actor or t.receiver_id = v_actor or t.visibility = 'PUBLIC')) then raise exception 'truth_not_visible'; end if;
  insert into public.truth_votes(truth_id, voter_id, vote) values (p_truth_id, v_actor, upper(p_vote)) on conflict (truth_id, voter_id) do update set vote = excluded.vote returning * into v_row;
  return v_row;
end; $$;
revoke all on function public.set_truth_vote_native(uuid, text, uuid) from public;
grant execute on function public.set_truth_vote_native(uuid, text, uuid) to authenticated, service_role;
do $$ begin alter publication supabase_realtime add table public.truth_comments; exception when duplicate_object then null; when undefined_object then null; end $$;
