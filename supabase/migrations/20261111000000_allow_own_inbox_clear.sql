-- Clear Chat only changes the caller's own inbox metadata.
create policy conversation_members_update_own_inbox
on public.conversation_members
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
