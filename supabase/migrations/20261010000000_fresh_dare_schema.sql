-- Fresh Dare backend. This migration imports no legacy provider data.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = timezone('utc', now()); return new; end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null default '',
  avatar_url text,
  bio text not null default '' check (char_length(bio) <= 500),
  visibility text not null default 'PUBLIC' check (visibility in ('PUBLIC','PRIVATE')),
  followers_count integer not null default 0 check (followers_count >= 0),
  following_count integer not null default 0 check (following_count >= 0),
  posts_count integer not null default 0 check (posts_count >= 0),
  current_aura integer not null default 100,
  lifetime_aura integer not null default 100,
  has_completed_profile_creation boolean not null default false,
  is_18_plus boolean not null default false,
  consent_accepted boolean not null default false,
  is_online boolean not null default false,
  last_active_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create unique index profiles_username_ci_key on public.profiles (lower(username));

create table public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null,
  notification_preferences jsonb not null default '{"challenges":true,"messages":true,"friendRequests":true}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','DECLINED','BLOCKED')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (requester_id <> addressee_id)
);
create unique index friendships_unique_pair on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_status_created on public.friendships(addressee_id, status, created_at desc);
create index friendships_requester_status_created on public.friendships(requester_id, status, created_at desc);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key(blocker_id, blocked_id), check (blocker_id <> blocked_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  visibility text not null default 'PUBLIC' check (visibility in ('PUBLIC','FRIENDS','PRIVATE')),
  metadata jsonb not null default '{}'::jsonb,
  reaction_count integer not null default 0 check (reaction_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index posts_feed_index on public.posts(created_at desc, id desc);
create index posts_author_index on public.posts(author_id, created_at desc);

create table public.post_media (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null, object_path text not null, media_type text not null,
  width integer, height integer, duration_ms integer, created_at timestamptz not null default timezone('utc', now()),
  unique(bucket_id, object_path)
);
create table public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null default 'LIKE', taps integer not null default 1 check (taps between 1 and 50),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  primary key(post_id, user_id, reaction)
);
create table public.post_comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade, parent_id uuid references public.post_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000), reaction_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create index post_comments_post_created on public.post_comments(post_id, created_at);

create table public.stories (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '', media_bucket text, media_path text, visibility text not null default 'PUBLIC' check (visibility in ('PUBLIC','FRIENDS','PRIVATE')),
  expires_at timestamptz not null, created_at timestamptz not null default timezone('utc', now())
);
create index stories_active_index on public.stories(expires_at, created_at desc);
create table public.story_views (story_id uuid not null references public.stories(id) on delete cascade, viewer_id uuid not null references public.profiles(id) on delete cascade, viewed_at timestamptz not null default timezone('utc', now()), primary key(story_id, viewer_id));
create table public.story_reactions (story_id uuid not null references public.stories(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, reaction text not null, created_at timestamptz not null default timezone('utc', now()), primary key(story_id,user_id,reaction));

create table public.dares (
  id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid references public.profiles(id) on delete set null, title text not null, body text not null default '',
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','SUBMITTED','COMPLETED','REJECTED','EXPIRED')),
  visibility text not null default 'FRIENDS' check (visibility in ('PUBLIC','FRIENDS','PRIVATE')),
  expires_at timestamptz, submitted_at timestamptz, completed_at timestamptz, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create index dares_receiver_status on public.dares(receiver_id,status,created_at desc);
create index dares_creator_created on public.dares(creator_id,created_at desc);
create table public.dare_proofs (id uuid primary key default gen_random_uuid(), dare_id uuid not null references public.dares(id) on delete cascade, submitter_id uuid not null references public.profiles(id) on delete cascade, body text not null default '', bucket_id text, object_path text, created_at timestamptz not null default timezone('utc', now()));
create table public.dare_votes (dare_id uuid not null references public.dares(id) on delete cascade, voter_id uuid not null references public.profiles(id) on delete cascade, vote text not null check(vote in ('APPROVE','REJECT')), created_at timestamptz not null default timezone('utc',now()), primary key(dare_id,voter_id));

create table public.truths (
  id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.profiles(id) on delete cascade, receiver_id uuid references public.profiles(id) on delete set null,
  question text not null, answer text, status text not null default 'OPEN' check(status in ('OPEN','ANSWERED','EXPIRED')), visibility text not null default 'FRIENDS' check(visibility in ('PUBLIC','FRIENDS','PRIVATE')),
  created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now())
);
create index truths_receiver_status on public.truths(receiver_id,status,created_at desc);
create table public.truth_votes (truth_id uuid not null references public.truths(id) on delete cascade, voter_id uuid not null references public.profiles(id) on delete cascade, vote text not null, created_at timestamptz not null default timezone('utc',now()), primary key(truth_id,voter_id));
create table public.predictions (id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id) on delete cascade, body text not null, closes_at timestamptz, verdict text, created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now()));
create table public.prediction_votes (prediction_id uuid not null references public.predictions(id) on delete cascade, voter_id uuid not null references public.profiles(id) on delete cascade, vote text not null, created_at timestamptz not null default timezone('utc',now()), primary key(prediction_id,voter_id));

