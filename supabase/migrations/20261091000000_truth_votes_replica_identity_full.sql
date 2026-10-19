-- Truth votes are upserted. Full row identity lets Realtime deliver both
-- INSERT and subsequent UPDATE payloads consistently to filtered channels.
alter table public.truth_votes replica identity full;
