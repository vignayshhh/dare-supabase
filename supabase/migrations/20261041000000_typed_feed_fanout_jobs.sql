create table if not exists public.feed_fanout_jobs (
  id uuid primary key default gen_random_uuid(),
  operation text not null check(operation in ('upsert','delete')),
  kind text not null check(kind in ('post','truth','dare')),
  source_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  participant_ids uuid[] not null default '{}',
  audience uuid[] not null,
  event_created_at timestamptz not null,
  status text not null default 'pending' check(status in ('pending','processing','done','failed')),
  attempts integer not null default 0,
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);
create index if not exists feed_fanout_jobs_pending on public.feed_fanout_jobs(status,created_at) where status='pending';
alter table public.feed_fanout_jobs enable row level security;
create policy feed_fanout_jobs_service on public.feed_fanout_jobs for all to service_role using(true) with check(true);
grant all on public.feed_fanout_jobs to service_role;
create or replace function public.claim_feed_fanout_jobs(p_limit integer default 20)
returns setof public.feed_fanout_jobs language sql security definer set search_path=public as $$
  update public.feed_fanout_jobs set status='processing',attempts=attempts+1,updated_at=timezone('utc',now())
  where id in (select id from public.feed_fanout_jobs where status='pending' order by created_at asc for update skip locked limit greatest(1,least(p_limit,100)))
  returning *;
$$;
revoke all on function public.claim_feed_fanout_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_feed_fanout_jobs(integer) to service_role;
