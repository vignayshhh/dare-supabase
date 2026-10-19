-- Replace the truth-vote full recount with atomic counter deltas.
-- The parent row lock makes concurrent inserts, deletes, and vote switches
-- serialize per truth while keeping the existing authoritative counters.
create or replace function public.sync_truth_vote_totals()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old_truth uuid;
  v_new_truth uuid;
  v_old_vote text;
  v_new_vote text;
begin
  -- An upsert that writes the same vote is a true no-op. Do not rewrite the
  -- parent row or advance the realtime revision.
  if tg_op = 'UPDATE'
     and old.truth_id is not distinct from new.truth_id
     and old.vote is not distinct from new.vote then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_new_truth := new.truth_id;
    v_new_vote := upper(new.vote);
    update public.truths
    set truth_vote_count = truth_vote_count + case when v_new_vote = 'TRUTH' then 1 else 0 end,
        lie_vote_count = lie_vote_count + case when v_new_vote = 'LIE' then 1 else 0 end,
        interaction_revision = interaction_revision + 1,
        updated_at = timezone('utc', now())
    where id = v_new_truth;

  elsif tg_op = 'DELETE' then
    v_old_truth := old.truth_id;
    v_old_vote := upper(old.vote);
    update public.truths
    set truth_vote_count = greatest(0, truth_vote_count - case when v_old_vote = 'TRUTH' then 1 else 0 end),
        lie_vote_count = greatest(0, lie_vote_count - case when v_old_vote = 'LIE' then 1 else 0 end),
        interaction_revision = interaction_revision + 1,
        updated_at = timezone('utc', now())
    where id = v_old_truth;

  elsif old.truth_id is not distinct from new.truth_id then
    v_old_truth := old.truth_id;
    v_new_truth := new.truth_id;
    v_old_vote := upper(old.vote);
    v_new_vote := upper(new.vote);
    -- Same truth, changed vote: move one count between buckets, one parent
    -- write, one revision increment.
    update public.truths
    set truth_vote_count = greatest(0, truth_vote_count
          - case when v_old_vote = 'TRUTH' then 1 else 0 end
          + case when v_new_vote = 'TRUTH' then 1 else 0 end),
        lie_vote_count = greatest(0, lie_vote_count
          - case when v_old_vote = 'LIE' then 1 else 0 end
          + case when v_new_vote = 'LIE' then 1 else 0 end),
        interaction_revision = interaction_revision + 1,
        updated_at = timezone('utc', now())
    where id = v_new_truth;

  else
    -- A truth_id move is unusual (the current schema does not expose one),
    -- but handling it keeps the trigger correct if that constraint changes.
    v_old_truth := old.truth_id;
    v_new_truth := new.truth_id;
    v_old_vote := upper(old.vote);
    v_new_vote := upper(new.vote);
    update public.truths
    set truth_vote_count = greatest(0, truth_vote_count - case when v_old_vote = 'TRUTH' then 1 else 0 end),
        lie_vote_count = greatest(0, lie_vote_count - case when v_old_vote = 'LIE' then 1 else 0 end),
        interaction_revision = interaction_revision + 1,
        updated_at = timezone('utc', now())
    where id = v_old_truth;

    update public.truths
    set truth_vote_count = truth_vote_count + case when v_new_vote = 'TRUTH' then 1 else 0 end,
        lie_vote_count = lie_vote_count + case when v_new_vote = 'LIE' then 1 else 0 end,
        interaction_revision = interaction_revision + 1,
        updated_at = timezone('utc', now())
    where id = v_new_truth;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_truth_vote_totals() from public, anon, authenticated;
-- Trigger execution does not require exposing the maintenance function to
-- clients; table mutation privileges remain governed by RLS and RPCs.
grant execute on function public.sync_truth_vote_totals() to service_role;

drop trigger if exists truth_vote_totals on public.truth_votes;
create trigger truth_vote_totals
after insert or update or delete on public.truth_votes
for each row execute function public.sync_truth_vote_totals();