create table public.conversations (
  id uuid primary key default gen_random_uuid(), kind text not null default 'DIRECT' check(kind in ('DIRECT','GROUP','GAME','BIRTHDAY','CANT_SLEEP')), title text,
  last_message_at timestamptz, created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now())
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'MEMBER' check(role in ('OWNER','MEMBER')), joined_at timestamptz not null default timezone('utc',now()), last_read_at timestamptz,
  primary key(conversation_id,user_id)
);
create index conversation_members_user on public.conversation_members(user_id,joined_at desc);
create table public.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade, sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '', media_bucket text, media_path text, reply_to_id uuid references public.messages(id) on delete set null, deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now())
);
create index messages_conversation_cursor on public.messages(conversation_id,created_at desc,id desc);
create table public.message_receipts (message_id uuid not null references public.messages(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, delivered_at timestamptz, read_at timestamptz, primary key(message_id,user_id));
create table public.chat_invites (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade, sender_id uuid not null references public.profiles(id) on delete cascade, recipient_id uuid not null references public.profiles(id) on delete cascade, status text not null default 'PENDING' check(status in ('PENDING','ACCEPTED','DECLINED','EXPIRED')), created_at timestamptz not null default timezone('utc',now()), check(sender_id <> recipient_id));

create table public.alerts (
  id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id) on delete cascade, actor_id uuid references public.profiles(id) on delete set null,
  type text not null, payload jsonb not null default '{}'::jsonb, read_at timestamptz, created_at timestamptz not null default timezone('utc',now())
);
create index alerts_recipient_unread on public.alerts(recipient_id,read_at,created_at desc);
create table public.aura_events (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, delta integer not null, reason text not null, source_type text, source_id uuid, created_at timestamptz not null default timezone('utc',now()));

create table public.daily_challenges (id uuid primary key default gen_random_uuid(), challenge_date date not null unique, title text not null, body text not null default '', metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default timezone('utc',now()));
create table public.daily_challenge_entries (challenge_id uuid not null references public.daily_challenges(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, status text not null default 'JOINED', proof jsonb not null default '{}'::jsonb, created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now()), primary key(challenge_id,user_id));
create table public.community_challenges (id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.profiles(id) on delete cascade, title text not null, body text not null default '', status text not null default 'OPEN', deadline_at timestamptz, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now()));
create table public.community_challenge_members (challenge_id uuid not null references public.community_challenges(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, joined_at timestamptz not null default timezone('utc',now()), primary key(challenge_id,user_id));

create table public.birthday_rooms (id uuid primary key default gen_random_uuid(), birthday_user_id uuid not null references public.profiles(id) on delete cascade, title text not null, expires_at timestamptz not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default timezone('utc',now()));
create table public.birthday_room_members (room_id uuid not null references public.birthday_rooms(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, joined_at timestamptz not null default timezone('utc',now()), primary key(room_id,user_id));

create table public.reports (id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id) on delete cascade, subject_type text not null, subject_id uuid not null, reason text not null, detail text, status text not null default 'OPEN' check(status in ('OPEN','REVIEWING','RESOLVED','DISMISSED')), created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now()));
create table public.moderation_actions (id uuid primary key default gen_random_uuid(), admin_id uuid not null references public.profiles(id) on delete restrict, target_user_id uuid references public.profiles(id) on delete set null, action text not null, reason text, created_at timestamptz not null default timezone('utc',now()));
create table public.rate_limit_events (id uuid primary key default gen_random_uuid(), scope text not null, subject_hash text not null, created_at timestamptz not null default timezone('utc',now()));
create index rate_limit_events_scope_subject_created on public.rate_limit_events(scope,subject_hash,created_at desc);
create table public.cache_entries (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  expires_at timestamptz,
  updated_at timestamptz not null default timezone('utc',now())
);
create index cache_entries_expiry on public.cache_entries(expires_at);
alter table public.cache_entries enable row level security;
revoke all on public.cache_entries from anon, authenticated;

