-- Authoritative dare vote totals/revision/preview.
-- Counts are maintained transactionally; the RPC never derives headline totals
-- from the bounded voter preview.

create table if not exists public.dare_vote_summaries (
  dare_id uuid primary key references public.dares(id) on delete cascade,
  real_count integer not null default 0 check (real_count >= 0),
  fake_count integer not null default 0 check (fake_count >= 0),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.dare_vote_summaries (dare_id, real_count, fake_count)
select d.id,
       count(v.*) filter (where v.vote = 'APPROVE')::integer,
       count(v.*) filter (where v.vote = 'REJECT')::integer
from public.dares d
left join public.dare_votes v on v.dare_id = d.id
group by d.id
on conflict (dare_id) do update
set real_count = excluded.real_count,
    fake_count = excluded.fake_count,
    updated_at = timezone('utc', now());

create or replace function public.sync_dare_vote_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dare_id uuid := coalesce(new.dare_id, old.dare_id);
  v_old_real integer := case when tg_op in ('UPDATE','DELETE') and old.vote = 'APPROVE' then 1 else 0 end;
  v_old_fake integer := case when tg_op in ('UPDATE','DELETE') and old.vote = 'REJECT' then 1 else 0 end;
  v_new_real integer := case when tg_op in ('INSERT','UPDATE') and new.vote = 'APPROVE' then 1 else 0 end;
  v_new_fake integer := case when tg_op in ('INSERT','UPDATE') and new.vote = 'REJECT' then 1 else 0 end;
begin
  if tg_op = 'UPDATE' and old.vote = new.vote then
    return new;
  end if;
  insert into public.dare_vote_summaries (dare_id, real_count, fake_count, revision)
  values (v_dare_id, greatest(0, v_new_real - v_old_real), greatest(0, v_new_fake - v_old_fake), 1)
  on conflict (dare_id) do update
  set real_count = greatest(0, public.dare_vote_summaries.real_count + v_new_real - v_old_real),
      fake_count = greatest(0, public.dare_vote_summaries.fake_count + v_new_fake - v_old_fake),
      revision = public.dare_vote_summaries.revision + 1,
      updated_at = timezone('utc', now());
  return coalesce(new, old);
end;
$$;

drop trigger if exists dare_votes_summary_delta on public.dare_votes;
create trigger dare_votes_summary_delta
after insert or update or delete on public.dare_votes
for each row execute function public.sync_dare_vote_summary();

create or replace function public.get_dare_vote_snapshot(p_dare_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dare public.dares;
  v_summary public.dare_vote_summaries;
  v_user_vote text;
  v_preview jsonb;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'dare_auth_required'; end if;
  select * into v_dare from public.dares where id = p_dare_id;
  if not found then raise exception using errcode = 'P0002', message = 'dare_not_found'; end if;
  if not (
    v_dare.creator_id = v_actor
    or v_dare.receiver_id = v_actor
    or v_dare.visibility = 'PUBLIC'
    or (v_dare.visibility = 'FRIENDS' and public.are_friends(v_dare.creator_id, v_actor))
  ) then
    raise exception using errcode = '42501', message = 'dare_not_visible';
  end if;

  select * into v_summary from public.dare_vote_summaries where dare_id = p_dare_id;
  if not found then
    insert into public.dare_vote_summaries (dare_id) values (p_dare_id)
    on conflict (dare_id) do nothing;
    select * into v_summary from public.dare_vote_summaries where dare_id = p_dare_id;
  end if;

  select case when vote = 'APPROVE' then 'REAL' else 'FAKE' end into v_user_vote
  from public.dare_votes where dare_id = p_dare_id and voter_id = v_actor;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.dare_id::text || '_' || v.voter_id::text,
    'dare_id', v.dare_id,
    'voter_id', v.voter_id,
    'vote', case when v.vote = 'APPROVE' then 'REAL' else 'FAKE' end,
    'created_at', v.created_at,
    'display_name', coalesce(p.display_name, ''),
    'username', coalesce(p.username, ''),
    'avatar_url', coalesce(p.avatar_url, '')
  ) order by v.created_at desc, v.voter_id desc), '[]'::jsonb)
  into v_preview
  from (select * from public.dare_votes where dare_id = p_dare_id order by created_at desc, voter_id desc limit 100) v
  left join public.profiles p on p.id = v.voter_id and public.can_view_profile(p.id);

  return jsonb_build_object(
    'dareId', p_dare_id,
    'realCount', coalesce(v_summary.real_count, 0),
    'fakeCount', coalesce(v_summary.fake_count, 0),
    'total', coalesce(v_summary.real_count, 0) + coalesce(v_summary.fake_count, 0),
    'userVote', v_user_vote,
    'revision', coalesce(v_summary.revision, 0),
    'voters', v_preview
  );
end;
$$;

revoke all on function public.get_dare_vote_snapshot(uuid) from public;
grant execute on function public.get_dare_vote_snapshot(uuid) to authenticated;

revoke all on table public.dare_vote_summaries from public;
grant select on table public.dare_vote_summaries to service_role;
