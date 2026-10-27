# Scope decisions (round 52) — PI Advisor resource richness (issue #425)

_Recorded 2026-09-04 · issue #425._

Issue #425 needs a per-planet, per-resource **best-to-worst ordering** stored
somewhere, because ESI carries no per-planet richness at all and the in-game
scan overlay shows a colour map rather than a number (`engine/pi/chain.ts`'s
header already records this). The ticket flagged two questions as unsettled.
Both are in fact settled by existing precedent, and are recorded here as
decisions rather than left for an implementer to guess:

- **Synced Editable Data, not device-local.** Round 20 made notification
  preferences device-local for one stated reason: "browser permission is
  inherently per-device, so syncing 'what I want to hear about' across devices
  would be misleading when each device's actual permission grant is
  independent." That rationale is about a fact that genuinely differs per
  device. A planet's scan ranking is not such a fact — it is durable
  knowledge the user paid probe time to learn, and it is equally true on
  every device they own. It therefore falls under the glossary's **Editable
  Data** entry ("data created inside the app… synced across devices") with no
  exception to carve.
- **Account-wide, by the round 7 fan-out, and account-wide is the _only_
  scope.** Round 7 settled this shape for **Station Pins**: an account-wide
  record has no shared account identity to key off, since Account has no
  storage, sync or server-side identity, so it fans out — one row per
  Character currently known on this device, each synced under that Character's
  own ownerHash (feature-parity README §5.7). `setAccountStationPin`
  (`src/sync/planSync.ts`) is the working recipe: `bulkPut` one row per
  Character, then `scheduleSync` each.
  Where richness **departs** from Station Pins is that it needs no `scope`
  field and no three-state cycle. A pin is a per-Character preference that the
  user may choose to elevate, so `StationPinRecord` carries
  `scope: 'character' | 'account'` and `pinStateForStation` resolves it on
  read. Richness is a property of the _planet_, objectively the same for every
  Character in the account, so there is no per-Character reading to offer and
  nothing for a user to elevate. Every row is written account-wide; the record
  needs only `id: '${characterId}:${planetId}'`, the ordering, and
  `updatedAt`.

## The one thing precedent did not answer: no backfill-on-add hook exists

The round 7 fan-out writes one row per Character **currently known on this
device**. Nothing backfills a Character added later — `src/auth/session.ts`'s
`db.characters.put` is the only add path and it has no such hook, and no
`backfill` mechanism exists anywhere in `src/`.

For Station Pins that gap is tolerable: a missing pin is a station that does
not float to the top. For richness it is worse, and worse in the direction
this tab is built to avoid — a planet the user has already ranked would
silently revert to "resources named, nothing priced" on the new Character,
which reads as data loss rather than as a Character-scoped absence.

**Decision: it spins out as issue #432, and #425 is blocked by it.** The gap
belongs to the round 7 fan-out itself, not to richness — Station Pins has it
today — so it is fixed once, generically, in `src/sync`, rather than as a
richness-only workaround that would leave Station Pins broken or as a
sync-layer change buried inside #425's already-large feature PR. The backfill
must be generic over collections rather than hardcoded to `stationPins`,
since #425 adds the second caller and the fan-out is this app's standing
recipe for any account-wide collection to come. Its source has to be
deterministic so two devices adding the same alt converge instead of racing —
and the implementation settled on the **union of every existing Character's
account-scoped rows** rather than picking one source Character. In steady
state the two are the same answer, since `setAccountStationPin` writes to
every Character and `clearStationPin` tombstones every Character; they diverge
only on a partially synced device, and the union is order-independent by
construction rather than by a rule someone has to remember. The copied row
keeps the **source row's `updatedAt`**, which is load-bearing: `merge.ts`
compares a row's `updatedAt` against a tombstone's `deletedAt`, so a row
stamped `Date.now()` would out-rank every tombstone the added Character holds
on another device and resurrect pins the user had deleted there.

## Residual: the fan-out cannot express an account-level deletion

The union trusts a local row, and a local row can be behind. A copied row is
re-keyed to `${newCharacterId}:...`, an id **no tombstone anywhere targets** —
tombstones are per Character and are written only for the Characters that
existed when the delete happened. `merge.ts` therefore sees `l && !r` and
pushes the copy as a brand-new remote doc nothing can out-rank, and
`pinStateForStation` reports `'account'` if _any_ Character holds an account
row. So copying one stale row resurrects a cleared pin **permanently**, not
until the next sync.

`deletedAtByKey` closes the half a device can see: a candidate row older than
a deletion any local Character has recorded is skipped. It cannot close the
case of a device that has pulled neither the deletion nor its tombstone, which
holds no local evidence the row is stale.

Closing that needs account-level deletion state — a record that "this station
is unpinned for the account", rather than N per-Character tombstones. Round
7's fan-out has no such thing, by construction, and this is the first work to
depend on it. It is recorded here as a known limitation rather than fixed
inside #432; #425's richness ordering inherits it, and should be re-examined
if a third account-wide collection ever arrives.
