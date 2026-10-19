# Contextual Circle chat

Implementation and research notes, 17 October 2026.

## Product flow

Chat list → active Circle group chat → hold any saved message (or use its accessible more button) → existing category creator → normal category entry plus a linked chat card. The source message is attached by a database trigger in the same transaction that creates the interaction. A failed create cannot leave an orphan chat card.

Cards open the normal category card components and actions. Dares and Truths route participants to Received/Sent, with the original quote available; other members use the existing profile detail destination. Predictions, Deals and Promises use the existing Drama card components. Source receipts are available on demand and do not query the database while scrolling past cards.

Ordinary messages produce no alerts. Existing Dare/Truth alerts remain in their normal creation flows. Prediction subjects receive an action alert. Deal/Promise counterparties receive confirmation requests; self commitments need no second participant. Group agreements ask the other Circle members to confirm. Resolution cannot occur while a required confirmation is pending or declined. Confirmation actions appear in both the normal category card and Received. Social interaction alerts use the existing alert store and navigation.

The previous Jail implementation is a local visual prototype. Shared Jail cases now persist separately, appear in Circle Jail and chat, and use the existing Court stickman visual vocabulary. The voting rule shown in the UI is a strict majority of the Circle at creation, a 24-hour deadline, ties dismissed, and a six-hour social sentence. Members can change votes until resolution. New members cannot retroactively join an existing electorate. This is a social game state, not an account restriction. No new Aura reward or penalty is invented; existing category resolution/Aura functions continue to apply. Completed category interactions and resolved Jail cases appear in Memories.

## Supabase design and cost envelope

Supabase recommends Broadcast for database changes when scalability matters. Postgres Changes performs authorization work for subscribers and processes changes in order on a single thread. A database-triggered private Broadcast lets this feature send a deliberately small payload rather than refreshing the conversation for every event. Sources: [subscription guidance](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes), [Postgres Changes limitations](https://supabase.com/docs/guides/realtime/postgres-changes), [Broadcast](https://supabase.com/docs/guides/realtime/broadcast).

Implemented request budget:

| Action | Client database operations |
| --- | --- |
| Chat-list Circle entry | None; reuse loaded Circle registry |
| Open/reconnect group chat | Topic lookup + latest 40-message page |
| Send text | One RPC; one durable row; returned canonical message |
| Receive text | Merge Broadcast payload; no refetch/profile lookup |
| Retry uncertain send | Same UUID RPC; returns existing row |
| Earlier history | One indexed page of 40 using `seq < cursor` |
| Status update in active chat | Compact status patch; no refetch |
| Read original context from a normal card | One joined query, only after explicit tap |
| Hidden/background chat | Channel removed; no chat polling |

This is an architectural request budget, not a measured production throughput claim. Supabase also bills/limits Realtime delivery and egress: one Broadcast delivered to many connected members is not one free message. Database broadcasts add Realtime infrastructure work. See [Realtime pricing](https://supabase.com/docs/guides/realtime/pricing) and [benchmarks](https://supabase.com/docs/guides/realtime/benchmarks). Do not equate fewer client requests with zero server cost.

Messages are stored once per Circle, not once per recipient. Membership is inherited from the Circle. There are no durable typing writes, per-message read-receipt rows, per-message inbox updates, presence heartbeats, or ordinary-message notification fan-outs. Sender names are snapshotted once at send time, avoiding a profile request per bubble. Text is bounded to 2,000 characters, cards to 240 characters. History uses an index on `(circle_id, seq DESC)` rather than deep offsets. The live tail is bounded; older history is fetched only on demand.

Realtime is a delivery optimization; Postgres is authoritative. Subscribe before snapshot, merge by UUID, and buffer events during hydration. Reconnect refreshes the latest page, including statuses that changed while hidden. Earlier history remains available through pagination. Sending is optimistic, but failed sends retain an explicit Retry action. The client never claims delivery solely because a local bubble exists.

Private topics use the Circle ID and a rotating membership epoch. Circle membership changes rotate the epoch; already-connected former members do not receive future message content on the old topic. The current topic is authorized against membership. Clients do not publish authoritative messages. Supabase documents that channel authorization is cached, so topic rotation matters here: [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).

Further scale work should follow measurements: record payload bytes, connected subscribers per room, deliveries per send, p95 RPC latency, database CPU/WAL and Realtime lag. Avoid a blanket “lowest possible usage” claim: larger rooms, offline sync needs, unread badges, retention, and message attachments change the tradeoffs. Do not add polling or full-room reloads to mask a delivery bug.

## Mobile visual direction

Dare already uses dark ink surfaces, strong category colours, rounded controls and expressive stickman characters. The chat keeps that language, with a violet Circle entry, quiet translucent bubbles, small category-colour cards, a two-column action picker and a Court stickman behind bars after a guilty verdict.

Research: [Material expressive motion](https://m3.material.io/styles/motion/overview/how-it-works), [Apple motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion), [Android spring animation](https://developer.android.com/develop/ui/views/animations/spring-animation). These support responsive state feedback, spatial continuity and restrained spring behaviour; they do not establish that a particular animation makes a product addictive.

Applied motion decisions: immediate text entry; 110–130 ms press feedback; a 240 ms picker entrance with slight settling; a 280 ms bar-drop on a newly shown Jail cell; no infinite chat shimmer, auto-playing sound or animation per ordinary message. Long press cancels after a 9 px movement so scrolling stays effortless. The picker uses a native modal dialog for focus containment, Escape handling and backdrop isolation. Reduced-motion removes the decorative transforms and entrance animations. The more button exposes the same action to keyboard and assistive-technology users.

## Rollout and validation

Apply the three migrations after the existing Circle migrations, in filename order. The feature needs the schema and private Realtime policies before the frontend is used. Existing records keep a null source reference. No backfill fabricates chat history.

Per user instruction: finish implementation before QA; use QA accounts A/B, C only if required. Security testing is deferred. Validation must cover normal create → category → alert/Received → resolution behaviour, chat-card/source persistence, message retry/reconnect, mobile layout and reduced motion. Results belong in a separate QA report; this document does not assert that those checks have passed.
