create or replace function public.resolve_data_document_value(p_value jsonb,p_current jsonb default null)
returns jsonb language plpgsql volatile security invoker set search_path=public as $$
declare op text; result jsonb; item record;
begin
  if p_value is null then return 'null'::jsonb; end if;
  if jsonb_typeof(p_value)='object' and p_value?'__document_op' then
    op:=p_value->>'__document_op';
    if op='server_timestamp' then return to_jsonb(timezone('utc',now())::text); end if;
    if op='delete' then return null; end if;
    if op='increment' then return to_jsonb(coalesce((p_current#>>'{}')::numeric,0)+coalesce((p_value->>'value')::numeric,0)); end if;
    if op='array_union' then return coalesce((select jsonb_agg(distinct element) from jsonb_array_elements(coalesce(case when jsonb_typeof(p_current)='array' then p_current else '[]'::jsonb end,'[]'::jsonb)||coalesce(p_value->'value','[]'::jsonb)) element),'[]'::jsonb); end if;
    if op='array_remove' then return coalesce((select jsonb_agg(element) from jsonb_array_elements(case when jsonb_typeof(p_current)='array' then p_current else '[]'::jsonb end) element where not exists(select 1 from jsonb_array_elements(coalesce(p_value->'value','[]'::jsonb)) removed where removed=element)),'[]'::jsonb); end if;
  end if;
  if jsonb_typeof(p_value)='object' then
    result:=case when jsonb_typeof(p_current)='object' then p_current else '{}'::jsonb end;
    for item in select key,value from jsonb_each(p_value) loop
      if jsonb_typeof(item.value)='object' and item.value->>'__document_op'='delete' then result:=result-item.key;
      else result:=jsonb_set(result,array[item.key],public.resolve_data_document_value(item.value,result->item.key),true); end if;
    end loop;
    return result;
  end if;
  if jsonb_typeof(p_value)='array' then return coalesce((select jsonb_agg(public.resolve_data_document_value(value,null)) from jsonb_array_elements(p_value)),'[]'::jsonb); end if;
  return p_value;
end; $$;

create or replace function public.apply_data_document_batch(p_ops jsonb)
returns integer language plpgsql volatile security invoker set search_path=public as $$
declare operation jsonb; current_data jsonb; resolved jsonb; applied integer:=0; operation_kind text; collection_name text; document_key text;
begin
  if jsonb_typeof(p_ops)<>'array' or jsonb_array_length(p_ops)>500 then raise exception 'invalid_batch'; end if;
  for operation in select value from jsonb_array_elements(p_ops) loop
    operation_kind:=operation->>'kind'; collection_name:=operation->>'collection'; document_key:=operation->>'id';
    if not public.data_document_collection_allowed(collection_name) or document_key is null then raise exception 'invalid_batch_target'; end if;
    if operation_kind='delete' then delete from public.data_documents where collection=collection_name and document_id=document_key;
    elsif operation_kind in('set','update') then
      select data into current_data from public.data_documents where collection=collection_name and document_id=document_key for update;
      if operation_kind='update' and current_data is null then raise exception 'document_not_found'; end if;
      resolved:=public.resolve_data_document_value(coalesce(operation->'data','{}'::jsonb),case when operation_kind='set' and not coalesce((operation->>'merge')::boolean,false) then '{}'::jsonb else coalesce(current_data,'{}'::jsonb) end);
      insert into public.data_documents(collection,document_id,data,updated_at) values(collection_name,document_key,resolved,timezone('utc',now())) on conflict(collection,document_id) do update set data=excluded.data,updated_at=excluded.updated_at;
    else raise exception 'unsupported_batch_operation'; end if;
    applied:=applied+1;
  end loop;
  return applied;
end; $$;
revoke all on function public.resolve_data_document_value(jsonb,jsonb) from public;
revoke all on function public.apply_data_document_batch(jsonb) from public;
grant execute on function public.apply_data_document_batch(jsonb) to authenticated,service_role;
