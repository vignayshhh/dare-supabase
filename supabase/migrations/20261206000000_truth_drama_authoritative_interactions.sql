-- Authoritative interaction summaries and private realtime delivery.
-- All reads remain subject to the caller's existing RLS policies.

create or replace function public.sync_truth_vote_totals()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_truth uuid := coalesce(new.truth_id, old.truth_id);
begin
  if tg_op = 'UPDATE' and old.vote is not distinct from new.vote then return new; end if;
  update public.truths t set
    truth_vote_count = (select count(*) from public.truth_votes v where v.truth_id=t.id and upper(v.vote)='TRUTH'),
    lie_vote_count = (select count(*) from public.truth_votes v where v.truth_id=t.id and upper(v.vote)='LIE'),
    interaction_revision = t.interaction_revision + 1,
    updated_at = timezone('utc',now())
  where t.id=v_truth;
  return coalesce(new,old);
end; $$;

-- Broadcast only a small versioned invalidation payload. Clients fetch an
-- authorized snapshot instead of receiving private voter/comment rows.
create or replace function public.broadcast_truth_interaction_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_truth uuid := coalesce(new.truth_id, old.truth_id); v_revision bigint;
begin
  select interaction_revision into v_revision from public.truths where id=v_truth;
  if v_truth is not null then
    perform realtime.send(jsonb_build_object('truthId',v_truth,'operation',tg_op,'revision',coalesce(v_revision,0)), 'truth_interaction_changed', 'truth-interactions:'||v_truth::text, true);
  end if;
  return coalesce(new,old);
end; $$;
drop trigger if exists truth_interactions_broadcast on public.truth_votes;
create trigger truth_interactions_broadcast after insert or update or delete on public.truth_votes
for each row execute function public.broadcast_truth_interaction_change();
drop trigger if exists truth_comments_interactions_broadcast on public.truth_comments;
create trigger truth_comments_interactions_broadcast after insert or update or delete on public.truth_comments
for each row execute function public.broadcast_truth_interaction_change();
revoke all on function public.broadcast_truth_interaction_change() from public,anon,authenticated;
grant execute on function public.broadcast_truth_interaction_change() to service_role;

drop policy if exists truth_interaction_topic_read on realtime.messages;
create policy truth_interaction_topic_read on realtime.messages for select to authenticated
using (
  extension='broadcast' and realtime.topic() like 'truth-interactions:%' and exists (
    select 1 from public.truths t
    where ('truth-interactions:'||t.id::text)=realtime.topic()
      and (t.creator_id=auth.uid() or t.receiver_id=auth.uid() or t.visibility='PUBLIC'
        or (t.visibility='FRIENDS' and public.are_friends(t.creator_id,auth.uid())))
  )
);
drop policy if exists truth_interaction_topic_boundary on realtime.messages;
create policy truth_interaction_topic_boundary on realtime.messages as restrictive for select to authenticated
using (realtime.topic() not like 'truth-interactions:%' or exists (
  select 1 from public.truths t where ('truth-interactions:'||t.id::text)=realtime.topic()
    and (t.creator_id=auth.uid() or t.receiver_id=auth.uid() or t.visibility='PUBLIC'
      or (t.visibility='FRIENDS' and public.are_friends(t.creator_id,auth.uid())))
));
create policy truth_interaction_no_client_publish on realtime.messages as restrictive for insert to authenticated
with check (realtime.topic() not like 'truth-interactions:%');

create or replace function public.get_drama_interaction_summaries(p_post_ids uuid[])
returns table(post_id uuid, vote_counts jsonb, total_votes integer, user_vote text, comment_count integer, revision bigint, voters jsonb, comments jsonb)
language sql security invoker set search_path=public as $$
  select p.id,
    coalesce((select jsonb_object_agg(v.vote, v.n) from (select vote,count(*)::integer n from public.drama_votes where drama_votes.post_id=p.id group by vote) v),'{}'::jsonb),
    (select count(*)::integer from public.drama_votes where drama_votes.post_id=p.id),
    (select vote from public.drama_votes where drama_votes.post_id=p.id and user_id=auth.uid()),
    (select count(*)::integer from public.drama_comments where drama_comments.post_id=p.id),
    greatest(extract(epoch from p.updated_at)::bigint,0),
    coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc,v.user_id desc) from (select post_id,user_id,vote,created_at from public.drama_votes where drama_votes.post_id=p.id order by created_at desc,user_id desc limit 5) v),'[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc,c.id desc) from (select id,post_id,user_id,body,created_at from public.drama_comments where drama_comments.post_id=p.id order by created_at desc,id desc limit 3) c),'[]'::jsonb)
  from public.drama_posts p where p.id=any(p_post_ids);
$$;
revoke all on function public.get_drama_interaction_summaries(uuid[]) from public,anon;
grant execute on function public.get_drama_interaction_summaries(uuid[]) to authenticated,service_role;

create index if not exists drama_votes_post_created_id on public.drama_votes(post_id,created_at desc,user_id desc);
create index if not exists drama_comments_post_created_id on public.drama_comments(post_id,created_at desc,id desc);
