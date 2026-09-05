# Scope decisions — Account-wide deletions get a shared-key tombstone check in merge, not a new remote record (issue #436)

_Recorded 2026-09-04 · issue #436._

- **Option 1 (chosen): give account-wide deletions a real identity, independent
  of any Character, by keying a tombstone on the shared key alone (e.g.
  `locationId` for Station Pins) rather than `${characterId}:${locationId}`.**
  Round 7's fan-out writes one row _and one tombstone_ per Character known at
  write/delete time (there is no shared account identity to key a single
  remote record off — CONTEXT.md, parity plan §5.7). A Character added later
  is in neither list, so `accountWideBackfill.ts` can copy a stale row onto it
  under an id (`${newCharacterId}:${locationId}`) no tombstone names, and
  `merge.ts`'s `l && !r` pushes it as a brand-new remote doc nothing can
  out-rank. Rejected alternatives (both from the issue, neither reopened
  here): waiting on a sync round-trip before trusting local rows — already
  tried and reverted once inside #432, breaks Character-add while offline, and
  even accepted only shrinks the race window rather than closing it; and
  majority/newest-wins in `pinStateForStation` — the resurrected row's
  `updatedAt` is indistinguishable from a legitimate one (`cloneOnto`
  deliberately preserves the source row's stamp so `merge.ts`'s LWW stays
  honest against other tombstones), so no tiebreak exists to rank by.
- **The shared-key signal is the existing per-Character local tombstone scan,
  read twice — not a new Firestore collection.** `deletedAtByKey()`
  (`accountWideBackfill.ts`) already computes "the latest deletion of shared
  key K any locally-known Character has recorded," from tombstones that
  already live under each Character's own `/characters/{uid}/...` subtree.
  That is exactly the shared-key signal `mergeRecords` needs at its `l && !r`
  (and `l && r`, already-equal) cases: a new optional `accountWide` parameter
  (`sharedKey`, `deletedAtByKey`) lets it drop and re-tombstone a row whose
  shared key was deleted after the row's own `updatedAt`, regardless of which
  Character's id the row lives under. `stationPinSpec`/`planetRichnessSpec` in
  `planSync.ts` wire this in by exporting and reusing
  `stationPinDeletedAtByKey`/`planetRichnessDeletedAtByKey` from
  `accountWideBackfill.ts` — no new collection, no new Firestore rules, no
  Cloud Function, no manual `firebase deploy` step, and (rejected explicitly,
  see below) no cross-account collision surface.
- **A top-level, ownership-free Firestore collection keyed on the bare shared
  key was considered and rejected.** It would need `request.auth != null`
  writes with no ownerHash scoping (Account has no server-side identity to
  scope by — CONTEXT.md), which means every real, unrelated player who has
  ever pinned the same popular station (Jita 4-4 being the extreme case)
  bumps the _same_ document's `deletedAt`. Steady state for a popular station
  is that its tombstone is always newer than any legitimate pin's `updatedAt`,
  which would silently stop account-wide backfill from ever completing for
  that station, for anyone — not a narrow edge case, and strictly worse than
  the bug this issue fixes. A `deviceRegistrations`/`projections`-style
  Cloud-Function-gated collection avoids the open-write griefing surface but
  not the collision: the key is still bare, so the scoping problem is
  identical.
- **The fix closes the gap by _learning_, not by _preventing_ the copy.**
  `deletedAtByKey()`'s local scan only ever saw a deletion a Character
  _originated on this device_ — pulling a remote `deleted: true` doc deleted
  the local row (`mergeRecords`' `r?.deleted` branch) but recorded nothing
  locally, so a sibling Character's _learned_ deletion was invisible to both
  `accountWideBackfill.ts`'s copy step and (now) `mergeRecords`' own check.
  `syncEditableCollection` (`planSync.ts`) now also persists a local tombstone
  for every id in `plan.deleteLocal`, stamped with the remote doc's
  `updatedAt` — generically, for every collection, since it is the same fact a
  locally-originated delete already records via `recordDeletion`, just learned
  a step later. This is what lets a fully-stale device converge: acceptance
  criterion #2 is a "sync both" scenario, not a "prevent before copy" one — a
  device with no local knowledge of a deletion cannot prevent a copy it has no
  way to know is stale, but it can self-heal once the sibling Character it
  already holds locally syncs and learns the deletion, which then feeds the
  same `deletedAtByKey()` map on the very next `mergeRecords` pass for the
  newly-added Character.
- **One-time residual window, accepted rather than closed.** A pin deleted
  before this ships has no shared-key tombstone recorded by any Character's
  local per-id tombstone yet (those only exist for the Characters that were
  known and synced at delete time, same as before this fix) — so there is a
  narrow window, right after this change ships, where an old-style stale copy
  can still resurrect once. It self-heals on the next sync once any sibling
  Character has pulled its own per-id tombstone locally, same as every other
  case this issue closes. Not a blocker.
- **Station Pin's `character`-scoped rows opt out by construction.** A
  `character`-scoped pin shares its `locationId` (and therefore its
  `sharedKey`) with any `account`-scoped pin at the same station, but must
  never be caught by a deletion that only ever applied to the account-wide
  row. `stationPinSpec.accountWide.sharedKey` returns `undefined` for
  `scope !== 'account'` rows, opting them out of the check entirely.
- **A self-heal inherits the original deletion's TTL clock, not a fresh one —
  accepted, not fixed here.** The tombstone `mergeRecords` pushes when it
  self-heals a resurrected row carries the _original_ `deletedAt`, however old
  (deliberately: it is what makes the comparison against other Characters'
  rows honest, same reasoning as `cloneOnto` preserving `updatedAt`). If that
  original deletion is already near `TOMBSTONE_TTL_MS` (30 days), the freshly
  pushed tombstone can be eligible for `purgeRemote` almost immediately. This
  is the same accepted trade-off `mergeSettings` already documents for
  settings ("a device offline past the remote 30-day window ... re-pushes its
  stale copy on the next sync"), not a new one this issue introduces — giving
  account-wide tombstones their own non-expiring policy (as
  `SyncedSettingTombstone` has) would be a bigger change than this issue's
  scope.
