-- SECURITY DEFINER functions inherit PUBLIC EXECUTE unless explicitly revoked.
-- Client RPCs must be callable only by their explicitly granted roles.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public', fn.signature);
  end loop;
end
$$;
