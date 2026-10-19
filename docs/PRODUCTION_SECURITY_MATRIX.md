# Dare production security matrix

This document records the authorization model used by the Supabase schema and
the remaining migration boundary. It is a contract for API and database work;
UI checks are never the security boundary.

| Resource | Anonymous | Owner | Accepted friend | Participant | Admin |
| --- | --- | --- | --- | --- | --- |
| Profile public fields | No | Read/write | Read when public/friend-visible | N/A | Read/write through server tools |
| Profile private fields | No | Read/write | No | N/A | Server-only |
| Posts and media | No | Read/write | Read when `PUBLIC` or `FRIENDS` | N/A | Moderation path only |
| Comments/replies | No | Read/write own | Read/write when parent is visible | N/A | Moderation path only |
| Reactions/multi-like | No | Create/update own | React when parent is visible | N/A | Server counters only |
| Stories/views | No | Create/update/delete own | Read active friend-visible stories | N/A | Server cleanup/moderation |
| Dares/truths/proofs | No | Participant access | Public/friend visibility where configured | Creator/receiver/voter rules | Moderation path only |
| Conversations/messages | No | Read/write own messages | No | Read/write as member | Server moderation only |
| Receipts/typing/presence | No | Own state | Intended presence audience | Conversation/room members | Server tools only |
| Alerts | No | Read/update own recipient rows | No | N/A | Server-created only |
| Challenges/birthday rooms | No | Own entries | Public or member access | Room membership required | Server cleanup/moderation |
| Reports/moderation | No | Create/read own report | No | N/A | Admin only |

The first schema migration contains dedicated relational tables and
feature-specific policies. Later forward migrations cut over feed, identity,
stories, conversations/messages, alerts, dares/truths, moderation, Aura,
fan-out, and birthday interactions. Migration `20261048000000` guarded and
removed the empty `data_documents` table; it is no longer an application data
source. `app_documents` and `feature_records` remain response-shaping views
for a small set of transitional service interfaces, backed by native tables
only. New features must use dedicated tables or authorized server routes; they
must not add arbitrary client-readable document collections.

Security tests must run with owner, accepted friend, unrelated user,
anonymous, and admin identities, both through API routes and direct Supabase
requests. Hosted staging and load-test results remain unverified until those
environments are configured.