-- Transitional document adapter for legacy feature services. It is still fresh
-- Supabase data, never a legacy sync/import. Feature tables above remain the
-- source of truth for new code while older handlers are converted safely.
create table public.data_documents (
  collection text not null,
  document_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key(collection, document_id)
);
create index data_documents_collection_updated on public.data_documents(collection, updated_at desc);
alter table public.data_documents enable row level security;
create policy data_documents_authenticated on public.data_documents for all to authenticated using(true) with check(true);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare v_username text;
begin
  v_username := lower(coalesce(nullif(new.raw_user_meta_data->>'username',''), 'user_' || replace(left(new.id::text, 8),'-','')));
  insert into public.profiles(id,username,display_name,bio)
  values(new.id,v_username,coalesce(new.raw_user_meta_data->>'display_name',''),coalesce(new.raw_user_meta_data->>'bio',''));
  insert into public.profile_private(user_id,email) values(new.id,coalesce(new.email,''));
  return new;
exception when unique_violation then
  raise exception 'username is unavailable';
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;
create or replace function public.are_friends(a uuid,b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.friendships f where f.status='ACCEPTED' and ((f.requester_id=a and f.addressee_id=b) or (f.requester_id=b and f.addressee_id=a)))
$$;
create or replace function public.is_conversation_member(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.conversation_members where conversation_id=c and user_id=auth.uid())
$$;
create or replace function public.can_view_profile(target uuid) returns boolean language sql stable security definer set search_path = public as $$
  select target=auth.uid() or exists(select 1 from public.profiles p where p.id=target and (p.visibility='PUBLIC' or public.are_friends(auth.uid(),target)))
$$;

create or replace function public.sync_post_reaction_count() returns trigger language plpgsql security definer set search_path = public as $$
declare v_post uuid := coalesce(new.post_id,old.post_id); begin
  update public.posts set reaction_count=(select coalesce(sum(taps),0)::integer from public.post_reactions where post_id=v_post) where id=v_post; return coalesce(new,old);
end; $$;
create trigger post_reactions_count after insert or update or delete on public.post_reactions for each row execute function public.sync_post_reaction_count();
create or replace function public.sync_post_comment_count() returns trigger language plpgsql security definer set search_path = public as $$
declare v_post uuid := coalesce(new.post_id,old.post_id); begin
  update public.posts set comment_count=(select count(*) from public.post_comments where post_id=v_post) where id=v_post; return coalesce(new,old);
end; $$;
create trigger post_comments_count after insert or delete on public.post_comments for each row execute function public.sync_post_comment_count();

create or replace function public.submit_dare_proof(p_dare_id uuid,p_body text,p_bucket_id text default null,p_object_path text default null) returns public.dare_proofs language plpgsql security invoker set search_path=public as $$
declare v_proof public.dare_proofs; begin
  update public.dares set status='SUBMITTED',submitted_at=timezone('utc',now()) where id=p_dare_id and receiver_id=auth.uid() and status in ('PENDING','ACCEPTED') returning id into p_dare_id;
  if not found then raise exception 'Dare cannot be submitted'; end if;
  insert into public.dare_proofs(dare_id,submitter_id,body,bucket_id,object_path) values(p_dare_id,auth.uid(),p_body,p_bucket_id,p_object_path) returning * into v_proof;
  return v_proof;
end; $$;

create or replace function public.finish_dare(p_dare_id uuid) returns public.dares language plpgsql security invoker set search_path=public as $$
declare v_dare public.dares; begin
 update public.dares set status='COMPLETED',completed_at=timezone('utc',now()) where id=p_dare_id and (creator_id=auth.uid() or receiver_id=auth.uid()) and status='SUBMITTED' returning * into v_dare;
 if not found then raise exception 'Dare cannot be completed'; end if; return v_dare; end; $$;

