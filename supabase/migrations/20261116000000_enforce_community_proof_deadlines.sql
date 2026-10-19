-- Server-side guard: client clocks must not bypass a community proof window.
create or replace function public.enforce_community_proof_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_due_at timestamptz;
begin
  select status, proof_due_at
    into v_status, v_due_at
    from public.community_challenge_joins
   where challenge_id = new.challenge_id
     and user_id = new.submitter_id
   limit 1;

  if not found then
    raise exception 'community_membership_required' using errcode = '42501';
  end if;

  if v_status = 'eliminated' or (v_due_at is not null and v_due_at <= timezone('utc', now())) then
    raise exception 'community_proof_window_closed' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists challenge_room_proofs_enforce_window on public.challenge_room_proofs;
create trigger challenge_room_proofs_enforce_window
before insert on public.challenge_room_proofs
for each row execute function public.enforce_community_proof_window();

revoke all on function public.enforce_community_proof_window() from public;
grant execute on function public.enforce_community_proof_window() to authenticated;
