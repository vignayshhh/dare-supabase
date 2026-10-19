create or replace function public.try_timestamptz(p_value text) returns timestamptz language plpgsql immutable as $$ begin return nullif(p_value,'')::timestamptz; exception when others then return null; end $$;

create table if not exists public.community_challenge_summaries (
  id uuid primary key default gen_random_uuid(),
  custom_dare boolean not null default false,
  challenge_id uuid,
  title_top text not null default '', title_accent text not null default '',
  description text not null default '', duration_days integer not null default 7,
  creator_id uuid, creator_username text not null default '', creator_display_name text not null default '', creator_avatar_url text not null default '',
  image_url text not null default '', image_position text not null default 'center', banner text not null default '', proof_label text not null default '', proof_files jsonb not null default '[]'::jsonb,
  joined_count integer not null default 0, waiting_count integer not null default 0, active_count integer not null default 0, completed_count integer not null default 0, eliminated_count integer not null default 0, join_preview jsonb not null default '[]'::jsonb, extra_friends integer not null default 0, batch_status text not null default 'open', min_required_members integer not null default 2,
  registration_started_at timestamptz, registration_ends_at timestamptz, batch_started_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists community_challenge_summaries_custom on public.community_challenge_summaries(custom_dare, updated_at desc, id desc);
create table if not exists public.community_challenge_joins (
  id text primary key,
  challenge_id uuid not null, challenge_title text not null default '', user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null default '', display_name text not null default '', avatar_url text not null default '', status text not null default 'waiting', current_day integer not null default 1, total_days integer not null default 7, proof_due_at timestamptz, proof_window_hours integer not null default 24, last_proof_day integer not null default 0, last_proof_at timestamptz, eliminated_at timestamptz, completed_at timestamptz, elimination_reason text not null default '', official_dare boolean not null default false, created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), unique(challenge_id,user_id)
);
create index if not exists community_challenge_joins_user on public.community_challenge_joins(user_id, updated_at desc, id desc);
create index if not exists community_challenge_joins_challenge on public.community_challenge_joins(challenge_id, updated_at desc, id desc);
alter table public.community_challenge_summaries enable row level security;
alter table public.community_challenge_joins enable row level security;
create policy community_summaries_read on public.community_challenge_summaries for select to authenticated using (true);
create policy community_joins_read on public.community_challenge_joins for select to authenticated using (user_id=auth.uid() or exists(select 1 from public.community_challenge_joins own where own.challenge_id=community_challenge_joins.challenge_id and own.user_id=auth.uid()));
create policy community_joins_write on public.community_challenge_joins for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
grant select on public.community_challenge_summaries to authenticated;
grant select,insert,update,delete on public.community_challenge_joins to authenticated;

do $$
begin
  if to_regclass('public.feature_community_challenge_summaries_records') is not null then
    insert into public.community_challenge_summaries(id,custom_dare,challenge_id,title_top,title_accent,description,duration_days,creator_username,creator_display_name,creator_avatar_url,image_url,image_position,banner,proof_label,proof_files,joined_count,waiting_count,active_count,completed_count,eliminated_count,join_preview,extra_friends,batch_status,min_required_members,registration_started_at,registration_ends_at,batch_started_at,created_at,updated_at)
    select public.try_uuid(document_id), coalesce((data->>'custom_dare')::boolean,false), public.try_uuid(data->>'challenge_id'), coalesce(data->>'title_top',''),coalesce(data->>'title_accent',''),coalesce(data->>'description',''),greatest(1,coalesce((data->>'duration_days')::integer,7)),coalesce(data->>'creator_username',''),coalesce(data->>'creator_display_name',''),coalesce(data->>'creator_avatar_url',''),coalesce(data->>'image_url',''),coalesce(data->>'image_position','center'),coalesce(data->>'banner',''),coalesce(data->>'proof_label',''),coalesce(data->'proof_files','[]'::jsonb),coalesce((data->>'joined_count')::integer,0),coalesce((data->>'waiting_count')::integer,0),coalesce((data->>'active_count')::integer,0),coalesce((data->>'completed_count')::integer,0),coalesce((data->>'eliminated_count')::integer,0),coalesce(data->'join_preview','[]'::jsonb),coalesce((data->>'extra_friends')::integer,0),coalesce(data->>'batch_status','open'),greatest(1,coalesce((data->>'min_required_members')::integer,2)),public.try_timestamptz(data->>'registration_started_at'),public.try_timestamptz(data->>'registration_ends_at'),public.try_timestamptz(data->>'batch_started_at'),created_at,updated_at
    from public.feature_community_challenge_summaries_records where collection='community_challenge_summaries' and public.try_uuid(document_id) is not null on conflict(id) do nothing;
  end if;
end $$;

do $$
begin
  if to_regclass('public.feature_community_challenge_joins_records') is not null then
    insert into public.community_challenge_joins(id,challenge_id,challenge_title,user_id,username,display_name,avatar_url,status,current_day,total_days,proof_due_at,proof_window_hours,last_proof_day,last_proof_at,eliminated_at,completed_at,elimination_reason,official_dare,created_at,updated_at)
    select document_id, public.try_uuid(data->>'challenge_id'), coalesce(data->>'challenge_title',''), public.try_uuid(data->>'user_id'), coalesce(data->>'username',''),coalesce(data->>'display_name',''),coalesce(data->>'avatar_url',''),coalesce(data->>'status','waiting'),coalesce((data->>'current_day')::integer,1),coalesce((data->>'total_days')::integer,7),public.try_timestamptz(data->>'proof_due_at'),coalesce((data->>'proof_window_hours')::integer,24),coalesce((data->>'last_proof_day')::integer,0),public.try_timestamptz(data->>'last_proof_at'),public.try_timestamptz(data->>'eliminated_at'),public.try_timestamptz(data->>'completed_at'),coalesce(data->>'elimination_reason',''),coalesce((data->>'official_dare')::boolean,false),created_at,updated_at
    from public.feature_community_challenge_joins_records where collection='community_challenge_joins' and public.try_uuid(data->>'challenge_id') is not null and public.try_uuid(data->>'user_id') is not null on conflict(id) do nothing;
  end if;
end $$;
