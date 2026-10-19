create policy message_user_hides_insert_own
  on public.message_user_hides
  for insert
  to authenticated
  with check (user_id = auth.uid());
