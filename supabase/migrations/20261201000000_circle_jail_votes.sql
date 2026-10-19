begin;
create table public.circle_jail_cases (
 id uuid primary key default gen_random_uuid(), circle_id uuid not null references public.circles(id),
 creator_id uuid not null references public.profiles(id), target_id uuid not null references public.profiles(id),
 source_message_id uuid references public.circle_chat_messages(id),
 reason text not null check(length(btrim(reason)) between 1 and 280),
 eligible_ids uuid[] not null, votes jsonb not null default '{}',
 status text not null default 'open' check(status in ('open','jailed','dismissed')),
 closes_at timestamptz not null default now()+interval '24 hours',
 sentenced_until timestamptz, resolved_at timestamptz,
 created_at timestamptz not null default now()
);
create index circle_jail_history on public.circle_jail_cases(circle_id,created_at desc);
alter table public.circle_jail_cases enable row level security;
create policy circle_jail_read on public.circle_jail_cases for select to authenticated using(public.has_circle_access(circle_id));
grant select on public.circle_jail_cases to authenticated;
grant all on public.circle_jail_cases to service_role;
create function public.broadcast_circle_jail_case() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform realtime.send(jsonb_build_object('case',new),'jail','circle-chat:'||new.circle_id::text||':'||(select chat_epoch::text from circles where id=new.circle_id),true);
 return null;
end $$;
create trigger circle_jail_case_broadcast after insert or update on public.circle_jail_cases for each row execute function public.broadcast_circle_jail_case();

create function public.create_circle_jail_case(p_id uuid,p_circle uuid,p_target uuid,p_reason text,p_source uuid default null)
returns public.circle_jail_cases language plpgsql security definer set search_path=public as $$
declare v_case circle_jail_cases; v_eligible uuid[]; v_name text; v_message uuid;
begin
 if not public.has_circle_access(p_circle) or not public.is_circle_member(p_circle,p_target) or p_target=auth.uid() then raise exception 'Choose another Circle member'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_circle::text||p_target::text,826));
 select * into v_case from circle_jail_cases where id=p_id;
 if found then
  if v_case.creator_id<>auth.uid() or v_case.circle_id<>p_circle then raise exception 'Case unavailable'; end if;
  return v_case;
 end if;
 if exists(select 1 from circle_jail_cases where circle_id=p_circle and target_id=p_target and ((status='open' and closes_at>now()) or sentenced_until>now())) then raise exception 'This member already has an active case'; end if;
 if p_source is not null and not exists(select 1 from circle_chat_messages where id=p_source and circle_id=p_circle) then raise exception 'Original message unavailable'; end if;
 select array_agg(user_id) into v_eligible from circle_members where circle_id=p_circle;
 insert into circle_jail_cases(id,circle_id,creator_id,target_id,reason,source_message_id,eligible_ids)
 values(p_id,p_circle,auth.uid(),p_target,btrim(p_reason),p_source,v_eligible) returning * into v_case;
 select coalesce(nullif(display_name,''),username,'Circle member') into v_name from profiles where id=auth.uid();
 if p_source is not null then
  insert into circle_chat_messages(circle_id,author_id,author_name,body,source_message_id,interaction_kind,interaction_id,status,status_until)
  values(p_circle,auth.uid(),left(v_name,80),left(btrim(p_reason),240),p_source,'jail',p_id,'open',v_case.closes_at) returning id into v_message;
 end if;
 -- An invitation to vote is an action alert; normal chat sends never fan out.
 insert into alerts(recipient_id,actor_id,type,circle_id,payload)
 select member,auth.uid(),'SYSTEM_NOTIFICATION',p_circle,jsonb_build_object('entityId',p_id,'message',v_name||' opened a Jail vote',
 'metadata',jsonb_build_object('interactionKind','jail','interactionId',p_id,'chatMessageId',v_message,'actorName',v_name))
 from unnest(v_eligible) member where member<>auth.uid();
 return v_case;
end $$;

create function public.vote_circle_jail_case(p_case uuid,p_guilty boolean default null)
returns public.circle_jail_cases language plpgsql security definer set search_path=public as $$
declare v_case circle_jail_cases; v_yes integer; v_no integer; v_total integer;
begin
 select * into v_case from circle_jail_cases where id=p_case for update;
 if not found or not public.has_circle_access(v_case.circle_id) then raise exception 'Case unavailable'; end if;
 if v_case.status<>'open' then return v_case; end if;
 if p_guilty is not null and v_case.closes_at>now() then
  if not auth.uid()=any(v_case.eligible_ids) then raise exception 'Only the original Circle can vote on this case'; end if;
  v_case.votes:=v_case.votes||jsonb_build_object(auth.uid()::text,p_guilty);
 end if;
 select count(*) filter(where value='true'::jsonb),count(*) filter(where value='false'::jsonb)
 into v_yes,v_no from jsonb_each(v_case.votes);
 v_total:=cardinality(v_case.eligible_ids);
 -- Strict majority of the original Circle. A tie/timeout releases the accused.
 if v_yes>v_total/2 then v_case.status:='jailed'; v_case.sentenced_until:=now()+interval '6 hours';
 elsif v_no>=ceil(v_total/2.0) or v_case.closes_at<=now() then v_case.status:='dismissed'; end if;
 if v_case.status<>'open' then v_case.resolved_at:=now(); end if;
 update circle_jail_cases set votes=v_case.votes,status=v_case.status,sentenced_until=v_case.sentenced_until,resolved_at=v_case.resolved_at where id=p_case;
 update circle_chat_messages set status=v_case.status,status_until=coalesce(v_case.sentenced_until,v_case.closes_at) where interaction_kind='jail' and interaction_id=p_case and status is distinct from v_case.status;
 return v_case;
end $$;
revoke all on function public.create_circle_jail_case(uuid,uuid,uuid,text,uuid),public.vote_circle_jail_case(uuid,boolean) from public,anon;
grant execute on function public.create_circle_jail_case(uuid,uuid,uuid,text,uuid),public.vote_circle_jail_case(uuid,boolean) to authenticated;
commit;
