# Dare Playwright QA

The suite uses the running local server by default (`http://localhost:3000`) and never starts a second server. Failures retain screenshots plus HTML and JSON results in ignored artifact directories. Playwright trace/video retention is deliberately disabled because authenticated traces can serialize local sign-in input values.

Create ignored `.env.qa.local` with `DARE_QA_RUN_ID` and A/B/C `EMAIL`, `PASSWORD`, and `USERNAME`. Credentials are loaded locally and must never be committed or copied to reports. To guarantee a no-write run even when local config contains write flags, explicitly set `DARE_QA_ALLOW_WRITES=false` and every `DARE_QA_ALLOW_*_ONCE=false` flag in the shell. Write-capable suites require `DARE_QA_ALLOW_WRITES=true`; each bounded write additionally requires its deliberate one-shot flag.

The user explicitly expanded the mock-content budget on 2026-10-14. The follow-up fixture set used fresh `DARE_QA_RUN_ID` values and created one feed post, image Story, Truth/answer, Verdict/vote, direct Dare/image-proof lifecycle, and one each of Deal/Rumour/Promise/Custom drama cards. Keep future writes similarly bounded and uniquely marked; do not delete retained QA records without separate approval. The per-user post-create limiter is intentionally respected; a burst can return 429 and must not be bypassed.

```powershell
$env:DARE_QA_CHROMIUM_EXECUTABLE = "C:\\path\\to\\chrome.exe" # only if needed
npm run qa:e2e
```

The bounded realtime write requires an explicit one-shot gate:

```powershell
$env:DARE_QA_ALLOW_WRITES = "true"
$env:DARE_QA_ALLOW_REALTIME_WRITE_ONCE = "true"
npx playwright test tests/qa/realtime-feed-cross-account.spec.ts --project=chromium-desktop
```

The expanded fixture checks are individually gated and can be run one at a time:

```powershell
$env:DARE_QA_ALLOW_WRITES = "true"
$env:DARE_QA_RUN_ID = "20261014-expansion"
$env:DARE_QA_ALLOW_DARE_PROOF_WRITE_ONCE = "true"
npx playwright test tests/qa/dare-proof-submission.spec.ts --project=chromium-desktop
```

The bounded Dare-refusal fixture is separately gated:

```powershell
$env:DARE_QA_ALLOW_WRITES = "true"
$env:DARE_QA_ALLOW_DARE_CHICKEN_OUT_ONCE = "true"
npx playwright test tests/qa/dare-chicken-out.spec.ts --project=chromium-desktop
```

The active community proof and cross-account vote fixture is separately gated:

```powershell
$env:DARE_QA_ALLOW_WRITES = "true"
$env:DARE_QA_ALLOW_COMMUNITY_PROOF_WRITE_ONCE = "true"
npx playwright test tests/qa/community-proof-vote-cross-account.spec.ts --project=chromium-desktop
```

The bounded cross-account Story interaction check (one reaction and one reply) is separately gated:

```powershell
$env:DARE_QA_ALLOW_WRITES = "true"
$env:DARE_QA_ALLOW_STORY_INTERACTION_WRITE_ONCE = "true"
npx playwright test tests/qa/story-reaction-reply-cross-account.spec.ts --project=chromium-desktop
```

The reversible owner-profile display-name check is also one-shot-gated. It restores the exact starting value before finishing:

```powershell
$env:DARE_QA_ALLOW_WRITES = "true"
$env:DARE_QA_ALLOW_PROFILE_EDIT_WRITE_ONCE = "true"
npx playwright test tests/qa/profile-edit-cross-account.spec.ts --project=chromium-desktop
```

Drama-card creation is also one-shot-gated; the retained records can be replayed without writes:

```powershell
$env:DARE_QA_ALLOW_WRITES = "true"
$env:DARE_QA_ALLOW_DRAMA_WRITE_ONCE = "true"
npx playwright test tests/qa/drama-card-types.spec.ts --project=chromium-desktop
npx playwright test tests/qa/drama-card-types-read.spec.ts --project=chromium-desktop
```

To replay the already-created sample without another database write, set `DARE_QA_REALTIME_MARKER` to the marker recorded in `docs/QA/DARE_REALTIME_LATENCY.csv` and leave write flags disabled.

Install the matching browser with `npx playwright install chromium` when needed. HTML reports are in `playwright-report/`; JSON is in `test-results/results.json`.

The retained two-image carousel can be replayed without creating another post. The
read test asserts loaded signed images, working arrows, no horizontal overflow, and
zero accidental like requests on desktop and all three mobile widths. The focused
write check adds exactly two intentional double-tap likes and compares B's persisted
per-user count with A's independent read.

```powershell
npx playwright test tests/qa/feed-image-carousel.spec.ts --grep "B reads" --project=chromium-desktop --project=mobile-360 --project=mobile-390 --project=mobile-430
$env:DARE_QA_ALLOW_WRITES = "true"
npx playwright test tests/qa/feed-image-carousel.spec.ts --grep "intentional media double-taps" --project=chromium-desktop
```

Audio/video creation uses one retained tiny synthetic fixture per type. Read-only
replays assert signed URLs, native controls, actual muted playback progress, and
mobile overflow. The delete suite creates only an explicitly disposable text post
when none exists, then deletes every matching retry row and verifies A/B absence.

