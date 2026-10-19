create or replace function public.ensure_legacy_aura_profile(p_user_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d jsonb; cur integer; life integer;
begin
  select data into d from public.data_documents where collection='users' and document_id=p_user_id for update;
  if d is null then raise exception using errcode='P0002',message='user_not_found'; end if;
  cur:=greatest(0,coalesce(nullif(d->>'current_aura','')::integer,nullif(d->>'aura','')::integer,100)); life:=greatest(cur,coalesce(nullif(d->>'lifetime_aura','')::integer,cur));
  update public.data_documents set data=jsonb_set(jsonb_set(data,'{current_aura}',to_jsonb(cur)),'{lifetime_aura}',to_jsonb(life)),updated_at=timezone('utc',now()) where collection='users' and document_id=p_user_id;
  return jsonb_build_object('currentAura',cur,'lifetimeAura',life);
end; $$;

create or replace function public.claim_legacy_feed_fanout_job(p_job_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d jsonb;
begin
  select data into d from public.data_documents where collection='feed_fanout_jobs' and document_id=p_job_id for update skip locked;
  if d is null or d->>'status'<>'pending' then return null; end if;
  update public.data_documents set data=jsonb_set(jsonb_set(jsonb_set(data,'{status}','"processing"'::jsonb),'{attempts}',to_jsonb(coalesce((data->>'attempts')::integer,0)+1)),'{locked_at}',to_jsonb(timezone('utc',now())::text)),updated_at=timezone('utc',now()) where collection='feed_fanout_jobs' and document_id=p_job_id;
  return d;
end; $$;

create or replace function public.mark_legacy_chat_invite_entered(p_invite_id text,p_user_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d jsonb; now_text text:=timezone('utc',now())::text;
begin
  select data into d from public.data_documents where collection='chat_invites' and document_id=p_invite_id for update;
  if d is null then raise exception using errcode='P0002',message='invite_not_found'; end if;
  if d->>'invitee_id'<>p_user_id then raise exception using errcode='42501',message='invite_forbidden'; end if;
  if d->>'status'<>'accepted' or d->>'entered_at' is not null then return null; end if;
  update public.data_documents set data=jsonb_set(data,'{entered_at}',to_jsonb(now_text)),updated_at=timezone('utc',now()) where collection='chat_invites' and document_id=p_invite_id;
  return d;
end; $$;
revoke all on function public.ensure_legacy_aura_profile(text) from public;
revoke all on function public.claim_legacy_feed_fanout_job(text) from public;
revoke all on function public.mark_legacy_chat_invite_entered(text,text) from public;
grant execute on function public.ensure_legacy_aura_profile(text) to service_role;
grant execute on function public.claim_legacy_feed_fanout_job(text) to service_role;
grant execute on function public.mark_legacy_chat_invite_entered(text,text) to authenticated,service_role;
