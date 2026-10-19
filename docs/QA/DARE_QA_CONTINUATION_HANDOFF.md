# Dare QA Continuation Handoff

Updated: 2026-10-16

## Authoritative remaining work (2026-10-16)

Use this section over older queues below; they are retained as run history.

### Actual remaining

1. **Messaging media:** expired retained signed-URL A/B recovery passed mobile-390 1/1. Upload-cancel passed mobile-390 1/1 (held upload, cancel removes optimistic item and prevents send). Physical 100 MB+ browser-file rejection passed mobile-390 1/1 with zero storage POSTs.
2. **Messaging resource envelope:** latest controlled 24-message mobile-390 burst passed under the QA budget (0 live misses; p50 560 ms; p95 1,500 ms; A/B inbox reads 6/6; message reads 3/2; 8 messaging channels/client; 2 sockets/client; 0 reconnects; no broad polling). Supabase linked database/traffic evidence is collected. This is controlled client QA, not a production load test.
3. **Community:** fresh mobile proof/vote passed 1/1; proof comment persisted cross-account passed 1/1; room chat passed 1/1; retained lifecycle read passed 1/1. Disposable lifecycle fixture now has server rows for active/completed/eliminated and `batch_status=started`; mobile-390 lifecycle replay passed 3/3 (active run, completed-user next-batch surface, eliminated-user next-batch surface). Server deadline guard now rejects proof inserts after expiry/elimination; direct linked check passed. Remaining: removal/moderation. Current Community Room has no member-removal/moderation control to replay; admin moderation endpoint exists separately and security/admin authorization is postponed. Fresh mobile join and A->B batch activation pass; join RPC defect is fixed in migration `20261115000000_fix_community_join_value_arity.sql`.
4. **Story / Dare / Truth / Verdict:** Story dedication/image/existing-viewer suite passed 3/3; Story Close Friends create/reopen passed 2/2; expired Story exclusion from `get_friend_stories` passed linked SQL check; direct Dare Fake audience vote passed mobile-390 1/1 after reel-scroll fix; fresh Truth ask/accept/answer passed 1/1; fresh Verdict comment/reply/readback passed 1/1. Truth/Verdict currently have no time-expiry state. Existing core flows remain covered: Story reaction/reply; Dare proof/review/chicken-out; Truth refusal plus creator alert; Verdict create/vote/comment/reply/undo/revote.
5. **Text cards:** server deadline/outcome enforcement now passed all 4 kinds (Prediction, Deal, Rumour, Promise) in one mobile-390 API replay; browser-clock outcome transition passed 2/2. Promise/Rumour reply persistence, fresh Prediction comment persistence, and Custom choice undo/revote/readback all passed mobile-390. No known text-card edge remains.

6. **Community moderation/removal:** proof reporting now exists for persisted UUID-backed proofs and passed mobile-390 1/1; member-removal/moderator action UI remains absent. The separate admin moderation route is authorization/security-gated and was not exercised per user instruction; member removal is the remaining product-surface gap.

### Explicitly deferred / out of scope

- Multi-photo grid/viewer: user deferred; do not treat as current work.
- Security/authorization audit: user postponed.
- Check-in: does not exist; ignore.

## Final continuation evidence

- Upload failure stays local and has explicit retry; refreshed signed URLs are cached for 55 minutes to avoid repeated refresh reads.
- Mobile-390 passed: photo delivery/reload/viewer + forced failure/retry; Truth A/B refusal alert; Story reaction/reply; Dare chicken-out; Verdict vote/remove/revote; community join and batch activation.
- `npm run type-check` passed after implementation changes.
- `npm run audit:supabase` passed: 334 files scanned; 453 table reads, 85 RPC calls, 65 channels, 49 Postgres-change subscriptions, 43 intervals, 0 compatibility reads/writes/subscriptions.
- Mobile-390 additional replay: text-card deadline transition 2/2; Story Close Friends create/reopen 2/2; Dare audience vote 1/1; Truth vote/comment 1/1; Community proof/vote 1/1; proof comment 1/1; room chat 1/1; lifecycle read 1/1.
- Messaging now exposes `Cancel photo upload` for optimistic uploads; cancellation prevents a late upload completion from sending a message.
- Community lifecycle read passed 1/1. Join/batch tests correctly found retained accounts already joined, so `Join Current Batch` was unavailable; fresh disposable lifecycle fixture is still required.
- Community QA selectors now handle `Joined Community Dare`, `Replace proof`, duplicate challenge cards, countdown remounts, retained-proof fallback, and authenticated-session reuse.
- New unit checks passed 2/2: expired signed URL refresh is cached to one storage call; >100 MB message media is rejected before upload.
- Direct mobile server-deadline test passed 1/1: a future Prediction cannot resolve (HTTP 400). Browser-clock outcome transition passed 2/2.
- Expanded `drama-server-deadline-enforcement.spec.ts` passed mobile-390 1/1: future Prediction, Deal, Rumour, and Promise all created successfully but server rejected resolution with HTTP 400.
- Migration `20261116000000_enforce_community_proof_deadlines.sql` deployed. It blocks `challenge_room_proofs` inserts for eliminated/expired memberships; disposable linked SQL rejection check passed.
- Fresh Prediction comment persistence replay passed mobile-390 1/1 after creating an isolated card; server comment write and feed readback both persisted the exact marker.
- Custom choice edge replay passed mobile-390 1/1: A selected choice one, removed it, selected choice two, reloaded, and B read the durable choice-two vote.
- Direct Dare Fake audience vote passed mobile-390 1/1 after forcing the second reel card into view.
- Fresh Truth ask/accept/answer passed mobile-390 1/1; fresh Verdict comment/reply/readback passed mobile-390 1/1.
- Disposable expired Story fixture was excluded by linked `get_friend_stories` SQL check; fixture is retained for QA evidence.
- Community proof report control passed mobile-390 1/1; mock proof rows are intentionally not reportable because their IDs are non-UUID placeholders.
- Browser signed-URL replay passed mobile-390 1/1 with a deliberately expired intercepted stored URL and successful rendered recovery.
- Mobile cancel replay passed 1/1 with a deliberately held storage upload; physical >100 MB rejection passed 1/1 with zero storage writes.
- Disposable Community lifecycle SQL fixture (`DARE-QA-LIFECYCLE-20261016`, plus official e03 join rows) records active/completed/eliminated members and a started batch. `community-lifecycle-states.spec.ts` passed mobile-390 3/3; completed/eliminated accounts also rendered the running-batch/next-batch surface.
- Fresh custom Community creation was attempted; API creation works, but B cannot discover the friends-only custom challenge in the current retained account relationship. A fresh discoverable fixture (or authorized friend relationship) is required.
- Community custom-dare API now persists a matching `community_challenge_summaries` row; broad discoverability was intentionally not enabled because custom challenges remain friends-scoped.
- Linked Supabase inspect evidence (2026-10-16): database 25 MB, indexes 3,328 kB, tables 1,144 kB, WAL 112 MB, index/table hit rates 1.00/1.00. Active connections stayed below 15/60 per role. Traffic profile is write-heavy for Realtime subscription (28,621 writes), message receipts (128,680), and cache entries (10,817); query calls are dominated by `realtime.list_changes` (242,227 calls, 49.8% total execution time). This is baseline/dashboard evidence, not a production load test; continued Realtime/resource tuning remains required.
- Disposable fixture is retained for QA evidence; do not delete without approval. It supplies the lifecycle rows above; production-scale deadline/removal/moderation remains unverified.
- Messaging read receipts now coalesce burst arrivals into one `mark_conversation_read` write per 250 ms window; the RPC advances all receipts through the newest message. Type-check passed after this change.

