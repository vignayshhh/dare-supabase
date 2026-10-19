-- The room chat service subscribes to this durable table, but it was never
-- added to Supabase Realtime publication. That made successful inserts remain
-- invisible to already-open members until they manually reloaded.
do $$
begin
  alter publication supabase_realtime add table public.community_challenge_room_messages;
exception when duplicate_object then null; when undefined_object then null;
end $$;
