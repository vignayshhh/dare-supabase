-- Circles are membership boundaries, not owner-maintained friend lists.
begin;
alter table public.circles add column if not exists avatar text not null default '🪩';
alter table public.circles add column if not exists invite_permission text not null default 'owner' check (invite_permission in ('owner','members'));
insert into public.circle_members(circle_id,user_id)
select id,owner_id from public.circles where deleted_at is null on conflict do nothing;

create or replace function public.is_circle_member(p_circle uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from circle_members m join circles c on c.id=m.circle_id
 where m.circle_id=p_circle and m.user_id=p_user and c.deleted_at is null)
$$;
revoke all on function public.is_circle_member(uuid,uuid) from public;
grant execute on function public.is_circle_member(uuid,uuid) to authenticated,service_role;

drop policy if exists circles_owner_all on public.circles;
drop policy if exists circle_members_owner_all on public.circle_members;
create policy circles_member_read on public.circles for select to authenticated using(public.is_circle_member(id));
create policy circle_members_member_read on public.circle_members for select to authenticated using(public.is_circle_member(circle_id));
-- Membership mutations only through the transaction functions below.
revoke insert,update,delete on public.circles,public.circle_members from authenticated;

create table public.circle_invitations (
 id uuid primary key default gen_random_uuid(),
 circle_id uuid not null references public.circles(id),
 inviter_id uuid not null references public.profiles(id),
 token text not null unique default encode(extensions.gen_random_bytes(24),'hex'),
 code text not null unique check(code ~ '^[0-9]{6}$'),
 expires_at timestamptz not null default now()+interval '7 days',
 max_uses integer not null default 20 check(max_uses between 1 and 100),
 uses integer not null default 0,
 revoked_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.circle_invitation_acceptances (
 invitation_id uuid not null references public.circle_invitations(id),
 user_id uuid not null references public.profiles(id),
 accepted_at timestamptz not null default now(), primary key(invitation_id,user_id)
);
alter table public.circle_invitations enable row level security;
alter table public.circle_invitation_acceptances enable row level security;
create policy circle_invitation_read on public.circle_invitations for select to authenticated using(
 inviter_id=auth.uid() or exists(select 1 from public.circles c where c.id=circle_id and c.owner_id=auth.uid()));
create policy circle_acceptance_read on public.circle_invitation_acceptances for select to authenticated using(user_id=auth.uid());
grant select on public.circle_invitations,public.circle_invitation_acceptances to authenticated;
grant all on public.circle_invitations,public.circle_invitation_acceptances to service_role;

create or replace function public.create_circle(p_name text,p_avatar text default '🪩')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'Sign in to create a Circle'; end if;
 if length(btrim(p_name)) not between 1 and 80 or length(p_avatar)>16 then raise exception 'Choose a name (1–80 characters) and an avatar'; end if;
 -- Serialize all creation attempts for this owner, including separate devices.
 perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
 if (select count(*) from circles where owner_id=v_user and deleted_at is null)>=3 then raise exception 'You can create up to three Circles. You can still join others.'; end if;
 insert into circles(owner_id,name,avatar) values(v_user,btrim(p_name),p_avatar) returning id into v_id;
 insert into circle_members(circle_id,user_id) values(v_id,v_user);
 return v_id;
end $$;

create or replace function public.manage_circle(p_circle uuid,p_action text,p_value text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_user uuid:=auth.uid();
begin
 select owner_id into v_owner from circles where id=p_circle and deleted_at is null for update;
 if not public.is_circle_member(p_circle,v_user) then raise exception 'Circle unavailable'; end if;
 if p_action='leave' then
   if v_owner=v_user then raise exception 'Transfer ownership before leaving'; end if;
   delete from circle_members where circle_id=p_circle and user_id=v_user;
   update circle_invitations set revoked_at=now() where circle_id=p_circle and inviter_id=v_user;
   return;
 end if;
 if v_owner<>v_user then raise exception 'Only the owner can manage this Circle'; end if;
 if p_action='rename' and length(btrim(p_value)) between 1 and 80 then
   update circles set name=btrim(p_value),updated_at=now() where id=p_circle;
 elsif p_action='avatar' and length(p_value) between 1 and 16 then
   update circles set avatar=p_value,updated_at=now() where id=p_circle;
 elsif p_action='invite_permission' and p_value in ('owner','members') then
   update circles set invite_permission=p_value where id=p_circle;
 elsif p_action='remove' then
   if p_value::uuid=v_owner then raise exception 'Owner cannot be removed'; end if;
   delete from circle_members where circle_id=p_circle and user_id=p_value::uuid;
   update circle_invitations set revoked_at=now() where circle_id=p_circle and inviter_id=p_value::uuid;
 elsif p_action='transfer' then
   if not public.is_circle_member(p_circle,p_value::uuid) then raise exception 'Choose an active member'; end if;
   perform pg_advisory_xact_lock(hashtextextended(p_value,0));
   if (select count(*) from circles where owner_id=p_value::uuid and deleted_at is null)>=3 then raise exception 'New owner already manages three Circles'; end if;
   update circles set owner_id=p_value::uuid,updated_at=now() where id=p_circle;
 elsif p_action='delete' then
   update circles set deleted_at=now() where id=p_circle;
   update circle_invitations set revoked_at=now() where circle_id=p_circle;
 else raise exception 'Invalid Circle action'; end if;
end $$;

create or replace function public.create_circle_invitation(p_circle uuid,p_max_uses integer default 20)
returns public.circle_invitations language plpgsql security definer set search_path=public as $$
declare v_circle circles; v_result circle_invitations; v_code text; v_attempt integer;
begin
 select * into v_circle from circles where id=p_circle and deleted_at is null for update;
 if not public.is_circle_member(p_circle) or (v_circle.invite_permission='owner' and v_circle.owner_id<>auth.uid()) then raise exception 'Only permitted members can invite friends'; end if;
 if (select count(*) from circle_invitations where circle_id=p_circle and revoked_at is null and expires_at>now() and uses<max_uses)>=10 then raise exception 'Revoke an existing invitation before creating another'; end if;
 for v_attempt in 1..30 loop
   v_code:=lpad((('x'||substr(encode(extensions.gen_random_bytes(4),'hex'),1,7))::bit(28)::bigint % 1000000)::text,6,'0');
   begin
     insert into circle_invitations(circle_id,inviter_id,code,max_uses) values(p_circle,auth.uid(),v_code,p_max_uses) returning * into v_result;
     return v_result;
   exception when unique_violation then null;
   end;
 end loop;
 raise exception 'Could not create a code. Try again.';
end $$;

create or replace function public.preview_circle_invitation(p_secret text,p_user uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_inv circle_invitations; v_circle circles; v_inviter text;
begin
 if auth.role()<>'service_role' then raise exception 'forbidden'; end if;
 if p_user is null then raise exception 'Sign in to view your invitation'; end if;
 select * into v_inv from circle_invitations where token=p_secret or code=p_secret;
 if not found then raise exception 'Invitation not found'; end if;
 if v_inv.revoked_at is not null then raise exception 'This invitation was revoked'; end if;
 if v_inv.expires_at<=now() then raise exception 'This invitation has expired'; end if;
 select * into v_circle from circles where id=v_inv.circle_id and deleted_at is null;
 if not found then raise exception 'Circle unavailable'; end if;
 if v_inv.uses>=v_inv.max_uses and not public.is_circle_member(v_inv.circle_id,p_user) then raise exception 'This invitation is fully used'; end if;
 select coalesce(display_name,username) into v_inviter from profiles where id=v_inv.inviter_id;
 return jsonb_build_object('circleId',v_circle.id,'name',v_circle.name,'avatar',v_circle.avatar,'inviter',v_inviter,
 'memberCount',(select count(*) from circle_members where circle_id=v_circle.id),'alreadyMember',public.is_circle_member(v_circle.id,p_user),'expiresAt',v_inv.expires_at);
end $$;

create or replace function public.accept_circle_invitation(p_secret text,p_user uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_inv circle_invitations;
begin
 if auth.role()<>'service_role' then raise exception 'forbidden'; end if;
 if p_user is null then raise exception 'Sign in to accept'; end if;
 select * into v_inv from circle_invitations where token=p_secret or code=p_secret;
 perform 1 from circles where id=v_inv.circle_id for update;
 select * into v_inv from circle_invitations where token=p_secret or code=p_secret for update;
 perform public.preview_circle_invitation(p_secret,p_user);
 if public.is_circle_member(v_inv.circle_id,p_user) then return v_inv.circle_id; end if;
 -- A code cannot be reused by a removed member. A fresh invitation is required.
 if exists(select 1 from circle_invitation_acceptances where invitation_id=v_inv.id and user_id=p_user) then raise exception 'This invitation was already used. Ask for a new one.'; end if;
 insert into circle_members(circle_id,user_id) values(v_inv.circle_id,p_user) on conflict do nothing;
 insert into circle_invitation_acceptances(invitation_id,user_id) values(v_inv.id,p_user);
 update circle_invitations set uses=uses+1 where id=v_inv.id;
 return v_inv.circle_id;
end $$;

create or replace function public.revoke_circle_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 update circle_invitations i set revoked_at=now() where i.id=p_invitation and
 public.is_circle_member(i.circle_id) and (i.inviter_id=auth.uid() or exists(select 1 from circles c where c.id=i.circle_id and c.owner_id=auth.uid()));
 if not found then raise exception 'Invitation unavailable'; end if;
end $$;

revoke all on function public.create_circle(text,text),public.manage_circle(uuid,text,text),public.create_circle_invitation(uuid,integer),public.preview_circle_invitation(text,uuid),public.accept_circle_invitation(text,uuid),public.revoke_circle_invitation(uuid) from public;
-- Code preview/accept are server-only to enforce rate limiting against guessing.
grant execute on function public.create_circle(text,text),public.manage_circle(uuid,text,text),public.create_circle_invitation(uuid,integer),public.revoke_circle_invitation(uuid) to authenticated;
grant execute on function public.preview_circle_invitation(text,uuid),public.accept_circle_invitation(text,uuid) to service_role;
commit;