```powershell
$env:DARE_QA_ALLOW_WRITES = "true"
$env:DARE_QA_ALLOW_POST_WRITE_ONCE = "true"
npx playwright test tests/qa/feed-audio.spec.ts tests/qa/feed-video.spec.ts --project=chromium-desktop
npx playwright test tests/qa/feed-delete.spec.ts --project=chromium-desktop

$env:DARE_QA_ALLOW_WRITES = "false"
npx playwright test tests/qa/feed-audio.spec.ts tests/qa/feed-video.spec.ts --grep "B reads the retained playable" --project=mobile-360 --project=mobile-390 --project=mobile-430
npx playwright test tests/qa/feed-post-options.spec.ts --project=chromium-desktop
```

Verdict comments/results and the reversible hold-to-undo cycle reuse the retained
A-authored/B-voted fixture. The undo test always restores B's Keep vote before it
finishes.

```powershell
$env:DARE_QA_ALLOW_WRITES = "true"
$env:DARE_QA_ALLOW_VERDICT_WRITE_ONCE = "true"
npx playwright test tests/qa/verdict-comments-results.spec.ts tests/qa/verdict-vote-undo.spec.ts --project=chromium-desktop
```

The 2026-10-15 follow-up tests use the same general write gate. An explicit
`DARE_QA_ALLOW_WRITES=false` skips all seven recent direct-Dare/Custom vote,
comment, and media-like checks; that skip behavior has been executed.

```powershell
# Eight marked future-due fixtures at most: four kinds by each of A and B.
$env:DARE_QA_ALLOW_WRITES = "true"
$env:DARE_QA_ALLOW_DRAMA_WRITE_ONCE = "true"
npx playwright test tests/qa/drama-four-kind-votes.spec.ts --project=chromium-desktop

# Reuse one retained Custom card for 20 live updates, with rate-limit pacing.
$env:DARE_QA_LIVE_VOTE_CYCLES = "10"
npx playwright test tests/qa/drama-vote-live.spec.ts --project=chromium-desktop

# Read-only deadline movement using a ticking clock in the test browser.
# Requires the four B-authored audience-vote fixtures to still be future-due
# at the host clock when the test starts. Backend timestamps are not changed.
npx playwright test tests/qa/drama-deadline-transition.spec.ts --project=chromium-desktop
```

The four-kind suite creates missing fixtures through the authenticated application
API, then uses physical UI vote controls and independent account readback. Replays
reuse those records. The 390x844 run verifies saved selected states and counts;
initial writes were tested on desktop. Custom vote/undo/opposite-choice writes
were separately exercised at 390x844. Tests hide only the Next development-tools
portal when it covers mobile navigation; they do not force text-card action clicks.

The live-vote timing samples in
`docs/QA/DARE_TEXT_CARD_REALTIME_RESULTS.json` measure successful-response-to-visible
latency on one host clock. They do not satisfy or replace the separate feed-post
publication timing series. Traces remain disabled to avoid retaining credentials.

Retained fixtures can expire. `community-room-read.spec.ts` reads the actual
membership status and proof deadline before choosing Active/Completed/Eliminated.
The retained Story viewer test skips when a successful friend feed contains no
unexpired A Story; run the gated creation test for fresh media coverage. A skip is
not a new viewer pass. `friendship-received.spec.ts` opens main alerts and pages
older history through the rendered Load older alerts control.

Close Friends Story creation is separately gated. It uses A's normal profile/search
UI to add B when needed, publishes through `Post to Close Friends`, asserts the
persisted audience returned to B, and opens the media. The read-only replay reuses
the retained 24-hour fixture across mobile widths without creating another Story.

```powershell
$env:DARE_QA_ALLOW_WRITES = "true"
$env:DARE_QA_ALLOW_STORY_WRITE_ONCE = "true"
npx playwright test tests/qa/story-close-friends.spec.ts --grep "A publishes" --project=chromium-desktop --headed
npx playwright test tests/qa/story-close-friends.spec.ts --grep "B reopens" --project=mobile-360 --project=mobile-390 --project=mobile-430
```

Messaging reliability uses two authenticated browser contexts. Delivery creates two
fresh marked messages (one each direction); Mood Block/freeze changes are reversible
and the test leaves both cleared/unfrozen. Presence/typing performs no message write.

```powershell
$env:DARE_QA_ALLOW_WRITES = "true"
$env:DARE_QA_ALLOW_MESSAGE_WRITE_ONCE = "true"
npx playwright test tests/qa/messaging-delivery.spec.ts tests/qa/messaging-state-persistence.spec.ts tests/qa/messaging-typing-presence.spec.ts --project=chromium-desktop --headed
npx playwright test tests/qa/messaging-delivery.spec.ts tests/qa/messaging-state-persistence.spec.ts tests/qa/messaging-typing-presence.spec.ts --project=mobile-390 --headed
npx playwright test tests/qa/messaging-reply-read.spec.ts --project=chromium-desktop --headed
npx playwright test tests/qa/messaging-reply-read.spec.ts --project=mobile-390 --headed
npx playwright test tests/qa/messaging-photo-delivery.spec.ts --project=chromium-desktop --headed
npx playwright test tests/qa/messaging-photo-delivery.spec.ts --project=mobile-390 --headed
npx playwright test tests/qa/messaging-menu-surfaces.spec.ts --project=chromium-desktop --project=mobile-390 --headed
```
