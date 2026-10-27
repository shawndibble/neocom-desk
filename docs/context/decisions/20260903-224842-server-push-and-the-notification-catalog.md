# Scope decisions (round 45) — server push, and the notification catalog

_Recorded 2026-09-03._

- **Periodic Background Sync is retired; it never delivered.** ADR 0007 bought
  a hand-written service worker to register a `periodicsync` handler at a
  5-minute `minInterval`. Chrome enforces a floor of **12 hours** between
  `periodicsync` events and gates them on Site Engagement — a score of zero
  stops them entirely, and the practical cadence for most origins is 24-36
  hours. The registration always succeeded and the browser simply did not call
  back. ADR 0007's stated consequence ("background notification delivery only
  on that subset of installs, as a best-effort supplement") was optimistic even
  for that subset. The service worker itself stays; ADR 0009 records that its
  justification changes from `periodicsync` to `push`.
- **The backend holds no EVE token, and ADR 0001 is untouched.** Real push
  appears to require a server that polls ESI, because CCP publishes no webhook
  for either the synthesized events of round 20 or `eveNotification`'s own
  endpoint. It does not, because the events worth waking someone for are
  **already timestamped**: a skill queue entry knows its `finish_date`, an
  industry job its `end_date`, an extractor its `expiry_time`, a structure its
  `fuel_expires`, and a `StructureUnderAttack` its reinforcement exit (round 36
  already derives that timer). The device projects those forward; the backend
  stores rows and fires them. See ADR 0010, which records the two rejected
  alternatives and why.
- **Scheduled Push covers only what carries a timestamp, and that is a
  boundary, not a gap.** Mail, wallet, market orders, contracts and every
  non-projectable EVE Notification type reach the user when the app is open and
  not before. This matches how those events are acted on anyway: they are read
  in-game at leisure, not responded to inside a reinforcement timer.
- **A Projection is replaced wholesale, never merged.** Every app open and
  every foreground poll re-uploads the whole 72-hour window. Reconciling a
  Projection against the backend's copy would mean teaching the backend what a
  skill queue is; replacing it means every app open self-heals whatever drifted
  while the app was closed, which is also the only correction mechanism
  available when the backend cannot re-read ESI.