## Historical continuation update (2026-10-15; superseded)

Use **Authoritative remaining work** and later evidence below; this section records earlier fixture failures only.

- **Messaging attachment edges (mobile-390):** repaired failed image uploads to
  remain local with an explicit `Retry photo upload` action. It makes no automatic
  retry/request. An expired stored signed media URL now refreshes once through the
  existing signed-URL helper and is cached for 55 minutes, so rendering remains
  event-driven and does not poll. Fresh failure-then-retry A/B replay passed 2/2
  in 25.1s (single-photo delivery/reload/viewer plus forced first-upload failure
  and one explicit retry).
- **Mobile Community/Truth edge replay:** current retained fixtures changed state.
  Account A is already `Joined` to the batch-activation fixture, so the expected
  `Join Current Batch` control is correctly unavailable. Its retained room is not
  openable in the current lifecycle, which blocked proof/comment/chat fixture
  tests before write assertions. A legacy Truth marker is absent. A fresh Truth
  refusal returned success/`REJECTED`, but the expected creator alert text did not
  render in the follow-up notification read; this needs a scoped alert-payload/UI
  investigation. These are not passes and no broad retry loop was run.
- **Truth refusal repair:** investigation found the refusal API wrote the Truth
  state/feed event but omitted the required `TRUTH_REFUSED` creator alert. It now
  creates that alert with navigation and actor metadata. The QA assertion was also
  corrected to open the Dare alert organizer rather than the Social tab. Fresh
  mobile-390 A/B refusal/creator-alert replay passed 1/1 in 21.1s.
- **Story edges:** mobile-390 exercised Close Friends audience delivery/reopen,
  dedication and normal image stories, editor persistence, and reaction plus
  marked reply delivered into A's chat. Suite passed 7/7 after making the QA
  Like selector exact (it previously also matched `Dislike story`).
- **Direct Dare edges:** fresh mobile proof/review lifecycle completed in the
  targeted run. Fresh refusal returned HTTP 200 and durable `CHICKEN_OUT` state.
  The center-action long-press test was made faithful to the current 800ms mobile
  hold threshold (the old 550ms synthetic hold did not open the chooser).
- **Verdict edges:** fresh mobile creation/media/vote cross-account and retained
  mobile read passed 2/2 after the same 800ms test-hold correction. The separate
  retained comment/results replay still assumes a historical `100% · 1` fixture
  state and is not current evidence; provision a fresh isolated comment fixture.
- **Community repair:** fresh official Community joins failed with PostgreSQL
  `42601`: `join_community_challenge` declared `completed_at` but omitted its
  value. Migration `20261115000000_fix_community_join_value_arity.sql` repairs
  the RPC and is deployed. Mobile-390 B join passed 1/1 (5.9s), then A batch
  activation passed 1/1 (6.7s). Active-room proof/vote and chat ran after that;
  the comment test must run after its proof fixture, not alphabetically before it.
- **Verdict undo repair:** retained cards share historic titles and can reorder
  after a vote, so undo coverage now creates its own unique image Verdict. Mobile
  A/B create → B Keep → hold-remove → re-vote → reload passed 1/1 in 15.6s.

- **Mobile-only QA from this point:** use `mobile-360`, `mobile-390`, or
  `mobile-430`. Historical desktop evidence remains historical only; do not use
  desktop as UI acceptance evidence.
- Security/Account-C adversarial testing remains deferred. Functional temporary
  invite QA is allowed and already passed on mobile-390.
- **Text cards:** current-build A/B mobile-390 vote/readback passed for
  Prediction, Deal, Rumour, and Promise (2/2). Card rendering passed at all
  three phone widths (3/3). Remaining: outcome/creator-result lifecycle and
  comment/edge-choice coverage where exposed.
- **Messaging deletion:** Delete-for-everyone is sender-only durable soft delete
  and passed mobile-390. Delete-for-me is now durable: migrations
  `20261112000000_persist_per_user_message_hides.sql` and
  `20261113000000_allow_own_message_hides.sql` add per-user hides and an
  authenticated membership-validated RPC. Mobile-390 A/B replay passed 1/1
  (27.5s): hidden after A reload; still visible to B.
- **Messaging lifecycle:** mobile-390 passes: reply/read (1/1, 10.7s),
  menu surfaces (3 widths, 3/3), temporary invite (1/1, 17.6s), and game
  lifecycle (1/1, 10.4s; first activation correctly waits for players).
