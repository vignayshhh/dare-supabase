-- Every remaining non-core feature gets its own physical table. The payload
-- column is intentionally limited to feature-specific fields; identity,
-- ownership and timestamps remain queryable columns in the authoritative core
-- tables or feature RPCs.
do $$
declare
  c text;
  t text;
  collections text[] := array[
    'aura_events','verdicts','verdict_votes','verdict_comments','drama_posts',
    'birthday_drops','birthday_drop_private','birthday_drop_comments','birthday_drop_reactions',
    'birthday_room_participants','birthday_party_snapshots','birthday_party_rooms',
    'community_challenge_summaries','community_challenge_joins','community_challenge_rooms',
    'challenge_room_proofs','challenge_proof_votes','challenge_proof_comments','challenge_comment_likes',
    'dare_views','dare_media_likes','dare_comments','dare_comment_likes','truth_comments',
    'dailyChallenges','cant_sleep_rooms','circles','relationships','close_friends',
    'override_votes','post_counters','presence','typing_indicators','rate_limits',
    'content_rate_limits','security_alerts','security_logs','account_lockouts','ip_blocks',
    'ip_attempts','bot_signals','bot_profiles','user_behavior','device_fingerprints',
    'device_history','two_factor_settings','password_history','spam_reports','user_reputation',
    'impersonation_sessions'
  ];
begin
  foreach c in array collections loop
    t := 'feature_' || regexp_replace(lower(c), '[^a-z0-9]+', '_', 'g') || '_records';
    execute format('create table if not exists public.%I (collection text not null, document_id text not null, data jsonb not null default ''{}''::jsonb, created_at timestamptz not null default timezone(''utc'',now()), updated_at timestamptz not null default timezone(''utc'',now()), primary key(collection,document_id))', t);
    execute format('create index if not exists %I_collection_updated on public.%I(collection,updated_at desc,document_id)', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_authenticated on public.%I', t || '_authenticated', t);
    execute format('create policy %I_authenticated on public.%I for all to authenticated using (true) with check (true)', t || '_authenticated', t);
    execute format('grant select,insert,update,delete on public.%I to authenticated,service_role', t);
    execute format('insert into public.%I(collection,document_id,data,created_at,updated_at) select collection,document_id,data,created_at,updated_at from public.data_documents where collection=$1 or collection like $2 on conflict(collection,document_id) do update set data=excluded.data,updated_at=excluded.updated_at', t) using c, c || '/%';
    delete from public.data_documents where collection=c or collection like c || '/%';
  end loop;
end $$;
