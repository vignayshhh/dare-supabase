alter table public.chat_invites add column if not exists legacy_key text;
alter table public.chat_invites add column if not exists inviter_name text;
alter table public.chat_invites add column if not exists invitee_name text;
alter table public.chat_invites add column if not exists original_participant_ids jsonb not null default '[]'::jsonb;
alter table public.chat_invites add column if not exists joined_at timestamptz;
alter table public.chat_invites add column if not exists entered_at timestamptz;
alter table public.chat_invites add column if not exists ended_at timestamptz;
alter table public.chat_invites add column if not exists updated_at timestamptz not null default timezone('utc', now());
create unique index if not exists chat_invites_legacy_key_uidx on public.chat_invites(legacy_key) where legacy_key is not null;
create index if not exists chat_invites_recipient_updated_idx on public.chat_invites(recipient_id, updated_at desc, id desc);
drop policy if exists invites_participants on public.chat_invites;
create policy invites_participants on public.chat_invites for all to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid() or exists (select 1 from public.conversation_members cm where cm.conversation_id = chat_invites.conversation_id and cm.user_id = auth.uid())) with check (sender_id = auth.uid() or recipient_id = auth.uid());
drop function if exists public.mark_chat_invite_entered_native(text, uuid);
create or replace function public.mark_chat_invite_entered_native(p_invite_id text, p_user_id uuid) returns public.chat_invites language plpgsql security definer set search_path = public as $$
declare v_row public.chat_invites;
begin
  update public.chat_invites set entered_at = coalesce(entered_at, timezone('utc', now())), updated_at = timezone('utc', now()) where (legacy_key = p_invite_id or id::text = p_invite_id) and recipient_id = p_user_id and status = 'ACCEPTED' returning * into v_row;
  if v_row.id is null then raise exception 'invite_not_found_or_unauthorized'; end if;
  return v_row;
end; $$;
revoke all on function public.mark_chat_invite_entered_native(text, uuid) from public;
grant execute on function public.mark_chat_invite_entered_native(text, uuid) to authenticated, service_role;
grant select, insert, update, delete on public.chat_invites to authenticated, service_role;

insert into public.chat_invites(legacy_key, conversation_id, sender_id, recipient_id, inviter_name, invitee_name, original_participant_ids, status, created_at, updated_at, joined_at, entered_at, ended_at)
select d.document_id, public.try_uuid(d.data->>'conversation_id'), public.try_uuid(d.data->>'inviter_id'), public.try_uuid(d.data->>'invitee_id'), d.data->>'inviter_name', d.data->>'invitee_name', coalesce(d.data->'original_participant_ids','[]'::jsonb), case lower(coalesce(d.data->>'status','pending')) when 'accepted' then 'ACCEPTED' when 'rejected' then 'DECLINED' when 'removed' then 'DECLINED' when 'left' then 'EXPIRED' else 'PENDING' end, coalesce(nullif(d.data->>'created_at','')::timestamptz, timezone('utc',now())), coalesce(nullif(d.data->>'updated_at','')::timestamptz, timezone('utc',now())), nullif(d.data->>'joined_at','')::timestamptz, nullif(d.data->>'entered_at','')::timestamptz, nullif(d.data->>'ended_at','')::timestamptz
from public.feature_chat_invites_records d
where public.try_uuid(d.data->>'conversation_id') is not null and public.try_uuid(d.data->>'inviter_id') is not null and public.try_uuid(d.data->>'invitee_id') is not null
on conflict do nothing;