- **Resource envelope:** latest mobile-390 24-message A/B burst passed:
  0 live misses/reconnects; p50 602ms; p95 1458ms; inbox reads A6/B6;
  message reads A3/B2; 8 messaging-scoped channels/client; total channels
  A15/B16. No polling added. Inbox typing and inactive-peer presence are gone;
  active-chat typing/presence remains shared/event-driven. Peer avatars use a
  5-minute one-shot cache rather than persistent Realtime subscriptions.
- This is controlled QA, not a production load test. Next performance work:
  capture Supabase dashboard/resource evidence under the documented budget.
- **Check-in:** explicitly excluded from QA scope; it is not an app feature.

## Historical mobile queue (superseded)

This is retained run history. Use **Authoritative remaining work** above for current scope.

1. Run Prediction/Deal/Rumour/Promise outcome lifecycles and text-card comments.
2. Continue message status, upload-failure and URL-refresh checks. Multi-photo/
   viewer QA is explicitly deferred. Do not broad-poll.
3. Run focused mobile regressions after each edit; retain explicit write gates.
4. Do not resume security testing unless the user re-authorizes it.

### Queue execution update

- Deal expired-outcome A/B lifecycle passed on `mobile-390` (1/1, 25.3s):
  creator resolved `IT HAPPENED`; recipient saw durable `Deal Won` after reload.
- Outcome-test navigation now targets the **visible** bottom-nav Feed control and
  hides the Next development overlay only in the test. Previously the overlay
  intercepted phone taps and a hidden cached screen could be selected.
- Prediction, Rumour, and Promise expired-fixture creation was rate-limited by
  `/api/drama` (HTTP 429) after the authorized burst. Do not retry in a loop.
  Resume after the configured API window clears, one test at a time. These are
  inconclusive fixture-creation runs, not outcome failures.
- Retained-fixture text-card reply persistence passed on `mobile-390` (2/2,
  16.6s): B posted a Rumour reply and a Promise reply; each survived reload.
- Fresh messaging photo A→B live delivery, recipient reload, and fullscreen viewer
  passed on `mobile-390` (1/1, 9.9s).
- A subsequent mobile delete rerun did not start: Account A stayed on the normal
  Sign in screen with `Signing in...` for 15 seconds. No deletion assertion ran;
  treat this as a transient auth/backend availability condition and do not retry
  rapidly. Prior passing delete evidence remains the current result.
- Auth recovered for a read-only mobile message diagnostic (1/1, 10.6s): A/B
  durable message reads returned HTTP 200. The diagnostic now reports only
  status/query/row count; it no longer prints response bodies or signed URLs.
- After recovery, fresh Delete-for-me A/B/reload mobile-390 replay passed (1/1,
  9.6s).
- Fresh Delete-for-everyone A→B live/reload mobile-390 replay passed (1/1,
  14.9s).
- After the API window recovered, expired-card outcome A/B mobile-390 lifecycles
  passed: Prediction (1/1, 11.9s), Rumour (1/1, 21.3s), Promise (1/1, 20.9s),
  plus the earlier Deal pass. Each creator result persisted to the recipient
  after reload.
- Current-build `mobile-390` messaging state/presence regressions passed (2/2):
  bidirectional Mood Block/freeze persistence and bidirectional typing/online
  indicators. This confirms active-chat Realtime behavior remains intact after
  channel reductions.
- **Read-status repair:** the UI previously changed the newest sent message to
  `Seen` on a 2.2-second timer, without a recipient receipt. That timer is
  removed. `get_inbox_page` now returns durable member read timestamps and
  last-seen message IDs. Mobile-390 A/B regression passed (1/1, 16.9s): B
  opened A's fresh message, then A reloaded and rendered `Seen`; reply/reload
  persistence still passed. Receipt refresh remains event-driven and has no
  polling or new channel.
- Live receipt follow-up passed on `mobile-390` (1/1, 13.1s): recipient read
  RPC broadcasts on the already-open shared conversation-state channel, so the
  sender changes to `Seen` live. No new channel or poll was added.
- Receipt-change resource replay passed on `mobile-390` (1/1, 20.0s): 24 sends,
  zero misses, p50 551ms/p95 657ms, inbox reads A5/B5, message reads A2/B2,
  and 8 messaging channels/client.
- Custom-card live vote removal/revote passed with both A/B cards open on
  `mobile-390` (1/1, 14.9s): B reconciled A's removal in 1340ms and re-vote in
  1339ms, without reload.
- Current-build four-kind text-card vote/readback suite passed on `mobile-390`
  (2/2): A→B and B→A Prediction, Deal, Rumour, and Promise votes persisted.
- Durable message Seen/reply/read regression also passed at `mobile-360` and
  `mobile-430` (2/2); phone-width coverage is now 360/390/430.
- Read-only messaging composer, conversation, and menu-surface diagnostics
  passed all phone widths (9/9: 360/390/430).
- Current text-card rendering/read regression passed all phone widths (3/3):
  Deal, Rumour, Promise, and Custom retained cards render at 360/390/430.
- Public Dare vote-surface and navigation diagnostics passed all phone widths
  (6/6), with no console/page errors, bad API responses, or error boundary.
  The known Chromium-only avatar `ERR_BLOCKED_BY_ORB` remains non-product noise.
- A three-width retained-community read replay was interrupted by the known
  transient Account-B `Signing in...` stall at mobile-390. No community
  assertion failed; do not retry the auth flow rapidly.
- Local regression after the receipt work: Jest passed 11 suites / 32 tests.

This is the operational handoff for continuing the authenticated, main-development
database QA effort in a new chat. It records what was actually exercised, what was
fixed and deployed, and what remains. Do not treat a feature as complete merely
because it appears in the application UI.

## Operating scope and standing decisions

- The product under test is the Dare app in this repository.
- QA uses real authenticated accounts against the linked main Supabase development
  database. Account A and Account B are the principal test pair. Guest mode is
  explicitly out of scope.
- The user authorized bounded test content, synthetic media, database migrations,
  test accounts, and database fixes. Use unique `DARE-QA-...` markers and retain
  fixtures unless a test explicitly creates a disposable record and removes it.
- Account-C security probing is deferred. Do not claim Account-C authorization or
  security coverage. A normal third-account functional lifecycle may be used only
  if needed for a deliberately scoped feature test such as temporary chat invites.