-- Keep update timestamps uniform.
do $$ declare t text; begin
  foreach t in array array['profiles','profile_private','friendships','posts','post_reactions','post_comments','dares','truths','predictions','conversations','messages','daily_challenge_entries','community_challenges','reports'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_comments enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.story_reactions enable row level security;
alter table public.dares enable row level security;
alter table public.dare_proofs enable row level security;
alter table public.dare_votes enable row level security;
alter table public.truths enable row level security;
alter table public.truth_votes enable row level security;
alter table public.predictions enable row level security;
alter table public.prediction_votes enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_receipts enable row level security;
alter table public.chat_invites enable row level security;
alter table public.alerts enable row level security;
alter table public.aura_events enable row level security;
alter table public.daily_challenges enable row level security;
alter table public.daily_challenge_entries enable row level security;
alter table public.community_challenges enable row level security;
alter table public.community_challenge_members enable row level security;
alter table public.birthday_rooms enable row level security;
alter table public.birthday_room_members enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.rate_limit_events enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (public.can_view_profile(id));
create policy profiles_update_own on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy private_own on public.profile_private for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy friendships_participants on public.friendships for select to authenticated using (requester_id=auth.uid() or addressee_id=auth.uid());
create policy friendships_create on public.friendships for insert to authenticated with check (requester_id=auth.uid());
create policy friendships_update on public.friendships for update to authenticated using (requester_id=auth.uid() or addressee_id=auth.uid()) with check (requester_id=auth.uid() or addressee_id=auth.uid());
create policy blocks_own on public.blocks for all to authenticated using (blocker_id=auth.uid()) with check (blocker_id=auth.uid());
create policy posts_read on public.posts for select to authenticated using (visibility='PUBLIC' or author_id=auth.uid() or (visibility='FRIENDS' and public.are_friends(author_id,auth.uid())));
create policy posts_write_own on public.posts for all to authenticated using (author_id=auth.uid()) with check (author_id=auth.uid());
create policy post_media_read on public.post_media for select to authenticated using (exists(select 1 from public.posts p where p.id=post_id and (p.visibility='PUBLIC' or p.author_id=auth.uid() or (p.visibility='FRIENDS' and public.are_friends(p.author_id,auth.uid())))));
create policy post_media_write_own on public.post_media for all to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy post_reactions_read on public.post_reactions for select to authenticated using (true);
create policy post_reactions_own on public.post_reactions for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy comments_read on public.post_comments for select to authenticated using (exists(select 1 from public.posts p where p.id=post_id and (p.visibility='PUBLIC' or p.author_id=auth.uid() or (p.visibility='FRIENDS' and public.are_friends(p.author_id,auth.uid())))));
create policy comments_own on public.post_comments for all to authenticated using (author_id=auth.uid()) with check (author_id=auth.uid());
create policy stories_read on public.stories for select to authenticated using (expires_at>timezone('utc',now()) and (visibility='PUBLIC' or author_id=auth.uid() or (visibility='FRIENDS' and public.are_friends(author_id,auth.uid()))));
create policy stories_own on public.stories for all to authenticated using (author_id=auth.uid()) with check (author_id=auth.uid());
create policy story_views_own on public.story_views for all to authenticated using (viewer_id=auth.uid()) with check (viewer_id=auth.uid());
create policy story_reactions_own on public.story_reactions for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy dares_participants on public.dares for select to authenticated using (creator_id=auth.uid() or receiver_id=auth.uid() or visibility='PUBLIC');
create policy dares_create on public.dares for insert to authenticated with check (creator_id=auth.uid());
create policy dares_update_participants on public.dares for update to authenticated using (creator_id=auth.uid() or receiver_id=auth.uid()) with check (creator_id=auth.uid() or receiver_id=auth.uid());
create policy dare_proofs_participants on public.dare_proofs for select to authenticated using (exists(select 1 from public.dares d where d.id=dare_id and (d.creator_id=auth.uid() or d.receiver_id=auth.uid())));
create policy dare_proofs_submitter on public.dare_proofs for insert to authenticated with check (submitter_id=auth.uid());
create policy dare_votes_own on public.dare_votes for all to authenticated using (voter_id=auth.uid()) with check (voter_id=auth.uid());
create policy truths_participants on public.truths for select to authenticated using (creator_id=auth.uid() or receiver_id=auth.uid() or visibility='PUBLIC');
create policy truths_create on public.truths for insert to authenticated with check (creator_id=auth.uid());
create policy truths_update_participants on public.truths for update to authenticated using (creator_id=auth.uid() or receiver_id=auth.uid()) with check (creator_id=auth.uid() or receiver_id=auth.uid());
create policy truth_votes_own on public.truth_votes for all to authenticated using (voter_id=auth.uid()) with check (voter_id=auth.uid());
create policy predictions_read on public.predictions for select to authenticated using (true);
create policy predictions_own on public.predictions for all to authenticated using (author_id=auth.uid()) with check(author_id=auth.uid());
create policy prediction_votes_own on public.prediction_votes for all to authenticated using(voter_id=auth.uid()) with check(voter_id=auth.uid());
create policy conversations_members on public.conversations for select to authenticated using(public.is_conversation_member(id));
create policy conversation_members_members on public.conversation_members for select to authenticated using(public.is_conversation_member(conversation_id));
create policy messages_members on public.messages for select to authenticated using(public.is_conversation_member(conversation_id));
create policy messages_send on public.messages for insert to authenticated with check(sender_id=auth.uid() and public.is_conversation_member(conversation_id));
create policy messages_update_sender on public.messages for update to authenticated using(sender_id=auth.uid()) with check(sender_id=auth.uid());
create policy receipts_own on public.message_receipts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy invites_participants on public.chat_invites for all to authenticated using(sender_id=auth.uid() or recipient_id=auth.uid()) with check(sender_id=auth.uid() or recipient_id=auth.uid());
create policy alerts_recipient on public.alerts for select to authenticated using(recipient_id=auth.uid());
create policy alerts_recipient_update on public.alerts for update to authenticated using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());
create policy aura_own on public.aura_events for select to authenticated using(user_id=auth.uid());
create policy daily_challenges_read on public.daily_challenges for select to authenticated using(true);
create policy daily_entries_own on public.daily_challenge_entries for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy community_read on public.community_challenges for select to authenticated using(true);
create policy community_create on public.community_challenges for insert to authenticated with check(creator_id=auth.uid());
create policy community_update_own on public.community_challenges for update to authenticated using(creator_id=auth.uid()) with check(creator_id=auth.uid());
create policy community_members_own on public.community_challenge_members for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy birthday_members on public.birthday_rooms for select to authenticated using(exists(select 1 from public.birthday_room_members m where m.room_id=id and m.user_id=auth.uid()) or birthday_user_id=auth.uid());
create policy birthday_membership_own on public.birthday_room_members for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy reports_create on public.reports for insert to authenticated with check(reporter_id=auth.uid());
create policy reports_read_own on public.reports for select to authenticated using(reporter_id=auth.uid() or public.is_admin());
create policy moderation_admin on public.moderation_actions for select to authenticated using(public.is_admin());
revoke all on public.rate_limit_events from anon, authenticated;

