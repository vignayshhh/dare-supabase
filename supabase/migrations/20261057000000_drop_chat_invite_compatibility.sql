do $$
begin
  if to_regclass('public.feature_chat_invites_records') is not null then
    if exists (select 1 from public.feature_chat_invites_records limit 1) then
      raise exception 'chat_invite_compatibility_rows_remaining';
    end if;
    drop table public.feature_chat_invites_records;
  end if;
end $$;
