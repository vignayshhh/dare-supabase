-- Move the last legacy feed rows into the native feed read model and native
-- feed event table. After this migration data_documents is empty and blocked
-- from all application roles; it remains only as historical schema debt so
-- older migration functions remain replayable.
insert into public.feed_events(id,actor_id,event_type,related_post_id,payload,created_at)
select public.try_uuid(d.document_id),
       public.try_uuid(d.data->>'user_id'),
       coalesce(d.data->>'event_type','UNKNOWN'),
       public.try_uuid(d.data->>'related_post_id'),
       d.data,
       coalesce(nullif(d.data->>'created_at','')::timestamptz,d.created_at)
from public.data_documents d
where d.collection='feed_events'
  and public.try_uuid(d.document_id) is not null
on conflict(id) do nothing;

insert into public.feed_items(user_id,kind,source_id,actor_id,participant_ids,created_at,updated_at)
select public.try_uuid(split_part(split_part(d.collection,'/',2),'/items',1)),
       case when d.data->>'kind' in ('post','truth','dare') then d.data->>'kind' else 'post' end,
       public.try_uuid(d.data->>'source_id'),
       public.try_uuid(d.data->>'actor_id'),
       coalesce(d.data->'participant_ids','[]'::jsonb),
       coalesce(nullif(d.data->>'created_at','')::timestamptz,d.created_at),
       coalesce(nullif(d.data->>'updated_at','')::timestamptz,d.updated_at)
from public.data_documents d
where d.collection like 'user_feeds/%/items'
  and public.try_uuid(split_part(split_part(d.collection,'/',2),'/items',1)) is not null
  and public.try_uuid(d.data->>'source_id') is not null
on conflict(user_id,kind,source_id) do update set updated_at=greatest(public.feed_items.updated_at,excluded.updated_at);

delete from public.data_documents where collection='feed_events' or collection like 'user_feeds/%/items';
revoke all on public.data_documents from anon,authenticated;
