-- TruthVoteModal subscribes directly to public.truth_votes. Publish the
-- durable vote rows so open A/B Truth surfaces receive the live change.
do $$
begin
  alter publication supabase_realtime add table public.truth_votes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
