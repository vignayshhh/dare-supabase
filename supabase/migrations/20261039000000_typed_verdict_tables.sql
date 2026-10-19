create table if not exists public.verdicts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  question text not null,
  description text not null default '',
  choice_one_text text not null,
  choice_two_text text not null,
  media_url text not null,
  media_type text not null check (media_type in ('PHOTO','VIDEO','GIF')),
  scope text not null check (scope in ('friends','topics')),
  topic text,
  total_votes integer not null default 0 check (total_votes >= 0),
  choice_one_votes integer not null default 0 check (choice_one_votes >= 0),
  choice_two_votes integer not null default 0 check (choice_two_votes >= 0),
  comments_count integer not null default 0 check (comments_count >= 0),
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);
create index if not exists verdicts_scope_created on public.verdicts(scope,created_at desc,id desc);
create index if not exists verdicts_author_created on public.verdicts(author_id,created_at desc,id desc);
create index if not exists verdicts_topic_created on public.verdicts(topic,created_at desc,id desc);

create table if not exists public.verdict_votes (
  verdict_id uuid not null references public.verdicts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  choice text not null check (choice in ('one','two')),
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  primary key (verdict_id,user_id)
);
create index if not exists verdict_votes_verdict_created on public.verdict_votes(verdict_id,created_at desc);

create table if not exists public.verdict_comments (
  id uuid primary key default gen_random_uuid(),
  verdict_id uuid not null references public.verdicts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  parent_id uuid references public.verdict_comments(id) on delete cascade,
  created_at timestamptz not null default timezone('utc',now())
);
create index if not exists verdict_comments_verdict_created on public.verdict_comments(verdict_id,created_at asc,id asc);

alter table public.verdicts enable row level security;
alter table public.verdict_votes enable row level security;
alter table public.verdict_comments enable row level security;
drop policy if exists verdicts_authenticated on public.verdicts;
create policy verdicts_authenticated on public.verdicts for select to authenticated using (true);
drop policy if exists verdicts_service on public.verdicts;
create policy verdicts_service on public.verdicts for all to service_role using (true) with check (true);
drop policy if exists verdict_votes_authenticated on public.verdict_votes;
create policy verdict_votes_authenticated on public.verdict_votes for select to authenticated using (true);
drop policy if exists verdict_comments_authenticated on public.verdict_comments;
create policy verdict_comments_authenticated on public.verdict_comments for select to authenticated using (true);
grant select on public.verdicts,public.verdict_votes,public.verdict_comments to authenticated;
grant all on public.verdicts,public.verdict_votes,public.verdict_comments to service_role;

insert into public.verdicts(id,author_id,question,description,choice_one_text,choice_two_text,media_url,media_type,scope,topic,total_votes,choice_one_votes,choice_two_votes,comments_count,created_at,updated_at)
select r.document_id::uuid,
  nullif(r.data->>'author_id','')::uuid,
  coalesce(r.data->>'question',''),coalesce(r.data->>'description',''),coalesce(r.data->>'choice_one_text','Yes'),coalesce(r.data->>'choice_two_text','No'),coalesce(r.data->>'media_url',''),
  case when r.data->>'media_type' in ('PHOTO','VIDEO','GIF') then r.data->>'media_type' else 'PHOTO' end,
  case when r.data->>'scope'='topics' then 'topics' else 'friends' end,nullif(r.data->>'topic',''),
  greatest(coalesce((r.data->>'total_votes')::integer,0),0),greatest(coalesce((r.data->>'choice_one_votes')::integer,0),0),greatest(coalesce((r.data->>'choice_two_votes')::integer,0),0),greatest(coalesce((r.data->>'comments_count')::integer,0),0),
  coalesce((r.data->>'created_at')::timestamptz,r.created_at),coalesce((r.data->>'updated_at')::timestamptz,r.updated_at)
from public.feature_verdicts_records r
where nullif(r.data->>'author_id','') is not null
on conflict (id) do nothing;

