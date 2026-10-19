do $$
begin
  if to_regclass('public.feature_typing_indicators_records') is not null then
    if exists (select 1 from public.feature_typing_indicators_records limit 1) then
      raise exception 'typing_compatibility_rows_remaining';
    end if;
    drop table public.feature_typing_indicators_records;
  end if;
end $$;
