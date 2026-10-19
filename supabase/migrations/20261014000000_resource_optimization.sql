-- Atomic operations for active legacy-shaped paths. These functions are
-- repository migrations only; they are not applied to the hosted project.

create or replace function public.record_legacy_story_view(
  p_story_id text,
  p_viewer_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  story_data jsonb;
  owner_id text;
  view_key text := p_story_id || '_' || p_viewer_id;
  was_duplicate boolean;
  now_text text := timezone('utc', now())::text;
begin
  select data into story_data
    from public.data_documents
   where collection = 'stories' and document_id = p_story_id
   for update;

  if story_data is null then
    raise exception using errcode = 'P0002', message = 'story_not_found';
  end if;

  owner_id := coalesce(story_data->>'userId', story_data->>'user_id');
  select exists(
    select 1 from public.data_documents
     where collection = 'story_views' and document_id = view_key
  ) into was_duplicate;

  insert into public.data_documents(collection, document_id, data, updated_at)
  values (
    'story_views',
    view_key,
    jsonb_build_object(
      'storyId', p_story_id,
      'storyOwnerId', owner_id,
      'userId', p_viewer_id,
      'viewCount', case when was_duplicate then coalesce((select (data->>'viewCount')::integer from public.data_documents where collection='story_views' and document_id=view_key), 0) + 1 else 1 end,
      'firstViewedAt', case when was_duplicate then (select data->>'firstViewedAt' from public.data_documents where collection='story_views' and document_id=view_key) else now_text end,
      'lastViewedAt', now_text
    ),
    timezone('utc', now())
  )
  on conflict (collection, document_id) do update
    set data = excluded.data, updated_at = excluded.updated_at;

  if not was_duplicate then
    insert into public.data_documents(collection, document_id, data, updated_at)
    values (
      'story_view_stats', p_story_id,
      jsonb_build_object('storyId', p_story_id, 'storyOwnerId', owner_id, 'uniqueViewCount', 1, 'updatedAt', now_text),
      timezone('utc', now())
    )
    on conflict (collection, document_id) do update
      set data = jsonb_set(
        jsonb_set(data, '{uniqueViewCount}', to_jsonb(coalesce((data->>'uniqueViewCount')::integer, 0) + 1)),
        '{updatedAt}', to_jsonb(now_text)
      ), updated_at = timezone('utc', now());
  end if;

  return jsonb_build_object('duplicate', was_duplicate, 'ownerId', owner_id);
end;
$$;

revoke all on function public.record_legacy_story_view(text, text) from public;
grant execute on function public.record_legacy_story_view(text, text) to service_role;