- Intentional product behavior: a user may add multiple likes to a friend's feed
  post. Do not report repeat likes as a defect or change them into one-like-per-user.
- Do not use or test guest mode.
- Do not expose `.env.qa.local`, Supabase keys, credentials, JWTs, or Playwright
  traces. Playwright trace/video stays disabled because sign-in values can be
  serialized.
- The worktree is materially dirty. Preserve unrelated user changes. Use
  `apply_patch` for edits; do not reset or broadly clean the repository.

## How to observe the visible browser

- QA was run with Playwright `--headed`, so the browser is visible on the desktop
  while a test is running.
- The user asked how to watch in real time. Start headed tests one at a time; the
  same visible Chrome window shows every click, typing action, and route transition.
- Browser automation bridge availability has been inconsistent, so the reliable
  workflow is headed Playwright rather than guest/browser-preview mode.

## QA infrastructure and gates

Relevant files:

- `playwright.config.ts` defines desktop Chrome and 360/390/430 mobile viewports.
- `tests/qa/helpers.ts` signs into named accounts and handles onboarding.
- `tests/qa/qa-env.ts` reads local-only `.env.qa.local` and enforces write gates.
- `tests/qa/README.md` documents reproducible commands.
- `docs/QA/DARE_QA_REPORT.md` is the broad chronological report.
- `docs/QA/DARE_QA_RESULTS.json` is the machine-readable result ledger.
- `docs/QA/DARE_FEATURE_INVENTORY.md` tracks feature breadth.

Core gates used for authorized bounded messaging writes:

```powershell
$env:DARE_QA_ALLOW_WRITES = "true"
$env:DARE_QA_ALLOW_MESSAGE_WRITE_ONCE = "true"
```

Do not print local configuration values. New write tests must explicitly skip unless
their relevant gate is on; credentials alone must never enable writes.

## How the QA was performed, step by step

This section is deliberately procedural. It explains the repeatable investigation
method used throughout this chat rather than merely listing conclusions.

### 1. Establish a controlled authenticated test environment

1. Work from the repository root and inspect the existing QA harness, test files,
   local environment-gate loader, Playwright projects, services, stores, screens,
   migrations, and current QA documentation.
2. Do not use guest mode. Create isolated Playwright browser contexts for the
   configured QA accounts so each account has independent cookies, Realtime sockets,
   local storage, presence state, and UI state.
3. For each context, visit the app root, skip only the cosmetic launch experience,
   sign in through the normal UI with the local account configuration, and complete
   onboarding only if that specific account still shows it.
4. Use A and B as independent actors. Keep one account on the receiving feature
   screen before the other performs a write; that distinguishes true realtime
   propagation from a later reload/readback.
5. Use uniquely timestamped `DARE-QA-<run-id>-...` markers in any bounded text
   write. This prevents false positives from historic retained fixtures and lets
   evidence be located in the database/UI without exposing account data.
6. Run test files headed where visible manual observation matters. The headed Chrome
   window was the live desktop evidence of the same clicks/typing that Playwright
   performed. Use a single worker to avoid accidentally overlapping A/B writes.
7. Apply write gates only for the current bounded suite. When read-only coverage is
   desired, all explicit write gates remain false so a credential cannot silently
   mutate the main development database.

### 2. Read-first feature discovery

Before writing a new regression or altering product code, the process was:

1. Find the rendered entry point and service/store path using repository search.
2. Inspect the UI control, its accessible name/selector, event handler, data call,
   client-side optimistic update, subscription, and reload/readback path.
3. Inspect migrations and database RPC contracts for native columns, defaults,
   trigger side effects, and authorization rules.
4. Decide the smallest bounded end-to-end assertion that proves the actual user
   behavior. A visual UI shell alone is never treated as feature completion.
5. Where a feature mutates persistent shared data, use one marker or one synthetic
   image rather than bulk-generating fixtures. Exceptions were explicitly authorized
   by the user for fixtures needed for broad text-card/community work.
6. Capture network requests where useful: for example, tests counted RPC calls,
   awaited their HTTP response, and compared a recipient's independent UI.
7. Reload one or both independent sessions after the live assertion. This separates
   transient optimistic rendering from durable database persistence.

### 3. Baseline application QA and breadth expansion

1. Existing authenticated tests were first run/read to understand prior coverage and
   fixture requirements; write gates were respected.
2. Feature areas were expanded in user-requested priority: posts/feed/likes,
   Dare workflows, community challenges, Truth/Verdict/Story, Prediction/Rumour/
   Promise/Deal/Custom cards, alerts, then messaging.
3. For each feature, tests normally used the normal rendered application route:
   compose or open from the UI, perform the intended action, observe A/B evidence,
   reload, and assert the durable result.
4. Synthetic tiny images/audio/video were used for media coverage so upload/readback
   could be verified without introducing personal content. Actual `<img>`, `<audio>`,
   and `<video>` loading/playback was checked rather than accepting a merely present
   placeholder element.
5. Desktop coverage was the first proving ground. When the same behavior was
   relevant on phones, it was replayed at the defined 360x800, 390x844, and/or
   430x932 projects. A test marked mobile-passed is an actual mobile-viewport
   execution, not a responsive-design assumption.

### 4. How confirmed defects were handled

For every confirmed defect, the workflow was:

1. Preserve the smallest failure artifact possible: Playwright failure screenshot,
   locator/error context, network status, visible UI state, or a precisely scoped
   diagnostic log.
2. Trace from the visible symptom backward through the component, store/service,
   API/RPC, database schema/function/trigger, and Realtime authorization/publication
   path.
3. Do not change behavior solely on suspicion. Make a repair only after the actual
   break point is identified, such as a missing Realtime topic authorization,
   incorrect RPC auth context, stale signed URL, event bubbling, schema mismatch,
   or duplicate trigger.
4. Make the smallest safe code/migration change. Use a new migration for linked
   database schema/function/trigger/policy changes; push it only after inspecting
   its scope. Do not overwrite unrelated migrations.
5. Rerun the original failing scenario headed. Then run the independent reload/
   recipient/mobile regression appropriate to the feature.
