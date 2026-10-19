-- Relational Dare interactions have active browser subscriptions but were
-- omitted from the publication when cut over from feature records.
do $$
declare interaction_table text;
begin
  foreach interaction_table in array array[
    'dare_comments', 'dare_comment_likes', 'dare_media_likes', 'dare_views'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = interaction_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', interaction_table);
    end if;
  end loop;
end $$;
