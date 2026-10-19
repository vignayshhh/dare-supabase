begin;
-- Child-of-child records (message receipts, comment reactions, birthday replies)
-- must retain the same boundary even when a definer RPC performs the write.
create or replace function public.guard_circle_descendant()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_row jsonb; v_parent uuid; v_circle uuid;
begin
 if auth.role()='service_role' and public.active_circle_id() is null then return coalesce(new,old); end if;
 v_row:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 v_parent:=(v_row->>TG_ARGV[1])::uuid;
 if v_parent is null then return coalesce(new,old); end if;
 execute TG_ARGV[0] into v_circle using v_parent;
 if not public.has_circle_access(v_circle) then raise exception 'Circle access required'; end if;
 return coalesce(new,old);
end $$;
do $$ declare r record; predicate text; lookup text; policy_name text; begin
 for r in
 select distinct c.relname child,p.relname parent,g.relname root,a.attname child_fk,b.attname parent_fk
 from pg_constraint f
 join pg_class c on c.oid=f.conrelid
 join pg_class p on p.oid=f.confrelid
 join pg_attribute a on a.attrelid=c.oid and a.attnum=f.conkey[1]
 join pg_attribute parent_key on parent_key.attrelid=p.oid and parent_key.attnum=f.confkey[1] and parent_key.attname='id'
 join pg_constraint f2 on f2.conrelid=p.oid and f2.contype='f'
 join pg_class g on g.oid=f2.confrelid
 join pg_attribute b on b.attrelid=p.oid and b.attnum=f2.conkey[1]
 where f.contype='f' and array_length(f.conkey,1)=1 and array_length(f2.conkey,1)=1
 and c.oid<>p.oid and c.relnamespace='public'::regnamespace and c.relname<>'alerts'
 and g.relname=any(array['posts','stories','dares','truths','predictions','drama_posts','verdicts','conversations','community_challenges','birthday_rooms'])
 loop
   policy_name:=left('circle_ancestor_'||r.child_fk||'_'||r.parent_fk,63);
   predicate:=format('(%I is null or exists(select 1 from public.%I p where p.id=%I.%I))',r.child_fk,r.parent,r.child,r.child_fk);
   lookup:=format('select g.circle_id from public.%I p join public.%I g on g.id=p.%I where p.id=$1',r.parent,r.root,r.parent_fk);
   execute format('create policy %I on public.%I as restrictive for all to authenticated using(%s) with check(%s)',policy_name,r.child,predicate,predicate);
   execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.guard_circle_descendant(%L,%L)',policy_name,r.child,lookup,r.child_fk);
 end loop;
end $$;
commit;
