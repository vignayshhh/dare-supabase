begin;
create or replace function public.active_circle_id()
returns uuid language sql stable as $$
 select nullif(nullif(current_setting('request.headers',true),'')::jsonb->>'x-circle-id','')::uuid
$$;
create or replace function public.has_circle_access(p_circle uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select p_circle is not null and p_circle=public.active_circle_id() and public.is_circle_member(p_circle,auth.uid())
$$;
revoke all on function public.has_circle_access(uuid) from public;
grant execute on function public.has_circle_access(uuid),public.active_circle_id() to authenticated,service_role;

create table public.circle_events (
 id uuid primary key default gen_random_uuid(), circle_id uuid not null references public.circles(id),
 creator_id uuid not null references public.profiles(id), name text not null check(length(btrim(name)) between 1 and 120),
 description text not null default '', starts_at timestamptz, ends_at timestamptz, completed_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.circle_events enable row level security;
create policy circle_events_read on public.circle_events for select to authenticated using(public.has_circle_access(circle_id));
create policy circle_events_create on public.circle_events for insert to authenticated with check(creator_id=auth.uid() and public.has_circle_access(circle_id));
create policy circle_events_update on public.circle_events for update to authenticated using(creator_id=auth.uid() and public.has_circle_access(circle_id));
grant select,insert,update on public.circle_events to authenticated;
grant all on public.circle_events to service_role;

create or replace function public.guard_circle_content()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_event uuid; v_event_circle uuid;
begin
 if TG_OP='DELETE' then
   if auth.role()='service_role' and public.active_circle_id() is null then return old; end if;
   if not public.has_circle_access(old.circle_id) then raise exception 'Circle access required'; end if;
   return old;
 end if;
 if TG_OP='UPDATE' and new.circle_id is distinct from old.circle_id then raise exception 'Content cannot move between Circles'; end if;
 if TG_OP='INSERT' then new.circle_id:=coalesce(new.circle_id,public.active_circle_id()); end if;
 -- Legacy records remain unassigned; never infer audiences from friendship.
 if auth.role()='service_role' and public.active_circle_id() is null then return new; end if;
 if not public.has_circle_access(new.circle_id) then raise exception 'Circle access required'; end if;
 if (to_jsonb(new)->>'receiver_id') is not null and not public.is_circle_member(new.circle_id,(to_jsonb(new)->>'receiver_id')::uuid) then raise exception 'Recipient must belong to this Circle'; end if;
 if to_jsonb(new) ? 'event_id' then
   v_event:=(to_jsonb(new)->>'event_id')::uuid;
   if v_event is not null then
     select circle_id into v_event_circle from circle_events where id=v_event;
     if v_event_circle is distinct from new.circle_id then raise exception 'Event belongs to another Circle'; end if;
   end if;
 end if;
 return new;
end $$;

create or replace function public.guard_circle_child()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_parent uuid; v_circle uuid; v_row jsonb;
begin
 if auth.role()='service_role' and public.active_circle_id() is null then return coalesce(new,old); end if;
 v_row:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 v_parent:=(v_row->>TG_ARGV[1])::uuid;
 if v_parent is null then return coalesce(new,old); end if;
 execute format('select circle_id from public.%I where id=$1',TG_ARGV[0]) into v_circle using v_parent;
 if not public.has_circle_access(v_circle) then raise exception 'Circle access required'; end if;
 if TG_TABLE_NAME='conversation_members' and TG_OP<>'DELETE' and not public.is_circle_member(v_circle,(v_row->>'user_id')::uuid) then raise exception 'Conversation participants must belong to this Circle'; end if;
 if TG_OP='UPDATE' and (to_jsonb(old)->>TG_ARGV[1]) is distinct from (v_row->>TG_ARGV[1]) then raise exception 'Content parent cannot change'; end if;
 return coalesce(new,old);
end $$;

do $$ declare t text; child record; policy_name text; expression text; begin
 foreach t in array array['posts','stories','dares','truths','predictions','drama_posts','verdicts','conversations','community_challenges','birthday_rooms','feed_events','aura_events'] loop
   execute format('alter table public.%I add column if not exists circle_id uuid references public.circles(id)',t);
   execute format('alter table public.%I alter column circle_id set default public.active_circle_id()',t);
   execute format('create index if not exists %I on public.%I(circle_id)',t||'_circle_idx',t);
   execute format('create policy circle_boundary on public.%I as restrictive for all to authenticated using(public.has_circle_access(circle_id)) with check(public.has_circle_access(circle_id))',t);
   execute format('create trigger circle_content_guard before insert or update or delete on public.%I for each row execute function public.guard_circle_content()',t);
 end loop;
 foreach t in array array['posts','stories','dares','truths','drama_posts','verdicts','conversations'] loop
   execute format('alter table public.%I add column if not exists event_id uuid references public.circle_events(id)',t);
 end loop;
 -- Apply the boundary to every direct child table, including reactions/proofs/messages.
 for child in
   select distinct child_table.relname child_table, child_column.attname child_column, parent_table.relname parent_table
   from pg_constraint fk
   join pg_class child_table on child_table.oid=fk.conrelid
   join pg_class parent_table on parent_table.oid=fk.confrelid
   join pg_namespace n on n.oid=child_table.relnamespace
   join pg_attribute child_column on child_column.attrelid=fk.conrelid and child_column.attnum=fk.conkey[1]
   where fk.contype='f' and n.nspname='public' and array_length(fk.conkey,1)=1
     and parent_table.relname=any(array['posts','stories','dares','truths','predictions','drama_posts','verdicts','conversations','community_challenges','birthday_rooms'])
     and child_table.relname<>parent_table.relname
 loop
   policy_name:='circle_parent_'||child.child_column;
   expression:=format('exists(select 1 from public.%I circle_parent where circle_parent.id=%I.%I and public.has_circle_access(circle_parent.circle_id))',child.parent_table,child.child_table,child.child_column);
   -- Optional parent references (feed events, alerts) only constrain populated parents.
   expression:=format('(%I is null or (%s))',child.child_column,expression);
   if child.child_table <> 'alerts' then
     execute format('create policy %I on public.%I as restrictive for all to authenticated using(%s) with check(%s)',policy_name,child.child_table,expression,expression);
     execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.guard_circle_child(%L,%L)',policy_name,child.child_table,child.parent_table,child.child_column);
   end if;
 end loop;
end $$;

-- Members need not have a separate global friendship to see shared Circle content.
create policy circle_posts_read on public.posts for select to authenticated using(public.has_circle_access(circle_id) and visibility<>'PRIVATE');
create policy circle_stories_read on public.stories for select to authenticated using(public.has_circle_access(circle_id) and visibility in ('PUBLIC','FRIENDS'));
create policy circle_dares_read on public.dares for select to authenticated using(public.has_circle_access(circle_id) and visibility<>'PRIVATE');
create policy circle_truths_read on public.truths for select to authenticated using(public.has_circle_access(circle_id) and visibility<>'PRIVATE');
create policy circle_profiles_read on public.profiles for select to authenticated using(exists(
 select 1 from public.circle_members m where m.user_id=profiles.id and public.is_circle_member(m.circle_id)));

-- Read RPCs run under RLS. Mutation RPCs retain their existing authorization checks.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array['get_ranked_feed_page','get_friend_stories','get_inbox_page','get_profile_content_counts','get_dare_interaction_counts','get_story_view_counts','get_truth_vote_counts','get_alert_page','get_direct_conversation']) loop
   execute format('alter function %s security invoker',f.signature);
   execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;

-- Chronological feed within the selected Circle, preserving the existing wire format.
create or replace function public.get_ranked_feed_page(p_user_id uuid,p_limit integer default 20,p_before_score double precision default null,p_before_id uuid default null)
returns jsonb language sql stable security invoker set search_path=public as $$
with candidates as (
 select p.*,extract(epoch from p.created_at)::double precision circle_score,
 pr.username,pr.display_name,pr.avatar_url,
 exists(select 1 from post_reactions r where r.post_id=p.id and r.user_id=auth.uid()) is_liked
 from posts p join profiles pr on pr.id=p.author_id
 where p_user_id=auth.uid() and public.has_circle_access(p.circle_id)
 and (p_before_score is null or extract(epoch from p.created_at)<p_before_score or (extract(epoch from p.created_at)=p_before_score and p.id<p_before_id))
 order by p.created_at desc,p.id desc limit greatest(1,least(p_limit,50))+1
), page as (select * from candidates order by created_at desc,id desc limit greatest(1,least(p_limit,50)))
select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
 'id',id,'circle_id',circle_id,'event_id',event_id,'author_id',author_id,'content',body,'media_url',metadata->'media_url','media_urls',metadata->'media_urls','media_type',metadata->'media_type',
 'view_count',view_count,'likes_count',reaction_count,'comments_count',comment_count,'is_liked_by_user',is_liked,'created_at',created_at,'updated_at',updated_at,'ranking_score',circle_score,
 'author',jsonb_build_object('id',author_id,'user_id',author_id,'username',username,'display_name',display_name,'avatar_url',avatar_url)) order by created_at desc,id desc) from page),'[]'::jsonb),
 'hasMore',(select count(*) from candidates)>greatest(1,least(p_limit,50)),
 'nextCursor',(select jsonb_build_object('score',circle_score,'id',id) from page order by created_at,id limit 1))
$$;
commit;
