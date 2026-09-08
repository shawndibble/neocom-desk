# Scope decisions — the Settings page's Defaults answer for the pilot, not the device

_Recorded 2026-09-07._

- **The five controls in Settings' Defaults and Corporation panels sync across
  a pilot's devices.** The trade hub prices are read at, the facility a first
  Build Plan assumes, the ME an unowned sub-build is quoted at, the PI
  expiring-soon window and the corp roster's dark threshold each state
  something about how the pilot plays — which hub they trade out of, which
  structure they build at, how often they can do a reset run, what their corp
  calls inactive. None of that is a fact about a laptop. They were device-local
  only because `createLocalSetting` was the only factory there was, and the
  cost showed: a pilot who set their rigged Azbel once was quoted NPC-station
  numbers on their phone, silently.

- **The text-scale and time-format preferences stay device-local, and that is
  the line.** Font scale answers for a screen, not a person, and time format
  was decided device-local the same week with its own reasoning
  (`20260907-102126`). The rule this batch draws: a preference that describes
  _the pilot's play_ syncs, one that describes _the machine they are looking
  at_ does not. `settings.defaultsSyncHint` says so on the page, and
  `settings.fontScaleHint` already said the opposite for its own control.

- **One `sync.` key per preference, not one blob for all five.** The two synced
  settings that already existed pack everything into one key each, because
  their key space is unbounded (one entry per Character, per system) and
  `SYNCED_SETTING_KEYS` is an exact-match allow-list. This set is fixed and
  small, so it can be spelled out — and separate keys buy two things a blob
  cannot. `mergeSettings` is last-write-wins per key, so changing the hub on a
  laptop cannot roll back an ME set on a phone; and five stores writing five
  rows never read-modify-write one shared row, which they would race on
  _locally_, before sync is involved at all.

- **The packed facility record keeps its one known loss.** `facilityDefaults`
  is deliberately one record rather than three keys (rig level and tax are
  meaningless without the facility). Under LWW-per-key that means two devices
  changing _different fields_ of it before either syncs keep the later record
  whole rather than merging the two edits. Accepted: it takes two devices open
  at once, and the alternative — splitting the record — reintroduces the
  incoherent combinations the packing exists to prevent.

- **A device's existing value is adopted, unstamped.** Each store names the
  plain key it used before it synced and seeds the `sync.` row from it with a
  bare Dexie put — never `setSyncedSetting`, which would stamp `Date.now()` and
  let a value set months ago on this laptop outrank yesterday's real edit on
  the phone. Unstamped, it merges as `updatedAt: 0`: any remote copy wins, and
  with no remote copy it pushes as-is. Accepted consequence: two devices that
  both adopt before either syncs resolve first-syncer-wins, with no way to tell
  which value was older. Nothing is lost that was not already ambiguous.

- **The pre-sync rows are left on disk, not deleted.** A PWA can serve an older
  bundle after a newer one has migrated (a plain reload does it), and that
  bundle reads the old key. Leaving the row means it shows the pilot's value
  instead of silently reverting to Jita; the cost is that it shows a stale one
  if the preference has since changed elsewhere. "Reset saved view preferences"
  clears neither the old row nor the new one — a preference with its own
  control on this page has never been in `VIEW_PREFERENCE_KEYS`.

- **Syncing the hub does not merge it with the Payee hub.**
  `20260907-100006` separated the Market Browser's `marketHub` from
  `PayeeRecord.hubId` on the grounds that one is a viewing preference and the
  other a term of a bill. That still holds and is untouched here: the browser's
  hub now travels with the pilot, Moon Mining still never reads it, and a
  Payee's hub still travels with the Payee.

- **A write pushes under every Character on the device, not the active one.**
  These keys are device-global but sync is per-Character (one uid and
  ownerHash each), so pushing under only the active Character would leave a
  second device that holds only the _other_ Character never seeing the change.
  Same fan-out `setAccountStationPin` and `setPlanetRichness` already do. It is
  not account-level sync and does not reopen that question (the parity plan
  §5.7 rejected it, and its reasoning is untouched): each Character still
  carries its own copy under its own uid.

- **A pulled value is validated, never trusted.** Every synced store runs its
  `parse` over what a sync brings in, exactly as it does over what it reads at
  hydrate. What arrives was written by another device — possibly an older
  build, possibly a hand-edited Firestore row — and an out-of-range
  `assumedMe` reaches the industry engine, which throws on one rather than
  clamping. `features/pi/customsOverride.ts` already validates pulled values
  for the same reason.