6. Run TypeScript checking, focused ESLint, JSON validation for QA artifacts, and
   scoped whitespace checks. Broader test suites were run when the change's surface
   area required them.
7. Update the human-readable report, result ledger, inventory/README as applicable,
   explicitly preserving caveats and untested states.

### 5. Chronological execution details by major feature area

#### Feed, post interaction, and media execution

1. Authenticated A/B sessions opened the normal Feed. A created/selected bounded
   QA records; B independently rendered them while the screen remained open.
2. Repeat likes were exercised via deliberate separate actions/double taps. The
   count increments were then checked on sender/recipient and after reload. During
   this work, the user clarified that multiple likes from the same friend are a
   deliberate product mechanic; the suite was adjusted to preserve that behavior.
3. A carousel test performed rapid Next/Previous navigation while listening for
   like requests. It found arrow clicks bubbling into the media double-tap listener
   and creating unintended like writes. The repair stops interactive descendants
   from triggering media tap recognition; regression asserts no incidental POST.
4. Comment and nested-reply tests used marked parent/reply text, then verified the
   independent recipient's view and reload persistence. Icon-only comment-like UI
   received stable accessible names to make real physical control tests reliable.
5. Audio/video testing uploaded tiny synthetic assets through the normal composer,
   waited for the actual elements to load, verified playback progression, and then
   replayed read-only on mobile. The repair replaced static placeholders with native
   controls and refreshed expiring signed URLs.
6. Disposable owner-delete QA used uniquely named disposable posts only. It tested
   options UI, deletion, local cache/view tombstoning, B absence, and reload. Retry
   artifacts created by that test were removed; retained feature fixtures were not.

#### Direct Dare, Truth, Verdict, and Story execution

1. Direct Dare flows began with normal authenticated composer/inbox routing from
   A to B. The recipient acted through the normal UI (accept, proof, review,
   chicken-out, comments, votes, media interactions) while the sender independently
   checked notification/state changes.
2. Proof/image investigation used a browser-level `complete && naturalWidth > 0`
   assertion. That exposed expired persisted signed URLs rather than a superficial
   broken-image visual issue. Server read paths were repaired to refresh storage
   URLs before returning records.
3. Truth coverage used normal A creation, B alert/inbox acceptance and answer or
   refusal, then persistent native state/readback. Separate open modal sessions
   were used to prove A sees B's vote/comment reconciliation while A stays open.
4. Verdict coverage used a normal composer and one synthetic PNG. B voted through
   the rendered control, reloaded, and independently checked selected state. A/B
   comment/result testing then used marked parent/nested reply text and a reversible
   hold-to-undo sequence that restored the intended retained vote state before exit.
5. Story coverage published Normal, Dedication, and Close Friends records through
   real picker/upload flows. B opened the story via the story rail/viewer and image
   loading was asserted. B also reacted/replied; the reply was then verified in A's
   normal message conversation. The Close Friends investigation found native status
   case handling was wrong and fixed it before the A-adds-B/publish/B-read replay.

#### Community and text-card execution

1. Community QA used retained official challenges and normal join/room controls.
   A/B batch activation, proof submission, proof voting, and room chat were observed
   across independent accounts. An expired retained proof deadline invalidated an
   old test assumption; the test now reads real status/deadline and selects the
   appropriate lifecycle UI without mutating it.
2. Community room chat initially required a Realtime publication repair. Once
   published, B's uniquely marked room message appeared for A's open room without
   a reload.
3. Text-card QA first mapped each kind's composer, vote controls, deadlines, and
   reader/creator states. Eight bounded future-due fixtures (four kinds authored by
   each A/B direction) enabled independent voter and creator assertions.
4. A physical-click Custom vote failure was investigated from screenshot/HTTP 500:
   a decorative overlay captured clicks, then the API used service role despite an
   RPC relying on `auth.uid()`. Both causes were repaired, followed by reload and
   mobile verification.
5. A controlled 20-update Custom vote series kept the recipient card open and
   timed successful response-to-visible propagation. This confirmed the new
   loaded-card-scoped subscription/coalesced refresh behavior; it is a bounded
   measurement, not a production traffic claim.
6. Deadline tests deliberately advanced only the browser's ticking clock past real
   future due times, waited for the normal client interval, and compared creator vs
   viewer UI. This proves frontend transition behavior only; it does not mutate or
   prove backend enforcement.

#### Alerts and broad read regression execution

1. A broad desktop run with every write gate false exposed three problems: an
   expired community Active-tab assumption, older friendship alerts unreachable
   beyond the first 50, and an expired Story fixture.
2. Community test logic was corrected to derive the lifecycle tab from returned
   membership/deadline state. Alerts received keyset pagination and a rendered
   `Load older alerts` control. Story reader now skips transparently after a
   successful response confirms no unexpired required fixture exists.
3. The broad no-write desktop regression was rerun after fixes: 24 passed, 50
   skipped, 0 failed. This exact result is historical evidence; rerun it after any
   subsequent changes and never convert skips into passes.

### 6. Detailed messaging execution chronology

1. Messaging began with source/service/store inspection and existing diagnostics.
   The intent was to prove A-to-B and B-to-A behavior with both chats already open,
   then test persistence, presence, typing, Mood Block/freeze, replies, media, and
   menu controls.
2. Two independent contexts logged into A and B. Each opened `Messages`, selected
   the other account's inbox row, and waited for `textarea[placeholder="Message..."]`.
   This assured that a received marker visible on the second screen was realtime
   behavior rather than a recipient navigation/reload artifact.
3. Fresh unique A-to-B/B-to-A markers were sent through the normal composer. Tests
   waited for the real `/rpc/send_message` POST to succeed, asserted the local UI,
   then asserted the peer's already-open chat. Both pages were reloaded and the
   markers were required again.
4. This initially exposed a live-delivery fault despite durable records. Code and
   database inspection showed `conversation-messages:<conversationId>` was private
   but absent from the Realtime authorization function. A membership-gated topic
   authorization migration was added, pushed, and the same live A/B run passed.
