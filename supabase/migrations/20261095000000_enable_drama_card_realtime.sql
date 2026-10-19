-- Keep already-open text cards synchronized with saved votes, outcomes,
-- and comments. Existing RLS remains unchanged.
do $$
declare drama_table text;
begin
  foreach drama_table in array array['drama_posts', 'drama_votes', 'drama_comments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = drama_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', drama_table);
    end if;
  end loop;
end $$;
