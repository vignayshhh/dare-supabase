# Dare messaging performance envelope

Mobile-only controlled QA. Not a production load test.

## Budget

- 24 durable messages, one `send_message` RPC each.
- Inbox refreshes: <=10 per client (coalesced, event-driven).
- Conversation message reads: <=4 per client (initial + bounded recovery).
- Realtime: <=9 messaging-scoped logical channels per open chat; <=16 total app channels; zero reconnects during stable burst.
- Live delivery p95 target: <2s. Recovery is allowed only after a live miss.

## Result (2026-10-15)

`tests/qa/messaging-performance-envelope.spec.ts`, `mobile-390`, A/B QA accounts:

```json
{
  "burstSize": 24,
  "missedLive": 0,
  "latencyMs": { "min": 310, "p50": 653, "p95": 1176, "max": 1223 },
  "calls": { "aInbox": 6, "bInbox": 6, "aMessages": 3, "bMessages": 2, "sends": 24 },
  "realtime": { "a": { "messagingChannels": 9, "sockets": 2, "opens": 2, "closes": 0 }, "b": { "messagingChannels": 9, "sockets": 2, "opens": 2, "closes": 0 } }
}
```

This replay had zero live misses and no reconnects. Message reads stayed bounded. Runtime introspection measured 9 messaging-scoped logical channels per client (inbox, self/peer presence/profile, typing, messages, events, conversation state). Global alerts/aura/community/truth/drama channels account for remaining app channels.

## Changes

- Inbox change notifications coalesce for 2.5s during bursts; this prevents one `get_inbox_page` read per message while retaining event-driven updates.
- `message_events` refreshes coalesce for 150ms.
- Existing failure-only exponential conversation recovery remains; no broad polling added.

## Latest replay (2026-10-15)

Inbox-wide typing and inactive-peer presence subscriptions were removed; typing/presence stay scoped to the open chat. Peer avatars now use cached one-shot profile loads rather than persistent Realtime channels. Mobile-390 A/B replay passed: 24 sends, zero live misses/reconnects, p50 602ms, p95 1458ms, inbox reads A6/B6, message reads A3/B2, 15/16 total channels for A and 16/16 for B, 8 messaging-scoped channels/client. Active-chat typing/presence regression passes (1/1, 12.9s).

## Receipt-change replay (2026-10-15)

After durable read-receipt plumbing, the controlled `mobile-390` A/B burst
passed (1/1, 20.0s): 24 sends, 0 live misses, p50 551ms, p95 657ms, inbox reads
A5/B5, message reads A2/B2, 8 messaging-scoped channels/client, 2 sockets each,
and no reconnects. The receipt change adds no polling or Realtime channel.

