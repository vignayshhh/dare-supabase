# DARE Realtime policy

Updated: 2026-10-13

## Lifecycle contract

1. Create one channel per screen/resource scope.
2. Register only the table/filter needed by that scope.
3. Coalesce burst-triggered reloads with `scheduleRefresh` where payload-local
   reconciliation is not sufficient.
4. Mark the subscription inactive before removing its channel.
5. Cancel pending refresh work on unsubscribe.
6. Reconnect without creating duplicate active channels.

## Payload strategy

- Durable row changes should update local state from the payload when the row
  is complete and authorized.
- Use a bounded refresh when a change affects derived aggregates or a payload
  lacks required projection fields.
- Never treat a Realtime event as an authorization grant.
- Presence/Broadcast is for ephemeral state; durable messages, receipts,
  alerts, and views remain database-backed.

## Current implementation

`src/lib/realtime/scheduleRefresh.ts` coalesces burst refreshes and supports
cancellation. Birthday, community-challenge, impersonation, dare-comment,
conversation-game, and related listeners use it. Remaining collection
subscriptions are listed in `DB_READ_OPTIMIZATION_HOTSPOTS.md`.

Live duplicate-channel, reconnect, hidden-tab, and multi-user tests require a
staged Supabase/browser environment and are not claimed here.

