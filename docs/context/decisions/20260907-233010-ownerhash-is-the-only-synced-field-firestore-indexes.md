# Scope decisions — ownerHash is the only synced field Firestore indexes (issue #583)

_Recorded 2026-09-07 · issue #583._

- **Every field of every remotely-owned collection is exempt from automatic
  indexing; `ownerHash` alone is re-enabled.** `firestore.indexes.json` shipped
  with an empty `fieldOverrides`, so Firestore indexed every field of every
  synced document — both orders, an `array-contains` index per array field, and
  map subfields recursively. Those collections are read by exactly one query
  shape, `where('ownerHash','==',h)` (optionally windowed by `updatedAt`), so
  every other entry was stored and paid for on every write without ever being
  read: one per skill in a plan queue, per Quickbar item, per ore line, per
  material in `materialSourcing`. Exemption is preferred over dropping the
  redundant fields themselves (`id`, `characterId`, `deleted: false`), which
  would need a schema migration on both the read and write paths for a
  comparable saving. This rules out adding a `where(...)` or `orderBy(...)` on
  any other synced field without re-enabling that field in `fieldOverrides`
  first.
- **The wildcard is the mechanism, not an enumeration.** One
  `fieldPath: "*"` entry per collection group plus one `ownerHash` entry, rather
  than a list of every field, so a field added to a synced document later is
  exempt by default instead of silently re-acquiring indexes. This rules out
  maintaining a per-field allow-list that drifts the first time a record grows a
  property.
- **A missing index is no longer uniformly self-healing.** The incremental-pull
  decision (`20260907-220630-sync-reads-incrementally-with-a-periodic-full-reconcile.md`)
  established that a missing composite index degrades to the old full read
  rather than failing the pass, which made client-vs-index deploy order
  irrelevant. That guarantee now holds only for the `updatedAt` window: the
  fallback re-reads on `ownerHash`, so a missing `ownerHash` index fails the
  pass outright. This rules out treating the exemptions as safe to deploy
  unobserved — the deploy is checked against a real sync, and the check is
  written down in `docs/SYNC-SETUP.md`.
- **`projections` and `deviceRegistrations` stay fully indexed.** They are
  top-level collections written and queried by the scheduled dispatcher on
  `characterId`, `fired`, `fireAt`, `firedAt` and `characterIds`
  (`array-contains`), none of which the client ever touches. This rules out
  extending the exemption to "all collections" for symmetry.