5. Presence/typing tests held separate A/B chats open, changed/cleared each draft,
   and observed the peer indicator. Investigation identified new typing channels
   per transition, no sender heartbeat/stale expiry, mobile hidden-tab offline
   behavior, non-ready `subscribe()` handling, and concurrent `track()` calls.
   Shared channels, heartbeat/stale expiry, actual subscribe readiness, visible-only
   online state, and serialized/coalesced presence updates were implemented.
6. Mood Block/freeze were toggled by each participant while the peer was open,
   then reloaded and cleared. The original implementation used multiple channels
   for one state topic and broadcast-only updates. The repair introduced shared
   state channels, persisted payload state, version/race handling, atomic RPC
   broadcasts, and recovery reads only on unhealthy channels.
7. Network/RPC recording showed duplicate inbox refresh behavior caused by both a
   message insert trigger and a conversation update trigger. A focused database
   migration removed the redundant trigger; expected initial/open/reload reads were
   preserved.
8. For replies/read state, A sent one unique marker and B opened it. The test
   observed A's actual `mark_conversation_read` RPC. B opened the target's real
   Message options via context-menu event, selected Reply, sent a unique response,
   and A/B reload assertions confirmed reply payload persistence. This passed on
   desktop and mobile-390.
9. For photo delivery, A selected the real hidden multi-file image input and uploaded
   one tiny synthetic PNG. Sender and recipient image-loading checks required actual
   image natural width. The first recipient run showed a generic `Photo` bubble,
   isolating the missing media-type schema value. Rendering now safely infers PHOTO
   from durable non-shared `media_path`; desktop/mobile replays then proved live
   image receipt, B reload, and fullscreen viewer opening.
10. Finally, A opened the header's real Games and Invite friend menu actions, checked
    the Games picker/This Or That card and temporary-access invite modal/search,
    then closed them without writing. Both desktop and mobile-390 passed. Actual
    game creation and actual third-account invite acceptance remain deliberately
    open because they mutate a shared session/membership lifecycle.

### 7. Validation performed after changes

1. Run the exact targeted Playwright failure reproduction first, headed, one worker.
2. Replay at mobile-390 for messaging behavior that needs mobile evidence.
3. Run `npm run type-check` after TypeScript/source changes.
4. Run focused `npx eslint --quiet` against changed source and QA files; do not use
   unrelated repository warning volume as evidence that a focused change passed.
5. Parse `docs/QA/DARE_QA_RESULTS.json` with Node after ledger edits.
6. Run scoped `git diff --check` on changed QA/source/docs paths.
7. Confirm linked migrations with `npx supabase migration list --linked` after a
   successful `npx supabase db push --linked`.
8. Update report/inventory/results/README with exact pass durations and caveats.

## Work completed before the final messaging pass

### Authentication, profile, navigation, mobile

- Authenticated A/B browser flows and onboarding are established.
- Desktop and requested mobile widths have been exercised for core navigation and
  multiple feature-specific regressions.
- Guest mode was excluded as requested.
- Existing mobile navigation/composer checks cover 360x800, 390x844, and 430x932
  where stated in the QA report; not every product feature has three-width coverage.

### Feed, posts, likes, comments, and media

- Authenticated feed post creation/readback, captions, comments, nested comment
  replies, and cross-account persistence were exercised.
- The repeat-like mechanism was confirmed as intentional. Deliberate repeated
  media double-taps incremented the count, and independent A/B reloads showed the
  accumulated count correctly.
- A carousel defect was repaired: Next/Previous arrows bubbled into the media
  double-tap handler and could create unintended likes. Navigation now asserts zero
  incidental like requests.
- Post-option routing was checked. Prediction/Rumour chips were repaired to open
  their real composers. Ask Truth/Give Dare preselection was checked.
- Owner post deletion is exposed and was tested using explicitly disposable QA
  posts; the app hides global navigation while the action sheet is open and avoids
  stale realtime repainting of deleted content.
- Feed video/audio placeholders were repaired to native playable controls with
  refreshed signed URLs. Tiny retained WAV/WebM fixtures were tested in independent
  reads, reloads, and mobile playback checks.
- Remaining feed gaps include all exposed post-option actions that are still product
  stubs (notably Save, Hide, Report, Unfriend), broader delete/edit permutations,
  and a full production-scale realtime publication benchmark.

### Direct Dares, Truths, Verdicts, Stories

- Direct-Dare lifecycle work includes submission, proof upload, proof/challenger
  review, chicken-out/refusal, final outcome, comments, comment likes, media likes,
  views, signed-media refresh, and realtime repairs listed in the broad report.
- Truth flows were exercised A-to-B: create, alert/inbox routing, acceptance,
  answer, refusal, voting, comment propagation, and mobile answer/replay paths.
- Verdict creation with synthetic image media, B voting, selected-state persistence,
  comments/nested reply, results, and reversible hold-to-undo were exercised.
- Story work includes Normal, Dedication, Close Friends audience, viewer media,
  reaction/reply to A/B chat, audience persistence, signed URL refresh, and mobile
  viewer replays. Close Friends native-status mismatch was fixed.
- Remaining areas include broader vote choices and mutations where exposed, more
  mobile interaction-write coverage, Story expiry/edge cases, and Account-C audience
  authorization probes (explicitly deferred).

### Community challenges

- A/B community joining, batch activation, room entry, proof upload, proof voting,
  and room chat were exercised.
- Realtime publication was repaired for community room messages.
- The retained-run reader was corrected to derive Active/Completed/Eliminated from
  actual membership/deadline data instead of assuming a previous day's fixture
  remains Active.
- Continue with more lifecycle permutations, deadlines, removals, and room/member
  edge cases before declaring the community feature complete.

### Truth-like text cards / drama cards

- Prediction, Deal, Rumour, Promise, and Custom-card work was investigated in depth.
- Bidirectional A/B voting, independent creator readback, reload persistence, live
  Custom updates, vote undo/opposite selection, comments, and due-date UI
  transitions were exercised where documented in the QA report.
- A Custom voting blocker was fixed: a decorative refresh overlay intercepted real
  clicks, and the vote route incorrectly used service role despite an `auth.uid()`
  RPC. The route now forwards the verified caller token.
