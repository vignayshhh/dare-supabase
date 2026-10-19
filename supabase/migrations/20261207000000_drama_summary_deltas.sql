-- Transactional Drama interaction aggregates. Preview rows remain bounded in the read RPC.
create table if not exists public.drama_interaction_summaries (
  post_id uuid primary key references public.drama_posts(id) on delete cascade,
  vote_counts jsonb not null default '{}'::jsonb,
  total_votes integer not null default 0,
  comment_count integer not null default 0,
  revision bigint not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists drama_interaction_summaries_revision_idx on public.drama_interaction_summaries (post_id, revision desc);
alter table public.drama_interaction_summaries enable row level security;
drop policy if exists drama_summary_read on public.drama_interaction_summaries;
create policy drama_summary_read on public.drama_interaction_summaries for select to authenticated using (exists (select 1 from public.drama_posts p where p.id = post_id));
revoke all on public.drama_interaction_summaries from anon;
grant select on public.drama_interaction_summaries to authenticated;
grant all on public.drama_interaction_summaries to service_role;

insert into public.drama_interaction_summaries(post_id, vote_counts, total_votes, comment_count, revision)
select p.id,
  coalesce((select jsonb_object_agg(v.vote, v.n) from (select vote, count(*)::integer n from public.drama_votes where post_id=p.id group by vote) v), '{}'::jsonb),
  (select count(*)::integer from public.drama_votes where post_id=p.id),
  (select count(*)::integer from public.drama_comments where post_id=p.id), 0
from public.drama_posts p
on conflict (post_id) do nothing;

create or replace function public.sync_drama_vote_summary()
returns trigger language plpgsql security definer set search_path = public as $$
declare post_uuid uuid := coalesce(new.post_id, old.post_id); old_vote text := lower(coalesce(old.vote::text, '')); new_vote text := lower(coalesce(new.vote::text, '')); counts jsonb;
begin
  insert into public.drama_interaction_summaries(post_id) values(post_uuid) on conflict do nothing;
  select vote_counts into counts from public.drama_interaction_summaries where post_id=post_uuid for update;
  if tg_op='INSERT' then
    counts := jsonb_set(counts, array[new_vote], to_jsonb(greatest(0, coalesce((counts->>new_vote)::integer,0)+1)), true);
    update public.drama_interaction_summaries set vote_counts=counts,total_votes=total_votes+1,revision=revision+1,updated_at=timezone('utc',now()) where post_id=post_uuid;
  elsif tg_op='DELETE' then
    counts := jsonb_set(counts, array[old_vote], to_jsonb(greatest(0, coalesce((counts->>old_vote)::integer,0)-1)), true);
    update public.drama_interaction_summaries set vote_counts=counts,total_votes=greatest(0,total_votes-1),revision=revision+1,updated_at=timezone('utc',now()) where post_id=post_uuid;
  elsif old_vote is distinct from new_vote then
    counts := jsonb_set(counts, array[old_vote], to_jsonb(greatest(0, coalesce((counts->>old_vote)::integer,0)-1)), true);
    counts := jsonb_set(counts, array[new_vote], to_jsonb(greatest(0, coalesce((counts->>new_vote)::integer,0)+1)), true);
    update public.drama_interaction_summaries set vote_counts=counts,revision=revision+1,updated_at=timezone('utc',now()) where post_id=post_uuid;
  end if;
  return coalesce(new,old);
end; $$;
drop trigger if exists drama_vote_summary_delta on public.drama_votes;
create trigger drama_vote_summary_delta after insert or update of post_id,vote or delete on public.drama_votes for each row execute function public.sync_drama_vote_summary();

create or replace function public.sync_drama_comment_summary()
returns trigger language plpgsql security definer set search_path = public as $$
declare post_uuid uuid := coalesce(new.post_id, old.post_id);
begin
  insert into public.drama_interaction_summaries(post_id) values(post_uuid) on conflict do nothing;
  update public.drama_interaction_summaries set comment_count=greatest(0,comment_count+case when tg_op='DELETE' then -1 else 1 end),revision=revision+1,updated_at=timezone('utc',now()) where post_id=post_uuid;
  return coalesce(new,old);
end; $$;
drop trigger if exists drama_comment_summary_delta on public.drama_comments;
create trigger drama_comment_summary_delta after insert or delete on public.drama_comments for each row execute function public.sync_drama_comment_summary();

create or replace function public.get_drama_interaction_summaries(p_post_ids uuid[])
returns table(post_id uuid, vote_counts jsonb, total_votes integer, user_vote text, comment_count integer, revision bigint, voters jsonb, comments jsonb)
language sql security invoker set search_path=public as $$
  select p.id, coalesce(s.vote_counts,'{}'::jsonb), coalesce(s.total_votes,0),
    (select vote from public.drama_votes v where v.post_id=p.id and v.user_id=auth.uid()),
    coalesce(s.comment_count,0), coalesce(s.revision,0),
    coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc,v.user_id desc) from (select post_id,user_id,vote,created_at from public.drama_votes where post_id=p.id order by created_at desc,user_id desc limit 5) v),'[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc,c.id desc) from (select id,post_id,user_id,body,created_at from public.drama_comments where post_id=p.id order by created_at desc,id desc limit 3) c),'[]'::jsonb)
  from public.drama_posts p left join public.drama_interaction_summaries s on s.post_id=p.id where p.id=any(p_post_ids);
$$;
revoke all on function public.get_drama_interaction_summaries(uuid[]) from public,anon;
grant execute on function public.get_drama_interaction_summaries(uuid[]) to authenticated,service_role;