- **A Scheduled Push asserts for skills, industry jobs and a structure's
  reinforcement exit, and hedges for structure fuel.** The backend cannot
  verify a Projection before firing it, so the wording carries the
  uncertainty. Skill training and industry jobs are deterministic enough that
  hedging every one of them would make the reliable case read as unreliable;
  a structure refuelled in-game while the app was closed makes its fuel alert
  plainly wrong, so that one says "was due to". A reinforcement exit is the
  same as skills/jobs in this respect: once the timer starts, the exit
  instant is fixed and nothing in-game can move it early (issue #359).
- **Projection rows carry rendered text, not structured data.** The backend
  holds no SDE, no i18n catalog and no notion of what a skill is; it pushes
  what it was handed. The cost — re-wording a notification does not fix rows
  already uploaded — self-heals inside the Projection Horizon.
- **The Notification Feed syncs; the OS notification does not.** A dismissal is
  a `dismissedAt` flag rather than a delete, so this collection carries **no
  tombstones at all** and `merge.ts`'s 30-day TTL edge — a long-offline device
  resurrecting a dismissed row — cannot arise here. Closing an already-drawn OS
  notification on another device would need a push that shows nothing, and
  WebKit revokes a push subscription that fails to post a visible notification.
  The bubble is a transient announcement owned by whichever OS drew it; the
  Feed is the durable record.
- **The backend owns the Feed rows it pushed; devices own the ones they
  detected.** It is the only party that observed a Scheduled Push before any
  device did, and it is already writing to that collection, so keeping the row
  instead of deleting it makes the pushed half of the Feed consistent across
  devices with no merge at all. Device-detected events upload through the same
  callable, so the Feed does not become arbitrary about which rows follow a
  user between devices.
- **Feed sync is eventually consistent, on the existing sync triggers.**
  `firestore/lite` has no `onSnapshot`, and the two ways to get live updates —
  dropping lite for full Firestore, or waking devices with a silent FCM message
  — cost a bundle increase and an iOS-hostile transport respectively. A
  dismissal that takes until the next app open to propagate costs one extra
  tap. The synced window is 30 days or 100 rows, whichever is smaller, against
  the Feed's local cap of 300 (round 20).
- **Round 34 is inverted: the Notification Allow-List replaces the generic
  body.** Round 34 delivered every `type` and used a generic body as the floor,
  with types discovered from the Feed as they fired. The catalog turns out to
  hold **254** types, not the ~100 that decision assumed, and a design where
  every unwanted type must reach the Feed once before it can be silenced does
  not survive that number. A type without a hand-written body is now dropped at
  the poller. This deletes the generic body path, the discovered-types
  machinery, per-type search, and the algorithmic humanization of `type`
  strings that a closed list makes unnecessary.
- **The allow-list is the work, so it ships in tranches.** There is no cheap
  "let it through" any more: adding a type means writing its body and its
  payload reads. The first tranche is the 17 types round 36 already wrote plus
  nine — `StructureDestroyed`, `StructuresJobsPaused`,
  `StructuresJobsCancelled`, `StructureLowReagentsAlert`,
  `StructureNoReagentsAlert`, `OrbitalAttacked`, `OrbitalReinforced`,
  `CorpKicked`, `InfrastructureHubBillAboutToExpire` — for 26. Sovereignty and
  legacy starbase types are deliberately excluded, being relevant only to play
  the app cannot detect. New types CCP ships are silent until someone writes a
  body; no discovery mechanism replaces the one being removed, because that
  mechanism is the thing causing the noise.
- **A closed list means Settings enumerates every type up front**, grouped by
  Notification Family, instead of waiting for each to fire once. Per-type
  defaults are set beside the body: browser-on for `StructureUnderAttack`,
  `StructureLostShields`, `StructureLostArmor`, `StructureDestroyed`,
  `OrbitalAttacked`, `OrbitalReinforced` and `CorpKicked`; feed-on/browser-off
  for the rest. Round 34's blanket feed-on/browser-off default was right for a
  254-type firehose and wrong for a curated 26. `marketOrderFilled` and
  `walletBalanceChanged` become feed-only for the same reason in reverse: worth
  a row, not worth an interruption.
- **A Notification Feed row is toggled from its own context menu, per
  Character.** Two items, icon plus a label that reads the current state: the
  browser channel toggles both ways, and "Hide in feed" is one-way — hiding a
  type removes the rows that carried the menu, so Settings is the way back.
  That asymmetry is a consequence of `feedSelection.ts`'s existing rule that
  visibility filters at render time, which is also what makes the action
  instant and non-destructive. The Character is read from the row's own
  `characterId`, never parsed out of the rendered text: bodies differ per event
  and some do not name the Character at all. There is no all-Characters
  variant; the toggle means the Character whose row it is.
- **Round 43's best-effort hint copy is now wrong and must change.** It tells
  the user "with no server push (round 20), they fire when the app is open, or
  when the browser chooses to run a background sync. On iOS they do not fire in
  the background at all." Server push exists, browser-chosen background sync
  does not, and iOS receives Scheduled Pushes for an installed PWA. The honesty
  requirement that motivated the hint survives; what it has to be honest about
  has changed.
- **The notifier is a scheduled Cloud Function in the existing `functions/`
  codebase, not a new platform.** `onSchedule('every 5 minutes')` runs on Cloud
  Scheduler, whose free tier is three jobs per billing account; this needs one.
  Vercel plus an external pinger was considered and rejected: Vercel's Hobby
  plan caps cron at **once per day** — a more frequent expression fails at
  deploy — so it needs a third-party scheduler in the delivery path to be
  useful at all, which is three platforms to do what one already does for free.
  Keeping the notifier beside `mintFirebaseToken` also means it imports
  `src/engine` directly rather than reimplementing the projection rules in a
  second language, which is the real cost a separate host would impose.
- **Projections and device registrations are uploaded through one callable and
  written with admin privileges, so their Firestore rules are function-only —
  a deliberate departure from the ownerHash pattern every other collection
  uses.** `syncAuth.ts` signs in as the **active** Character (`char:{id}`) and
  re-authenticates on switch, so a client writing these collections directly
  would need one Firebase sign-in per Character on every app open, not once.
  Instead a single callable takes the device's FCM token plus a per-Character
  batch of `{accessToken, projectionRows}` and verifies each access token with
  the existing `verifyEveToken.ts`. Access tokens are already cached by
  `auth/session.ts`, so batching nine Characters costs no extra CCP round trips
  in the common case. The ownerHash rules stay exactly as they are for the
  collections a client does write.
- **What the notifier prunes.** A Projection row is kept once fired (it becomes
  the backend's half of the Notification Feed) and purged at 30 days like every
  other Feed row. A row still **unfired** more than 7 days past its `fireAt`
  belongs to a device that stopped checking in and is deleted unsent — a
  week-late "your skill finished" is worse than silence. A device token is
  deleted the moment FCM reports it `UNREGISTERED` or `INVALID_ARGUMENT`, and
  left alone on any other error.
- **Feed-channel visibility syncs; browser-channel visibility stays
  device-local.** Round 20 made every notification preference device-local, but
  its rationale is permission-scoped — "browser permission is inherently
  per-device, so syncing what I want to hear about across devices would be
  misleading." That argument covers the browser channel and does not reach the
  feed channel, because nothing gates a feed row: no permission, no platform
  capability, no grant that can differ between devices. Since Feed rows
  themselves now sync, leaving their visibility filter device-local would mean
  hiding a type on a phone and still finding its rows on a desktop — a
  half-synced state with no rule a user could state. The feed flags of both
  `EventEnabledMap` and `EveTypeEnabledMap` therefore become the first entries
  in `SYNCED_SETTING_KEYS`, which is empty today precisely so that adding one
  is a deliberate act. The app-wide master kill switch stays device-local with
  the browser flags: it gates the OS permission, which is the thing round 20
  was protecting.
- **Detection thresholds that feed a Projection sync too.** Round 43 stored the
  structure-fuel lead time and the corp wallet's two ISK thresholds device-local,
  alongside the channel toggles. That was right while a threshold only decided
  what one device's own poller fired. It is not right now: `structureFuelLow` is
  projectable, so its lead time determines the `fireAt` of a row uploaded to
  shared state, and a Projection is replaced wholesale by whichever device
  uploaded last — leaving the alert to arrive at whatever lead time the
  most-recently-opened device happened to hold. A threshold that is an input to
  shared state is not a device preference any more, so the fuel lead time joins
  the feed flags in `SYNCED_SETTING_KEYS`. The corp wallet thresholds follow it
  for consistency of the settings model, though nothing projects them today.
