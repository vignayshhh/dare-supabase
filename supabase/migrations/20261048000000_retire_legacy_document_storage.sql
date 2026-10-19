-- Final retirement of generic document storage.
-- Fresh backend invariant: no legacy records may be present at cutover.
do $$
begin
  if exists(select 1 from public.data_documents limit 1) then
    raise exception 'legacy_data_documents_not_empty';
  end if;
end;
$$;

drop table public.data_documents cascade;

drop function if exists public.data_document_collection_allowed(text);
drop function if exists public.data_document_actor_matches(jsonb);
drop function if exists public.data_document_read_allowed(text,jsonb);
drop function if exists public.data_document_write_allowed(text,jsonb);
drop function if exists public.merge_data_document(text,text,jsonb);
drop function if exists public.record_legacy_dare_vote(text,text,text);
drop function if exists public.record_legacy_story_view(text,text);
drop function if exists public.create_legacy_post_comment(text,text,text,text,text);
drop function if exists public.create_legacy_friend_request(text,text,text);
drop function if exists public.record_legacy_truth_vote(text,text,text);
drop function if exists public.create_legacy_post_with_event(text,jsonb,text,jsonb);
drop function if exists public.toggle_legacy_post_like(text,text,boolean);
drop function if exists public.celebrate_legacy_aura_event(text,text);
drop function if exists public.answer_legacy_truth(text,text,text);
drop function if exists public.submit_legacy_dare_proof(text,text,text,text,text);
drop function if exists public.review_legacy_dare(text,text,text);
drop function if exists public.resolve_data_document_value(jsonb,jsonb);
drop function if exists public.apply_data_document_batch(jsonb);
