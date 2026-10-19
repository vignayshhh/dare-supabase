-- Batch RPC now accepts only native core collections. Secondary feature records
-- are written through their own physical feature tables by the adapter.
create or replace function public.apply_app_document_batch(p_ops jsonb)
returns integer language plpgsql volatile security invoker set search_path=public as $$
declare operation jsonb; current_data jsonb; resolved jsonb; applied integer:=0; operation_kind text; collection_name text; document_key text; is_core boolean;
begin
  if jsonb_typeof(p_ops)<>'array' or jsonb_array_length(p_ops)>500 then raise exception 'invalid_batch'; end if;
  for operation in select value from jsonb_array_elements(p_ops) loop
    operation_kind:=operation->>'kind'; collection_name:=operation->>'collection'; document_key:=operation->>'id';
    is_core:=collection_name in ('users','friendships','posts','post_likes','post_comments','stories','story_views','story_view_stats','story_reactions','story_reaction_stats','conversations','messages','message_events','alerts','feed_events') or collection_name like 'user_chat_inbox/%/threads';
    if document_key is null or not is_core then raise exception 'unsupported_native_batch_target'; end if;
    if operation_kind='delete' then perform public.delete_core_document(collection_name,document_key);
    elsif operation_kind in ('set','update') then
      select data into current_data from public.app_documents where collection=collection_name and document_id=document_key;
      if operation_kind='update' and current_data is null then raise exception 'document_not_found'; end if;
      resolved:=public.resolve_data_document_value(coalesce(operation->'data','{}'::jsonb),case when operation_kind='set' and not coalesce((operation->>'merge')::boolean,false) then '{}'::jsonb else coalesce(current_data,'{}'::jsonb) end);
      perform public.write_core_document(collection_name,document_key,resolved,case when operation_kind='update' then 'update' when coalesce((operation->>'merge')::boolean,false) then 'merge' else 'set' end);
    else raise exception 'unsupported_batch_operation'; end if;
    applied:=applied+1;
  end loop;
  return applied;
end;
$$;
revoke all on function public.apply_app_document_batch(jsonb) from public;
grant execute on function public.apply_app_document_batch(jsonb) to authenticated,service_role;