-- Private media buckets. New uploads are always owned by the authenticated user.
insert into storage.buckets (id,name,public) values ('avatars','avatars',false),('post-media','post-media',false),('story-media','story-media',false),('chat-media','chat-media',false),('dare-proofs','dare-proofs',false) on conflict (id) do nothing;
create policy storage_owner_read on storage.objects for select to authenticated using (owner_id=auth.uid()::text);
create policy storage_owner_insert on storage.objects for insert to authenticated with check (owner_id=auth.uid()::text);
create policy storage_owner_update on storage.objects for update to authenticated using(owner_id=auth.uid()::text) with check(owner_id=auth.uid()::text);
create policy storage_owner_delete on storage.objects for delete to authenticated using(owner_id=auth.uid()::text);

-- Durable live tables. Ephemeral typing/presence uses private Broadcast/Presence channels.
alter publication supabase_realtime add table public.messages, public.alerts, public.dares, public.truths, public.stories, public.posts;

-- Private Realtime channels: authenticated users only. Durable row policies
-- still govern database reads; ephemeral payloads carry no trusted identity.
create policy realtime_authenticated_read on realtime.messages for select to authenticated using (auth.uid() is not null);
create policy realtime_authenticated_send on realtime.messages for insert to authenticated with check (auth.uid() is not null);
