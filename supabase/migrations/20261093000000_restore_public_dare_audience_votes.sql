-- Approved direct Dares are public with status COMPLETED.  Preserve the
-- existing legacy SUBMITTED threshold behavior, while allowing public viewers
-- to cast a durable REAL/FAKE vote after challenger approval.

create or replace function public.record_dare_vote_native(p_dare_id uuid, p_vote text, p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_dare public.dares; v_total integer; v_approve integer; v_reject integer; v_result text := null; v_status text;
begin
  if coalesce(auth.uid(), p_actor_id) is null or p_vote not in ('REAL','FAKE') or (auth.uid() is not null and p_actor_id is not null and auth.uid() <> p_actor_id) then raise exception 'dare_not_voteable'; end if;
  p_actor_id := coalesce(auth.uid(), p_actor_id);
  select * into v_dare from public.dares where id = p_dare_id for update;
  if not found then raise exception using errcode='P0002', message='dare_not_found'; end if;
  if v_dare.status not in ('SUBMITTED','COMPLETED') or p_actor_id in (v_dare.creator_id, v_dare.receiver_id) then raise exception using errcode='42501', message='dare_not_voteable'; end if;
  insert into public.dare_votes(dare_id, voter_id, vote) values(p_dare_id, p_actor_id, case when p_vote = 'REAL' then 'APPROVE' else 'REJECT' end)
  on conflict(dare_id, voter_id) do update set vote = excluded.vote;
  select count(*)::integer, count(*) filter(where vote='APPROVE')::integer, count(*) filter(where vote='REJECT')::integer into v_total, v_approve, v_reject from public.dare_votes where dare_id = p_dare_id;
  if v_dare.status = 'SUBMITTED' and v_total >= 3 then
    v_result := case when v_approve > v_reject then 'REAL' else 'FAKE' end;
    v_status := case when v_result = 'REAL' then 'COMPLETED' else 'REJECTED' end;
    update public.dares set status = v_status, workflow_state = case when v_result = 'REAL' then 'ACCEPTED_REAL' else 'REJECTED_FAKE' end, completed_at = timezone('utc', now()), updated_at = timezone('utc', now()) where id = p_dare_id returning * into v_dare;
  end if;
  return jsonb_build_object('total', v_total, 'realVotes', v_approve, 'fakeVotes', v_reject, 'result', v_result, 'challengerId', v_dare.creator_id, 'receiverId', v_dare.receiver_id);
end;
$$;