create or replace function public.set_verdict_vote(p_verdict_id uuid,p_choice text,p_remove boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_one integer; v_two integer; v_total integer;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if not p_remove and p_choice not in ('one','two') then raise exception 'bad_choice'; end if;
  perform 1 from public.verdicts where id=p_verdict_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_remove then delete from public.verdict_votes where verdict_id=p_verdict_id and user_id=v_user;
  else insert into public.verdict_votes(verdict_id,user_id,choice) values(p_verdict_id,v_user,p_choice)
    on conflict(verdict_id,user_id) do update set choice=excluded.choice,updated_at=timezone('utc',now()); end if;
  select count(*) filter(where choice='one'),count(*) filter(where choice='two'),count(*) into v_one,v_two,v_total from public.verdict_votes where verdict_id=p_verdict_id;
  update public.verdicts set choice_one_votes=v_one,choice_two_votes=v_two,total_votes=v_total,updated_at=timezone('utc',now()) where id=p_verdict_id;
  return jsonb_build_object('verdict_id',p_verdict_id,'my_vote',case when p_remove then null else p_choice end,'total_votes',v_total,'choice_one_votes',v_one,'choice_two_votes',v_two);
end $$;
revoke all on function public.set_verdict_vote(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.set_verdict_vote(uuid,text,boolean) to service_role;

create or replace function public.create_verdict_comment(p_verdict_id uuid,p_text text,p_parent_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_count integer;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if length(trim(coalesce(p_text,'')))=0 or length(p_text)>1000 then raise exception 'bad_text'; end if;
  perform 1 from public.verdicts where id=p_verdict_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_parent_id is not null and not exists(select 1 from public.verdict_comments where id=p_parent_id and verdict_id=p_verdict_id) then raise exception 'bad_parent'; end if;
  insert into public.verdict_comments(verdict_id,user_id,text,parent_id) values(p_verdict_id,v_user,trim(p_text),p_parent_id) returning id into v_id;
  update public.verdicts set comments_count=comments_count+1,updated_at=timezone('utc',now()) where id=p_verdict_id returning comments_count into v_count;
  return jsonb_build_object('id',v_id,'verdict_id',p_verdict_id,'user_id',v_user,'text',trim(p_text),'parent_id',p_parent_id,'comments_count',v_count);
end $$;
revoke all on function public.create_verdict_comment(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.create_verdict_comment(uuid,text,uuid) to service_role;

create or replace function public.resolve_drama(p_post_id uuid,p_actor_id uuid,p_value text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.drama_posts%rowtype; subject_id uuid; deadline_text text;
begin
  select * into r from public.drama_posts where id=p_post_id for update;
  if not found then raise exception 'drama_not_found'; end if;
  subject_id:=nullif(r.payload#>>'{subject,id}','')::uuid;
  if p_actor_id<>r.creator_id and not(r.kind in ('prediction','deal','rumour') and r.payload#>>'{subject,type}'='friend' and subject_id=p_actor_id) then raise exception 'drama_forbidden'; end if;
  if r.kind='prediction' and p_value not in ('happened','didnt_happen') then raise exception 'drama_bad_value'; end if;
  if r.kind='rumour' and p_value not in ('confirmed','false') then raise exception 'drama_bad_value'; end if;
  if r.kind='deal' and p_value not in ('won','lost') then raise exception 'drama_bad_value'; end if;
  if r.kind='promise' and p_value not in ('kept','broken') then raise exception 'drama_bad_value'; end if;
  if r.resolution is not null and r.resolution<>p_value then raise exception 'drama_already_resolved'; end if;
  deadline_text:=coalesce(r.payload->>'deadline',r.payload->>'resolutionDate',r.payload->>'dueAt');
  if r.resolution is null and deadline_text is not null and deadline_text::timestamptz>timezone('utc',now()) then raise exception 'drama_not_due'; end if;
  update public.drama_posts set resolution=p_value,resolved_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=p_post_id;
  return jsonb_build_object('kind',r.kind,'creatorId',r.creator_id,'aura','[]'::jsonb);
end $$;
revoke all on function public.resolve_drama(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.resolve_drama(uuid,uuid,text) to service_role;
