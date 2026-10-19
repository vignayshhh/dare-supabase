-- Reduce compatibility-adapter round trips and support its most frequent
-- collection/filter/order shapes. All functions remain security invoker so
-- the caller's existing data_documents RLS policies continue to apply.

create or replace function public.merge_data_document(
  p_collection text,
  p_document_id text,
  p_patch jsonb,
  p_create_if_missing boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  merged jsonb;
begin
  if p_create_if_missing then
    insert into public.data_documents as document (
      collection,
      document_id,
      data,
      updated_at
    )
    values (
      p_collection,
      p_document_id,
      coalesce(p_patch, '{}'::jsonb),
      timezone('utc', now())
    )
    on conflict (collection, document_id) do update
      set data = document.data || excluded.data,
          updated_at = excluded.updated_at
    returning data into merged;
  else
    update public.data_documents
       set data = data || coalesce(p_patch, '{}'::jsonb),
           updated_at = timezone('utc', now())
     where collection = p_collection
       and document_id = p_document_id
    returning data into merged;
  end if;

  return merged;
end;
$$;

revoke all on function public.merge_data_document(text, text, jsonb, boolean) from public;
grant execute on function public.merge_data_document(text, text, jsonb, boolean)
  to authenticated, service_role;

create or replace function public.increment_cache_entry(
  p_key text,
  p_amount bigint default 1,
  p_ttl_ms bigint default null,
  p_refresh_expiry boolean default false
)
returns table(value bigint, expires_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_time timestamptz := clock_timestamp();
begin
  return query
  insert into public.cache_entries as entry (key, value, expires_at, updated_at)
  values (
    p_key,
    to_jsonb(p_amount),
    case when p_ttl_ms is null then null
      else current_time + (p_ttl_ms * interval '1 millisecond') end,
    current_time
  )
  on conflict (key) do update
    set value = to_jsonb(
          case
            when entry.expires_at is not null and entry.expires_at <= current_time
              then p_amount
            else coalesce((entry.value #>> '{}')::bigint, 0) + p_amount
          end
        ),
        expires_at = case
          when p_ttl_ms is null then entry.expires_at
          when entry.expires_at is null
            or entry.expires_at <= current_time
            or p_refresh_expiry
            then current_time + (p_ttl_ms * interval '1 millisecond')
          else entry.expires_at
        end,
        updated_at = current_time
  returning (entry.value #>> '{}')::bigint, entry.expires_at;
end;
$$;

revoke all on function public.increment_cache_entry(text, bigint, bigint, boolean) from public;
grant execute on function public.increment_cache_entry(text, bigint, bigint, boolean)
  to service_role;

create or replace function public.mutate_cache_set(
  p_key text,
  p_value text,
  p_add boolean,
  p_ttl_ms bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  result jsonb;
  current_time timestamptz := clock_timestamp();
begin
  insert into public.cache_entries as entry (key, value, expires_at, updated_at)
  values (
    p_key,
    case when p_add then jsonb_build_array(p_value) else '[]'::jsonb end,
    case when p_ttl_ms is null then null else current_time + (p_ttl_ms * interval '1 millisecond') end,
    current_time
  )
  on conflict (key) do update
    set value = case
      when entry.expires_at is not null and entry.expires_at <= current_time then
        case when p_add then jsonb_build_array(p_value) else '[]'::jsonb end
      when p_add and not (entry.value ? p_value) then entry.value || jsonb_build_array(p_value)
      when not p_add then coalesce((select jsonb_agg(item) from jsonb_array_elements(entry.value) item where item #>> '{}' <> p_value), '[]'::jsonb)
      else entry.value
    end,
    expires_at = case when p_ttl_ms is null then entry.expires_at else current_time + (p_ttl_ms * interval '1 millisecond') end,
    updated_at = current_time
  returning value into result;
  return result;
end;
$$;

revoke all on function public.mutate_cache_set(text, text, boolean, bigint) from public;
grant execute on function public.mutate_cache_set(text, text, boolean, bigint) to service_role;

-- JSON expression indexes are intentionally collection-scoped. They cover
-- the dominant compatibility-adapter predicates without indexing every JSON
-- key or adding write amplification to unrelated collections.
create index if not exists data_documents_friendships_requester_status
  on public.data_documents ((data->>'requester_id'), (data->>'status'))
  where collection = 'friendships';

create index if not exists data_documents_friendships_addressee_status
  on public.data_documents ((data->>'addressee_id'), (data->>'status'))
  where collection = 'friendships';

create index if not exists data_documents_posts_author_created
  on public.data_documents ((data->>'author_id'), (data->>'created_at') desc, document_id)
  where collection = 'posts';

create index if not exists data_documents_stories_user_expiry_created
  on public.data_documents ((data->>'userId'), (data->>'expiresAt') desc, (data->>'createdAt') desc, document_id)
  where collection = 'stories';

create index if not exists data_documents_messages_conversation_created
  on public.data_documents ((data->>'conversation_id'), (data->>'created_at') desc, document_id)
  where collection = 'messages';

create index if not exists data_documents_alerts_user_created
  on public.data_documents ((data->>'user_id'), (data->>'created_at') desc, document_id)
  where collection = 'alerts';

create index if not exists data_documents_post_likes_post_user
  on public.data_documents ((data->>'post_id'), (data->>'user_id'))
  where collection = 'post_likes';

create index if not exists data_documents_post_comments_post_created
  on public.data_documents ((data->>'post_id'), (data->>'created_at') desc, document_id)
  where collection = 'post_comments';
