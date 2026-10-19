create table if not exists public.challenge_room_proofs (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null,
  submitter_id uuid not null references auth.users(id) on delete cascade,
  submitter_username text not null default '',
  submitter_name text not null default '',
  submitter_avatar_url text not null default '',
  day integer not null,
  media_url text not null default '',
  media_type text not null default 'image',
  caption text not null default '',
  real_votes integer not null default 0 check (real_votes >= 0),
  fake_votes integer not null default 0 check (fake_votes >= 0),
  comments_count integer not null default 0 check (comments_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists challenge_room_proofs_feed on public.challenge_room_proofs(challenge_id, created_at desc, id desc);
create index if not exists challenge_room_proofs_submitter on public.challenge_room_proofs(submitter_id, created_at desc);

create table if not exists public.challenge_proof_votes (
  id uuid primary key default gen_random_uuid(),
  proof_id uuid not null references public.challenge_room_proofs(id) on delete cascade,
  challenge_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote text not null check (vote in ('real','fake')),
  created_at timestamptz not null default timezone('utc', now()),
  unique(proof_id, user_id)
);
create index if not exists challenge_proof_votes_proof on public.challenge_proof_votes(proof_id, created_at desc, id desc);

create table if not exists public.challenge_proof_comments (
  id uuid primary key default gen_random_uuid(),
  proof_id uuid not null references public.challenge_room_proofs(id) on delete cascade,
  challenge_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null default '',
  display_name text not null default '',
  avatar_url text not null default '',
  content text not null check (char_length(content) between 1 and 500),
  likes integer not null default 0 check (likes >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists challenge_proof_comments_proof on public.challenge_proof_comments(proof_id, created_at desc, id desc);

create table if not exists public.challenge_comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.challenge_proof_comments(id) on delete cascade,
  challenge_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique(comment_id, user_id)
);
create index if not exists challenge_comment_likes_comment on public.challenge_comment_likes(comment_id, created_at desc, id desc);

create or replace function public.challenge_room_interaction_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = timezone('utc', now()); return new; end $$;
;
drop trigger if exists challenge_room_proofs_touch on public.challenge_room_proofs;
create trigger challenge_room_proofs_touch before update on public.challenge_room_proofs for each row execute function public.challenge_room_interaction_touch_updated_at();
drop trigger if exists challenge_proof_comments_touch on public.challenge_proof_comments;
create trigger challenge_proof_comments_touch before update on public.challenge_proof_comments for each row execute function public.challenge_room_interaction_touch_updated_at();

alter table public.challenge_room_proofs enable row level security;
alter table public.challenge_proof_votes enable row level security;
alter table public.challenge_proof_comments enable row level security;
alter table public.challenge_comment_likes enable row level security;
drop policy if exists challenge_proofs_read on public.challenge_room_proofs;
create policy challenge_proofs_read on public.challenge_room_proofs for select to authenticated using (true);
drop policy if exists challenge_proofs_owner_write on public.challenge_room_proofs;
create policy challenge_proofs_owner_write on public.challenge_room_proofs for all to authenticated using (submitter_id = auth.uid()) with check (submitter_id = auth.uid());
drop policy if exists challenge_votes_read on public.challenge_proof_votes;
create policy challenge_votes_read on public.challenge_proof_votes for select to authenticated using (true);
drop policy if exists challenge_votes_owner_write on public.challenge_proof_votes;
create policy challenge_votes_owner_write on public.challenge_proof_votes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists challenge_comments_read on public.challenge_proof_comments;
create policy challenge_comments_read on public.challenge_proof_comments for select to authenticated using (true);
drop policy if exists challenge_comments_owner_write on public.challenge_proof_comments;
create policy challenge_comments_owner_write on public.challenge_proof_comments for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists challenge_comment_likes_read on public.challenge_comment_likes;
create policy challenge_comment_likes_read on public.challenge_comment_likes for select to authenticated using (true);
drop policy if exists challenge_comment_likes_owner_write on public.challenge_comment_likes;
create policy challenge_comment_likes_owner_write on public.challenge_comment_likes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.challenge_room_proofs, public.challenge_proof_votes, public.challenge_proof_comments, public.challenge_comment_likes to authenticated;
