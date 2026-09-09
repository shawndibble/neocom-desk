# Scope decisions — purge the shared structure cache when the roster empties (issue #669)

_Recorded 2026-09-09 · issue #669._

- **The gap: rows under `GLOBAL_CACHE_CHARACTER_ID` are exempt from every
  existing purge path, and the #669 decision doc did not say what happens to
  the new roster-shared structure rows because of that.** `purgeCharacterCache`,
  `purgeCorpScopedCache`, and `isCachePurgePending` all short-circuit on
  `characterId === GLOBAL_CACHE_CHARACTER_ID` — correctly, since that sentinel
  is documented (`docs/ARCHITECTURE.md`) as holding public reference data no
  revoked consent can apply to. A structure name is not that, and a `/code-review`
  Standards pass flagged the mismatch: a name resolved via one Character
  outlives that Character's own scope revoke or owner change with no cleanup
  path, on a sentinel whose whole excuse for skipping purges is "this data
  belongs to nobody in particular."

- **The fix is not "make the existing purges reach the sentinel."** A scope
  revoke or an owner change already purges the affected Character's own
  `structure:{id}`/`structure:{id}:forbidden` rows, same as before this
  feature existed. The shared row was never that Character's alone to begin
  with — it is deliberately visible to the _rest_ of the roster too, and
  nothing about one Character's grant changing says the rest of the roster
  should lose a name they can still legitimately share. Wiring the shared row
  into `purgeCharacterCache` would either do nothing useful (if scoped to
  that one Character, it can't reach a sentinel row not keyed to any
  Character) or over-purge (if it swept the whole shared row on every
  Character's own revoke, one Character leaving would blank a name every
  _other_ Character in the roster still has every right to see).

- **The real boundary is the roster reaching zero, not any one Character's
  consent changing.** The entire justification for sharing a name across
  Characters at all (the earlier decision doc) is that every Character tried
  is one the same person already added to their own `db.characters` — never
  a stranger. That holds exactly as long as the roster it was true for still
  exists. Once it's empty, whoever adds a Character next has no relationship
  to the roster that resolved these names, and the browser must not hand them
  someone else's citadel names as if they were public reference data. This is
  the literal scenario `docs/ARCHITECTURE.md`'s "a stale grant can never serve
  the previous owner's data" invariant exists for: a shared/reused browser
  profile where one person's roster is fully removed and a different person's
  begins.

- **`purgeSharedStructureCache()` is therefore a fourth, narrower purge
  primitive in `esi/cachePurge.ts`, called from `removeCharacter.ts` only
  when `db.characters.count() === 0` after the delete — never on every
  removal.** It range-deletes the `structure:` prefix under
  `GLOBAL_CACHE_CHARACTER_ID` specifically, leaving every other global row
  (station names, universe types — genuinely public, no trigger needed)
  untouched, and leaving any _remaining_ Character's own per-Character
  structure rows untouched too (those aren't under the sentinel at all).

- **The prefix moved to `esi/cache.ts` as `STRUCTURE_CACHE_KEY_PREFIX`, rather
  than `cachePurge.ts` importing it from `features/character/structures.ts`.**
  `docs/ARCHITECTURE.md` places `src/esi` below `src/features` — the reverse
  import would have been the wrong direction for the sake of one string
  constant. `structures.ts`'s own three key-builders (`cacheKey`,
  `forbiddenKey`, `rosterForbiddenKey`) now compose off that shared constant
  instead of repeating the `'structure:'` literal, so there is exactly one
  place that prefix is spelled.

- **Also extracted while touching this file: the freshness check duplicated
  between `readMemo` and `resolveViaRoster`** (`Date.now() - fetchedAt <
FORBIDDEN_MEMO_MS`, flagged by the same review as a minor Duplicated Code
  smell) into one `isMemoFresh` helper. No behaviour change.
