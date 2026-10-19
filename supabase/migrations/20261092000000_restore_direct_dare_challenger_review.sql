-- A proof is a submission, not an approval.  Keep it private until the
-- challenger reaches an explicit decision through the authenticated review UI.

create or replace function public.submit_dare_proof_native(p_dare_id uuid, p_media_url text, p_media_type text, p_thumbnail_url text default null, p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.dares; v_now timestamptz := timezone('utc', now());
begin
  if coalesce(auth.uid(), p_actor_id) is null or (auth.uid() is not null and p_actor_id is not null and auth.uid() <> p_actor_id) then raise exception 'dare_forbidden'; end if;
  p_actor_id := coalesce(auth.uid(), p_actor_id);
  update public.dares
  set status = 'SUBMITTED', workflow_state = 'PROOF_SUBMITTED', submitted_at = v_now, updated_at = v_now,
      metadata = metadata || jsonb_build_object('proof_media_url', p_media_url, 'proof_media_type', p_media_type, 'proof_thumbnail_url', coalesce(nullif(p_thumbnail_url,''), p_media_url))
  where id = p_dare_id and receiver_id = p_actor_id and status = 'ACCEPTED'
  returning * into v_row;
  if not found then
    if not exists(select 1 from public.dares where id = p_dare_id) then raise exception using errcode='P0002', message='dare_not_found'; end if;
    if not exists(select 1 from public.dares where id = p_dare_id and receiver_id = p_actor_id) then raise exception using errcode='42501', message='dare_forbidden'; end if;
    raise exception using errcode='P0001', message='dare_not_submittable';
  end if;
  insert into public.dare_proofs(dare_id, submitter_id, body, object_path)
  values (v_row.id, p_actor_id, '', p_media_url);
  return to_jsonb(v_row) || jsonb_build_object('challenger_id', v_row.creator_id, 'description', v_row.body, 'state', 'PROOF_SUBMITTED', 'proof_media_url', p_media_url, 'proof_media_type', p_media_type, 'proof_thumbnail_url', coalesce(nullif(p_thumbnail_url,''), p_media_url), 'proof_submitted_at', v_now);
end;
$$;

create or replace function public.review_dare_native(p_dare_id uuid, p_decision text, p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.dares; v_status text; v_now timestamptz := timezone('utc', now());
begin
  if coalesce(auth.uid(), p_actor_id) is null or p_decision not in ('ACCEPT','REJECT') or (auth.uid() is not null and p_actor_id is not null and auth.uid() <> p_actor_id) then raise exception 'dare_forbidden'; end if;
  p_actor_id := coalesce(auth.uid(), p_actor_id);
  v_status := case when p_decision = 'ACCEPT' then 'COMPLETED' else 'REJECTED' end;
  update public.dares
  set status = v_status, workflow_state = case when p_decision = 'ACCEPT' then 'ACCEPTED_REAL' else 'REJECTED_FAKE' end,
      completed_at = v_now, updated_at = v_now,
      metadata = metadata || jsonb_build_object('review_decision', p_decision)
  where id = p_dare_id and creator_id = p_actor_id and status = 'SUBMITTED'
  returning * into v_row;
  if not found then
    if not exists(select 1 from public.dares where id = p_dare_id) then raise exception using errcode='P0002', message='dare_not_found'; end if;
    if not exists(select 1 from public.dares where id = p_dare_id and creator_id = p_actor_id) then raise exception using errcode='42501', message='dare_forbidden'; end if;
    raise exception using errcode='P0001', message='dare_not_reviewable';
  end if;
  return to_jsonb(v_row) || jsonb_build_object('challenger_id', v_row.creator_id, 'description', v_row.body, 'state', case when p_decision = 'ACCEPT' then 'ACCEPTED_REAL' else 'REJECTED_FAKE' end, 'completed_at', v_now);
end;
$$;
