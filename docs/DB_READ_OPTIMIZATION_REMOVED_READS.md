# DARE removed-read inventory

Updated: 2026-10-13

These are source-level request-path reductions verified by code inspection. No
runtime request savings are implied until staged telemetry exists.

| Path | Previous pattern | Current pattern | Evidence |
| --- | --- | --- | --- |
| Birthday drop comment | insert → full reply `COUNT(*)` → parent update | insert → atomic `increment_birthday_drop_reply_count` RPC | comment API route + migration `20261076000000` |
| Birthday drop reaction | insert → full reaction `COUNT(*)` → parent update | atomic `add_birthday_drop_reaction` RPC | reaction API route + migration `20261076000000` |
| Friend stories | friendship read + stories read + views read + profile enrichment | bounded `get_friend_stories` RPC with projection | `StoryRepository.ts`, migration `20261076000000` grant |
| Friend-story author enrichment | second profile batch after feed query | reuse author fields returned by feed RPC | `story.service.ts` |
| Story audience views | story fetch included a second view read, then audience loaded all views | story existence projection + bounded viewer cursor page | `story.service.ts`, `StoryViewer.tsx` |
| Story audience reactions | fixed 500-row reaction load | stable bounded cursor pages with UI load-more | `story-reaction.service.ts`, `StoryViewer.tsx` |
| Story list view counts | transferred every matching view row and counted in JavaScript | grouped count RPC returns one row per story | `story.service.ts`, migration `20261081000000` |
| Owner story list viewers | repository fetched all viewer rows, then service fetched counts again | story metadata only + one grouped count RPC | `StoryRepository.ts`, `story.service.ts` |
| Dare batch counts | downloaded every view/comment row and counted in JavaScript | one grouped RPC per count type | `dare-interactions.service.ts`, migration `20261082000000` |
| Truth vote totals | downloaded every vote row and counted in JavaScript | grouped count RPC returns one row per truth | `TruthRepository.ts`, migration `20261083000000` |
| Community challenge join | read existing row → delete/upsert | row-locked `join_community_challenge` RPC | service + migration `20261077000000` |
| Challenge comment like | existence read → delete/insert | atomic `toggle_challenge_comment_like` RPC | service + existing migration `20261079000000_fix_function_lint` |
| Realtime refresh bursts | one reload per event | scheduled/coalesced reload with unsubscribe cancellation | realtime scheduler integrations |
| Friendship/comment collection reads | one unbounded list request | bounded page windows with stable ordering and `hasMore` page contracts | `FriendshipRepository.ts`, `dare-interactions.service.ts`, `comment.service.ts` |

## Explicit non-claims

- Static `.from()` counts are not request counts.
- Unapplied local migrations do not change the linked project.
- No before/after percentage is reported.
- Full audience/list reads that still need pagination are recorded as hotspots,
  not counted as removed.