- Text-card subscriptions were added/scoped to loaded card IDs; a paced 20-update
  Custom series measured live reconciliation with median/p95 evidence in
  `docs/QA/DARE_TEXT_CARD_REALTIME_RESULTS.json`.
- The deadline test changes only the test browser clock and proves UI transitions;
  it does not prove backend deadline enforcement. Backend enforcement remains a
  distinct follow-up if required.

### Alerts and retained-fixture resilience

- Friendship alerts beyond the newest 50 were inaccessible. The app now has
  authenticated timestamp/ID keyset pagination and a `Load older alerts` UI.
- A broad desktop read regression after fixes passed with 24 passed, 50 skipped,
  and zero failures. Skips are not passes; they include gated writes and unavailable
  expiring Story fixtures.

## Database changes already deployed

The linked Supabase project has the messaging migrations below applied. Verify with
`npx supabase migration list --linked` before adding new migrations.

- `20261097000000_persist_messaging_conversation_state.sql`
  - Persists conversation Mood Block state.
- `20261098000000_atomic_messaging_state_broadcast.sql`
  - Persists/broadcasts Mood Block and freeze state atomically.
- `20261099000000_authorize_conversation_message_topics.sql`
  - Authorizes membership-gated private `conversation-messages:<conversationId>`
    Realtime topics. This repaired broken live message delivery.
- `20261100000000_remove_duplicate_inbox_refresh.sql`
  - Removes a duplicate conversation-trigger inbox broadcast, retaining the
    message-trigger path and reducing duplicate client inbox reads.

Other earlier migrations for Dares, community rooms, drama realtime, Close Friends,
and signed-media behavior are documented chronologically in `DARE_QA_REPORT.md`.
Do not claim database-advisor cleanliness: existing advisor output contains unrelated
RLS/security-definer warnings, and Account-C security work remains deferred.

## Messaging: completed in detail

### Defects found and repaired

1. Private message Realtime channel authorization was absent.
   - Symptom: durable messages existed but did not reliably appear live in the peer's
     already-open chat.
   - Repair: migration `20261099000000_authorize_conversation_message_topics.sql`.

2. Typing indicators created a new private channel for every true/false transition.
   - Repair: shared ref-counted `typing:<conversation>` channels, one sender
     heartbeat every three seconds while text changes, and stale-indicator expiry
     after seven seconds.

3. Mood Block and freeze used duplicate channels on the same topic and were only
   broadcast state, so they disappeared after reload.
   - Repair: shared/ref-counted conversation-state channel registry; durable state in
     conversation payload; migration-backed atomic server broadcast after persistence.

4. Presence could show mobile users offline when a browser tab became hidden, and
   `channel.subscribe()` was incorrectly treated as readiness.
   - Repair: visible-only online set, unload/disconnect exit handling, actual
     `SUBSCRIBED` readiness promise, and serialized/coalesced presence tracking.

5. Initial message/state loads could race live events or repeatedly reread on a
   healthy channel.
   - Repair: queue events during initial read, reconcile after late join, and use
     bounded exponential recovery reads only for unhealthy/timed-out/closed channels.

6. A message insert plus conversation update created duplicate inbox refresh events.
   - Repair: migration `20261100000000_remove_duplicate_inbox_refresh.sql` drops the
     redundant conversation trigger. Measured behavior then showed the expected
     initial/open/reload reads rather than duplicated notification noise.

7. Native message records persist `media_path` but no separate `media_type`.
   - Symptom: recipient saw plain `Photo` text even though the uploaded image was
     durable and the sender's optimistic preview worked.
   - Repair in `src/components/screens/MessagingScreen.tsx`: infer `PHOTO` for a
     durable, non-shared media path. Structured shared post/story payloads remain
     excluded from this inference.

### Messaging checks that passed

- Fresh A-to-B and B-to-A text messages appear live in the already-open peer chat.
- Each sender uses one `send_message` RPC in the bounded delivery test.
- Messages remain after independent reloads.
- A/B online indicators work in desktop and mobile execution.
- Typing appears and clears both directions without message-table writes.
- Mood Block and freeze synchronize both directions, persist through reload, and
  are cleared/unfrozen by the test cleanup.
- Read acknowledgement: opening A's incoming message invoked durable
  `mark_conversation_read`; B replied through Message options; reply target/payload
  and message persisted after reload.
- Image attachments: a tiny synthetic A image reaches B live, its image loads with
  nonzero natural width, remains after B reload, and opens in B's fullscreen viewer.
- Games picker and temporary-invite modal open/close without writes.

### Exact current messaging test evidence

- `messaging-delivery.spec.ts`, `messaging-state-persistence.spec.ts`, and
  `messaging-typing-presence.spec.ts` desktop final: 3 passed in 56.8 seconds.
- Mobile-390 delivery/state: 2 passed; final typing/presence replay: 1 passed in
  11.7 seconds.
- `messaging-reply-read.spec.ts`: desktop passed in 13.7 seconds; mobile-390 passed
  in 10.9 seconds.
- `messaging-photo-delivery.spec.ts`: desktop passed in 9.7 seconds; mobile-390
  passed in 11.4 seconds.
- `messaging-menu-surfaces.spec.ts`: desktop passed in 5.4 seconds; mobile-390
  passed in 5.2 seconds.
- After the final messaging changes: `npm run type-check` passed, focused ESLint
  passed with no errors, QA results JSON parses, and scoped `git diff --check` passed.

### Messaging source and test files changed/added

- `src/middleware/services/messaging.service.ts`
- `src/stores/useMessagingStore.ts`
- `src/components/app/AuthenticatedApp.tsx`
- `src/components/screens/MessagingScreen.tsx`
- `supabase/migrations/20261097000000_persist_messaging_conversation_state.sql`
- `supabase/migrations/20261098000000_atomic_messaging_state_broadcast.sql`
- `supabase/migrations/20261099000000_authorize_conversation_message_topics.sql`
- `supabase/migrations/20261100000000_remove_duplicate_inbox_refresh.sql`
- `tests/qa/messaging-delivery.spec.ts`
- `tests/qa/messaging-typing-presence.spec.ts`
- `tests/qa/messaging-state-persistence.spec.ts`
- `tests/qa/messaging-reply-read.spec.ts`
- `tests/qa/messaging-photo-delivery.spec.ts`
- `tests/qa/messaging-menu-surfaces.spec.ts`
- `tests/qa/README.md`
- `docs/QA/DARE_QA_REPORT.md`
- `docs/QA/DARE_QA_RESULTS.json`
- `docs/QA/DARE_FEATURE_INVENTORY.md`

