create policy messages_delete_sender on public.messages
for delete to authenticated
using (sender_id = auth.uid());
