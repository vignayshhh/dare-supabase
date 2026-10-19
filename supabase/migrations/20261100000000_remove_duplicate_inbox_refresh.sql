-- A message insert already broadcasts inbox_changed to every conversation
-- member. send_message then updates the conversation timestamp, so retaining
-- the conversations trigger causes a second full inbox refresh for the same
-- logical message. Membership changes remain covered by the client channel's
-- conversation_members subscription.
drop trigger if exists conversations_broadcast_inbox_change on public.conversations;
