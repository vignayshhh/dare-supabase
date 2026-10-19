-- Restrict helper and trigger functions after initial schema creation.
-- RLS helper functions remain callable only by signed-in users because their
-- policies evaluate under the authenticated role. Trigger-only functions are
-- not exposed through PostgREST RPC.

alter function public.data_document_collection_allowed(text)
  set search_path = pg_catalog, public;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select auth.uid()) is not null
    and ((select auth.uid()) = a or (select auth.uid()) = b)
    and exists (
      select 1
      from public.friendships f
      where f.status = 'ACCEPTED'
        and ((f.requester_id = a and f.addressee_id = b)
          or (f.requester_id = b and f.addressee_id = a))
    )
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.sync_post_reaction_count() from public, anon, authenticated;
revoke execute on function public.sync_post_comment_count() from public, anon, authenticated;
revoke execute on function public.protect_friendship_update() from public, anon, authenticated;

revoke execute on function public.are_friends(uuid, uuid) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_conversation_member(uuid) from public, anon;
revoke execute on function public.can_view_profile(uuid) from public, anon;
revoke execute on function public.data_document_actor_matches(jsonb) from public, anon;
revoke execute on function public.data_document_read_allowed(text, jsonb) from public, anon;
revoke execute on function public.data_document_write_allowed(text, jsonb) from public, anon;
revoke execute on function public.can_use_realtime_topic(text) from public, anon;

grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.data_document_actor_matches(jsonb) to authenticated;
grant execute on function public.data_document_read_allowed(text, jsonb) to authenticated;
grant execute on function public.data_document_write_allowed(text, jsonb) to authenticated;
grant execute on function public.can_use_realtime_topic(text) to authenticated;
