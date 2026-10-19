# Circle group-chat resource QA — 2026-10-17

## Scope and safety boundary

- Tested the Chat List **Circle group chat** with the authorized A, B, and C QA accounts only.
- No security testing was performed.
- A clearly named disposable QA Circle fixture was created through the normal Circle invitation flow because the three accounts did not already share one. Fixture ID: `7abf5951-37dc-4ecc-9e57-6e4a35446019`.
- The workload used 36 durable text messages: 12 each from A, B, and C, sequentially rotated to remain below the product's per-sender rate limit. Each send was required to arrive live at both other participants.

## Industry approach used

The implementation follows the official Supabase guidance to use Broadcast for high-frequency/fire-and-forget events rather than Presence, which is explicitly unsuitable for high-frequency updates. Normal Circle messages are one durable database write followed by one private database-originated Broadcast. They do not create per-recipient inbox rows, receipt rows, notifications, polling requests, or Presence updates.

Supabase bills Broadcast as one sent message plus one message received by each subscribed client. Consequently, a three-member room inherently costs three Realtime messages per chat message (one send plus two deliveries); attempting to hide that fan-out would sacrifice live delivery. The client therefore keeps exactly one private Circle channel while the room is visible and closes it when hidden.

Sources: [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Supabase Presence](https://supabase.com/docs/guides/realtime/presence), [Supabase Realtime message usage](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages), and [Supabase Realtime concepts](https://supabase.com/docs/guides/realtime/concepts).

## Actual before/after measurement

The measurement was performed in headed Chromium mobile-390 contexts against the linked main Supabase project. The test instruments real browser requests, RPC calls, active Supabase channels, WebSocket frames/bytes, delivery latency, history reads, and connection closes. It is implemented in `tests/qa/circle-chat-resource-envelope.spec.ts`.

| Metric | Before | After | Result |
| --- | ---: | ---: | --- |
| A/B/C messages | 36 | 36 | All live-delivered to both other members |
| Standalone `circles?select=chat_epoch` reads | 2 per client / 6 total | 0 per client / 0 total | Eliminated on normal room entry |
| Circle history reads | 1 per client | 1 per client | One bounded 40-message snapshot, unchanged |
| `send_circle_chat` calls | 12 per sender | 12 per sender | One durable write per authored message |
| Active Circle channels | 1 per client | 1 per client | No channel growth under the burst |
| Reconnects/closes during workload | 0 | 0 | No reconnect churn |
| Live delivery p95 | 301 ms | 326 ms | Comparable sub-second delivery; network variance, not a throughput regression |

WebSocket byte/frame totals are retained in Playwright output as observed transport diagnostics, but are not used as a performance-percent claim because background application channels and heartbeats vary between runs. The deterministic Supabase database reduction is six eliminated authenticated REST reads for the three-client room entry, without replacing them with polling or another query.

## Change made

`CircleRepository.list()` now includes `chat_epoch` in the already-required Circle list payload. `useCircleChat` passes that cached epoch to `circleChatService.topic()` for the ordinary room open, so no additional topic lookup is needed. If membership changes, the database sends the existing `rotate` Broadcast and the hook intentionally performs one fresh epoch lookup before reconnecting. This preserves the membership-safe topic rotation behavior.

Changed implementation files:

- `src/backend/repositories/CircleRepository.ts`
- `src/middleware/services/circle-chat.service.ts`
- `src/components/circles/useCircleChat.ts`
- `src/components/circles/CircleChatScreen.tsx`

## Verification completed

- Targeted ESLint: passed.
- `npm run type-check`: passed after the Circle-chat change.
- Headed A/B/C Circle resource workload: passed after the change.
- Existing Circle chat continues to use a private Broadcast channel, a bounded initial history page, optimistic UUID deduplication, visibility-driven unsubscribe, and a read only for explicit older-history pagination.

## Messaging compatibility finding

The attempted direct-message regression suite found that the A/B direct inbox row is absent in fresh QA browser profiles, so its ten desktop tests could not reach their first chat action. This was not caused by the Circle-chat epoch optimization. Investigation found an outdated request-context exception that omitted the active Circle header for direct inbox/read RPCs even though conversations are now Circle-scoped. `src/lib/circleContext.ts` was corrected to attach the active Circle header to those RPCs as well.

The follow-up diagnosis captured the raw `get_inbox_page` response: both A and B contained the newly created direct conversation with the correct peer profiles. The issue was the store lifecycle, not missing database data. `AuthenticatedApp` had started the messaging subscription before Circle bootstrap completed and never restarted it after an active Circle existed. It now waits for a ready active Circle; the visible A/B fixture regression passes and `npm run type-check` plus targeted lint pass.

The remaining live-delivery root cause was the direct-message client's use of Postgres Changes. Circle-scoped table RLS requires the active HTTP Circle header, which database-change authorization cannot receive. Migration `20261203000000_broadcast_direct_message_delivery.sql` changes direct-message mutations to a single private database-originated Broadcast on the already member-authorized `conversation-messages:<conversationId>` topic; the client now consumes that compact event instead of Postgres Changes. This avoids the fragile authorization mismatch and removes the more expensive Postgres Changes subscription.

The migration was applied to the linked main database. The formerly failing durable A→B→A delivery/reload test passed visibly. The core direct-message regression suite then passed on both desktop and mobile-390: delivery/reload, mood/freeze persistence, and bidirectional typing/presence (6/6). The delivery run used exactly one `send_message` RPC per sender and two bounded inbox reads per side. No reload fallback or polling was added.

## Final deployed verification

After the direct-message Broadcast migration, the full A/B/C Circle workload was rerun visibly on mobile-390 against the linked database. It again passed all 36 messages with zero standalone epoch reads, one history read per client, one Circle room channel per client, and no connection closes. Observed delivery p95 was 423 ms (network-dependent and still sub-second). Linked migration history confirmed `20261203000000_broadcast_direct_message_delivery.sql` is applied.

The final direct-message safety gate was also green:

- 6/6 desktop and mobile-390 runs: durable A↔B delivery/reload, mood/freeze persistence, bidirectional typing/presence.
- 14/14 desktop and mobile-390 runs: replies/read receipt, photo delivery/reload, failed-upload retry, URL refresh, cancellation, media-size rejection, and Games/temporary-invite surfaces.
