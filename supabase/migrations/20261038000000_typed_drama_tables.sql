create table if not exists public.drama_posts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('prediction','deal','rumour','promise','custom')),
  payload jsonb not null default '{}'::jsonb,
  resolution text,
  resolved_at timestamptz,
  subject_reaction text,
  subject_outcome text,
  subject_thought text,
  proof_label text,
  proof_url text,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);
create index if not exists drama_posts_creator_created on public.drama_posts(creator_id,created_at desc,id desc);
create index if not exists drama_posts_kind_created on public.drama_posts(kind,created_at desc,id desc);
create table if not exists public.drama_votes (
  post_id uuid not null references public.drama_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  primary key(post_id,user_id)
);
create index if not exists drama_votes_post on public.drama_votes(post_id,updated_at desc);
create table if not exists public.drama_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.drama_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check(char_length(body) between 1 and 500),
  created_at timestamptz not null default timezone('utc',now())
);
create index if not exists drama_comments_post_created on public.drama_comments(post_id,created_at asc,id asc);
alter table public.drama_posts enable row level security;
alter table public.drama_votes enable row level security;
alter table public.drama_comments enable row level security;
create policy drama_posts_authenticated on public.drama_posts for all to authenticated using(true) with check(creator_id=auth.uid());
create policy drama_votes_authenticated on public.drama_votes for all to authenticated using(true) with check(user_id=auth.uid());
create policy drama_comments_authenticated on public.drama_comments for all to authenticated using(true) with check(user_id=auth.uid());
grant select,insert,update,delete on public.drama_posts,public.drama_votes,public.drama_comments to authenticated,service_role;

create or replace function public.set_drama_vote(p_post_id uuid,p_vote text,p_remove boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_kind text; v_resolution text;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  select kind,resolution into v_kind,v_resolution from public.drama_posts where id=p_post_id for update;
  if v_kind is null then raise exception 'drama_not_found'; end if;
  if v_resolution is not null then raise exception 'drama_already_resolved'; end if;
  if p_remove then delete from public.drama_votes where post_id=p_post_id and user_id=v_user;
  else insert into public.drama_votes(post_id,user_id,vote) values(p_post_id,v_user,p_vote) on conflict(post_id,user_id) do update set vote=excluded.vote,updated_at=timezone('utc',now()); end if;
  update public.drama_posts set updated_at=timezone('utc',now()) where id=p_post_id;
  return jsonb_build_object('ok',true,'removed',p_remove);
end;
$$;
revoke all on function public.set_drama_vote(uuid,text,boolean) from public;
grant execute on function public.set_drama_vote(uuid,text,boolean) to authenticated,service_role;

insert into public.drama_posts(id,creator_id,kind,payload,resolution,resolved_at,subject_reaction,subject_outcome,subject_thought,proof_label,proof_url,created_at,updated_at)
select public.try_uuid(r.document_id),public.try_uuid(r.data->>'creator_id'),r.data->>'kind',coalesce(r.data->'data','{}'::jsonb),nullif(r.data->>'resolution',''),nullif(r.data->>'resolved_at','')::timestamptz,
  nullif(r.data->>'subject_reaction',''),nullif(r.data->>'subject_outcome',''),nullif(r.data->>'subject_thought',''),nullif(r.data->>'proof_label',''),nullif(r.data->>'proof_url',''),
  coalesce(nullif(r.data->>'created_at','')::timestamptz,r.created_at),coalesce(nullif(r.data->>'updated_at','')::timestamptz,r.updated_at)
from public.feature_drama_posts_records r
where public.try_uuid(r.document_id) is not null and r.data->>'kind' in ('prediction','deal','rumour','promise','custom')
on conflict(id) do nothing;