## Historical continuation queue (superseded)

This is retained run history. Use **Authoritative remaining work** above for current scope.

The following are open and must not be represented as fully verified.

### Immediate messaging continuation queue

1. Game lifecycle (A/B, write-enabled)
   - Open Games from A's chat, select one game such as This Or That, and assert the
     game invite/session record is created exactly once.
   - Keep B's chat open and confirm the invite card arrives live.
   - Have B enter the invite, answer a round from each account, and verify result
     persistence, live reconciliation, reload, and no duplicate session/round
     writes.
   - Check both desktop and mobile-390. Use one bounded synthetic game session and
     retain it unless it has an explicit cleanup endpoint.

2. Temporary invite lifecycle (requires deliberate third account)
   - Prefer an existing dedicated QA Account C only for normal functionality; do
     not combine this with deferred security probing.
   - A sends C a temporary invite through the actual picker; assert one invite row
     and one event only.
   - C receives, accepts, and enters. Verify membership, system event, group chat
     rendering, A/B/C live delivery, reload behavior, and that original members can
     remove the guest while C can leave.
   - Test reject, duplicate-invite prevention, expired/removed access, and that C
     cannot continue messaging after access ends.
   - This changes shared conversation membership. Use a dedicated disposable A/B/C
     conversation if available; do not risk the retained primary A/B QA thread.

3. Clear chat / delete semantics
   - The UI confirmation exists but the operation is destructive. Do not clear the
     retained A/B thread with its QA history.
   - Create or identify a dedicated disposable conversation, send two uniquely
     marked messages, accept the browser confirmation, then test: A's local clear,
     B's visibility, reload persistence, backend rows/receipts semantics, and
     whether new messages work after the clear.
   - Clarify intended product semantics first if it is ambiguous whether clear means
     local hiding, per-user `cleared_at`, or permanent deletion.

4. Message deletion paths
   - Exercise Delete for me and Delete for everyone in a disposable conversation.
   - Verify confirmation/error behavior, local state, peer state, durable reload,
     replay resistance, and post-delete reply behavior.

5. Additional attachment behavior
   - Single-photo delivery is verified. Test multiple-file grid behavior, viewer
     next/previous navigation, upload failure/retry, large file validation, expired
     signed URL refresh, and cancellation if the UI exposes it.

6. Message status UX
   - Durable read RPC is proven. Add strict UI-level assertions for Delivered/Seen
     status transitions scoped to a fresh message, rather than relying on generic
     historic labels in the retained thread.

7. Message performance/resource envelope
   - The architecture was improved to reduce unnecessary resources, but this is not
     a production load test. Measure controlled 20+ message burst latency,
     per-client Realtime channel counts, `get_inbox_page` calls, message reads,
     reconnect behavior, and Supabase resource usage under a documented budget.
   - Avoid broad polling. Preserve the current event-driven design, shared channels,
     typing heartbeat, and failure-only bounded recovery reads.

### Broader application continuation queue

1. Rerun the full desktop QA directory after new changes with all write gates false;
   report passed/skipped/failed precisely. The previously recorded clean broad
   read-only checkpoint was 24 passed / 50 skipped / 0 failed, but it predates the
   final messaging test additions.
2. Rerun affected focused read/write suites following every migration or service
   change. Never infer a pass from a stale test result.
3. Finish the community lifecycle edge cases and any remaining room moderation or
   deadline states.
4. Finish text-card backend deadline-enforcement testing separately from browser
   clock UI transition coverage.
5. Expand direct Dare, Truth, Verdict, Story, and feed mobile write/interactions
   where only desktop or read-only evidence exists.
6. Address separately authorized Account-C security/authorization testing only when
   the user re-enables it. Do not conflate functional third-account invite QA with
   adversarial authorization tests.
7. Review/triage the existing Supabase advisor warnings separately. Do not deploy
   broad security/RLS changes without a focused scope and regression tests.

## Recommended first commands in the next chat

```powershell
# Check which messaging migrations are applied to the linked project.
npx supabase migration list --linked

# Reconfirm the final core messaging regressions visibly.
npx playwright test tests/qa/messaging-delivery.spec.ts tests/qa/messaging-state-persistence.spec.ts tests/qa/messaging-typing-presence.spec.ts tests/qa/messaging-reply-read.spec.ts tests/qa/messaging-photo-delivery.spec.ts tests/qa/messaging-menu-surfaces.spec.ts --headed --workers=1 --project=chromium-desktop --reporter=line

npx playwright test tests/qa/messaging-delivery.spec.ts tests/qa/messaging-state-persistence.spec.ts tests/qa/messaging-typing-presence.spec.ts tests/qa/messaging-reply-read.spec.ts tests/qa/messaging-photo-delivery.spec.ts tests/qa/messaging-menu-surfaces.spec.ts --headed --workers=1 --project=mobile-390 --reporter=line

# Validate code/docs after any edit.
npm run type-check
npx eslint --quiet src/components/screens/MessagingScreen.tsx tests/qa/messaging-*.spec.ts
```

Set the explicit local-only write gates before any test that creates a message,
attachment, game, invite, fixture, vote, post, or other real database record.

## Final status at handoff

Substantial feature discovery, database repair, and authenticated A/B QA have been
completed. The final messaging slice is significantly stronger than the starting
state: live delivery, state sync/persistence, presence, typing, replies/read state,
and image media all have browser evidence on desktop and mobile. It is not an
end-to-end declaration that every product feature is perfect. The priority next work
is the controlled game lifecycle, safe third-account temporary invite lifecycle,
disposable clear/delete semantics, attachment edge cases, resource/load measurement,
and broad regression reruns.
