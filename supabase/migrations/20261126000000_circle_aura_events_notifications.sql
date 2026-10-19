begin;
create table public.circle_aura (
 circle_id uuid not null references public.circles(id), user_id uuid not null references public.profiles(id),
 current_aura integer not null default 100, lifetime_aura integer not null default 100,
 primary key(circle_id,user_id)
);
alter table public.circle_aura enable row level security;
create policy circle_aura_read on public.circle_aura for select to authenticated using(public.has_circle_access(circle_id));
grant select on public.circle_aura to authenticated;
grant all on public.circle_aura to service_role;

create or replace function public.apply_circle_aura_event(p_circle uuid,p_event_id text,p_user_id uuid,p_kind text,p_amount integer,p_source_type text,p_source_id uuid,p_qualifier text,p_title text,p_message text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_event uuid; v_current integer; v_lifetime integer; v_key text; v_existing jsonb;
begin
 if auth.role()<>'service_role' then raise exception 'forbidden'; end if;
 if not public.is_circle_member(p_circle,p_user_id) then raise exception 'Circle membership required'; end if;
 v_key:=p_circle::text||':'||p_event_id;
 perform pg_advisory_xact_lock(hashtextextended(v_key,0));
 select jsonb_build_object('eventId',id,'userId',user_id,'awarded',false,'amount',delta,'currentAura',current_aura_after,'lifetimeAura',lifetime_aura_after)
 into v_existing from aura_events where idempotency_key=v_key;
 if v_existing is not null then return v_existing; end if;
 insert into circle_aura(circle_id,user_id) values(p_circle,p_user_id) on conflict do nothing;
 select current_aura,lifetime_aura into v_current,v_lifetime from circle_aura where circle_id=p_circle and user_id=p_user_id for update;
 v_current:=greatest(0,v_current+p_amount); v_lifetime:=greatest(v_lifetime,v_current);
 update circle_aura set current_aura=v_current,lifetime_aura=v_lifetime where circle_id=p_circle and user_id=p_user_id;
 v_event:=gen_random_uuid();
 insert into aura_events(id,circle_id,user_id,delta,reason,source_type,source_id,kind,qualifier,title,message,metadata,idempotency_key,current_aura_after,lifetime_aura_after)
 values(v_event,p_circle,p_user_id,p_amount,p_kind,p_source_type,p_source_id,p_kind,p_qualifier,p_title,p_message,coalesce(p_metadata,'{}'),v_key,v_current,v_lifetime);
 return jsonb_build_object('eventId',v_event,'userId',p_user_id,'awarded',true,'amount',p_amount,'currentAura',v_current,'lifetimeAura',v_lifetime);
end $$;
revoke all on function public.apply_circle_aura_event(uuid,text,uuid,text,integer,text,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_circle_aura_event(uuid,text,uuid,text,integer,text,uuid,text,text,text,jsonb) to service_role;

alter table public.alerts add column if not exists circle_id uuid references public.circles(id);
create or replace function public.attach_alert_circle()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text;
begin
 if new.type not in ('FRIEND_REQUEST','FRIEND_ACCEPTED','FRIENDSHIP_ESTABLISHED','SYSTEM_NOTIFICATION') then
   new.circle_id:=coalesce(new.circle_id,public.active_circle_id());
 end if;
 if new.circle_id is not null then
   if not public.is_circle_member(new.circle_id,new.recipient_id) then raise exception 'Recipient is not a Circle member'; end if;
   select name into v_name from circles where id=new.circle_id;
   new.payload:=coalesce(new.payload,'{}')||jsonb_build_object('circleId',new.circle_id,'circleName',v_name);
   new.payload:=jsonb_set(new.payload,'{metadata}',coalesce(new.payload->'metadata','{}')||jsonb_build_object('circleId',new.circle_id,'circleName',v_name));
 end if;
 return new;
end $$;
create trigger attach_alert_circle before insert on public.alerts for each row execute function public.attach_alert_circle();
create policy circle_alert_membership on public.alerts as restrictive for select to authenticated using((circle_id is null and type in ('FRIEND_REQUEST','FRIEND_ACCEPTED','FRIENDSHIP_ESTABLISHED','SYSTEM_NOTIFICATION')) or public.is_circle_member(circle_id));
create policy circle_alert_create on public.alerts for insert to authenticated with check(actor_id=auth.uid() and public.has_circle_access(circle_id) and public.is_circle_member(circle_id,recipient_id));

create or replace function public.active_event_id() returns uuid language sql stable as $$
 select nullif(nullif(current_setting('request.headers',true),'')::jsonb->>'x-event-id','')::uuid
$$;
do $$ declare t text; begin
 foreach t in array array['posts','stories','dares','truths','drama_posts','verdicts','conversations'] loop
   execute format('alter table public.%I alter column event_id set default public.active_event_id()',t);
 end loop;
end $$;
commit;
