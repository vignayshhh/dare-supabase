-- Post like/unlike atomicity and Aura milestone update.
create or replace function public.create_legacy_post_with_event(
  p_post_id text, p_post_data jsonb, p_event_id text, p_event_data jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into public.data_documents(collection,document_id,data,updated_at)
  values ('posts',p_post_id,p_post_data,timezone('utc',now()));
  insert into public.data_documents(collection,document_id,data,updated_at)
  values ('feed_events',p_event_id,p_event_data,timezone('utc',now()));
  return jsonb_build_object('postId',p_post_id,'eventId',p_event_id);
end; $$;
revoke all on function public.create_legacy_post_with_event(text,jsonb,text,jsonb) from public;
grant execute on function public.create_legacy_post_with_event(text,jsonb,text,jsonb) to service_role;

create or replace function public.toggle_legacy_post_like(
  p_post_id text, p_user_id text, p_liked boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  post_data jsonb; like_data jsonb; like_id text := p_post_id || '_' || p_user_id;
  duplicate boolean := false; next_count integer; author_id text;
  milestone integer; reward integer; aura_data jsonb; aura_event_id text;
  current_aura integer; lifetime_aura integer; next_aura integer; next_lifetime integer;
  now_text text := timezone('utc', now())::text;
begin
  select data into post_data from public.data_documents where collection='posts' and document_id=p_post_id for update;
  if post_data is null then raise exception using errcode='P0002', message='post_not_found'; end if;
  if p_liked then
    select data into like_data from public.data_documents where collection='post_likes' and document_id=like_id for update;
    if like_data is not null then
      duplicate := true;
      update public.data_documents set data=jsonb_set(data,'{tap_count}',to_jsonb(coalesce((data->>'tap_count')::integer,0)+1)),updated_at=timezone('utc',now()) where collection='post_likes' and document_id=like_id;
    else
      next_count := greatest(0,coalesce((post_data->>'likes_count')::integer,0))+1;
      insert into public.data_documents(collection,document_id,data,updated_at) values('post_likes',like_id,jsonb_build_object('post_id',p_post_id,'user_id',p_user_id,'tap_count',1,'counter_applied',true,'created_at',now_text,'updated_at',now_text),timezone('utc',now()));
      update public.data_documents set data=jsonb_set(data,'{likes_count}',to_jsonb(next_count)),updated_at=timezone('utc',now()) where collection='posts' and document_id=p_post_id;
      author_id := coalesce(post_data->>'author_id',post_data->>'user_id');
      milestone := case when next_count in (25,50,100) then next_count else null end;
      reward := case next_count when 25 then 100 when 50 then 200 when 100 then 500 else null end;
      if milestone is not null and author_id is not null and reward is not null then
        aura_event_id := md5(author_id || '|post_like_milestone|post|' || p_post_id || '|' || milestone::text);
        if not exists(select 1 from public.data_documents where collection='aura_events' and document_id=aura_event_id) then
          select data into aura_data from public.data_documents where collection='users' and document_id=author_id for update;
          current_aura := greatest(0,coalesce(nullif(aura_data->>'current_aura','')::integer,nullif(aura_data->>'aura','')::integer,100));
          lifetime_aura := greatest(current_aura,coalesce(nullif(aura_data->>'lifetime_aura','')::integer,100));
          next_aura := current_aura + reward; next_lifetime := lifetime_aura + reward;
          update public.data_documents set data=jsonb_set(jsonb_set(data,'{current_aura}',to_jsonb(next_aura)),'{lifetime_aura}',to_jsonb(next_lifetime)),updated_at=timezone('utc',now()) where collection='users' and document_id=author_id;
          insert into public.data_documents(collection,document_id,data,updated_at) values('aura_events',aura_event_id,jsonb_build_object('user_id',author_id,'kind','post_like_milestone','amount',reward,'source_type','post','source_id',p_post_id,'qualifier',milestone::text,'current_aura_after',next_aura,'lifetime_aura_after',next_lifetime,'created_at',now_text),timezone('utc',now()));
        end if;
      end if;
    end if;
    return jsonb_build_object('liked',true,'duplicate',duplicate,'milestone',milestone,'nextCount',coalesce(next_count,(post_data->>'likes_count')::integer),'authorId',author_id);
  end if;
  if exists(select 1 from public.data_documents where collection='post_likes' and document_id=like_id) then
    delete from public.data_documents where collection='post_likes' and document_id=like_id;
    update public.data_documents set data=jsonb_set(data,'{likes_count}',to_jsonb(greatest(0,coalesce((data->>'likes_count')::integer,0)-1))),updated_at=timezone('utc',now()) where collection='posts' and document_id=p_post_id;
  end if;
  return jsonb_build_object('liked',false,'duplicate',false);
end; $$;
revoke all on function public.toggle_legacy_post_like(text,text,boolean) from public;
grant execute on function public.toggle_legacy_post_like(text,text,boolean) to service_role;
