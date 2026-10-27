# Scope decisions — roster fallback and shared cache for a forbidden structure (issue #669)

_Recorded 2026-09-09 · issue #669._

- **A 403 on `GET /universe/structures/{id}` is not something to eliminate —
  it is the correct answer for a Character off that structure's ACL.** #655
  stopped those 403s from cascading into an app-wide 420; it never promised
  they would stop happening. A user reporting "still seeing 403s" after #655
  shipped was seeing exactly the designed post-fix state (bounded, once a day
  per Character). This ticket is a separate, additive improvement on top of
  that, not a fix to #655 itself.

- **Reversed: `structures.ts`'s own header said caching a resolved name
  globally "would leak it to a character not on that ACL."** That was true of
  a stranger. It is not true of another Character the same person has already
  added to their own `db.characters` — ESI's ACL is per-Character, not
  per-account, so a corp mate's alt logged into this same browser can
  genuinely see a citadel this Character cannot, and there is no reason to
  hide that name from the rest of the same person's own roster once one of
  their Characters has proven access. The distinction that matters is _whose_
  Characters share the row, and it is scoped exactly to `db.characters` — not
  to every user of the app, and not to a server-shared cache (there is no
  server; `esiCache` is a local Dexie table, per browser).

- **The roster fallback is tried only on a _confirmed_ 403, never on "no data
  yet."** Offline, a 5xx, or simply nothing cached says nothing about the ACL,
  and sweeping the whole roster over a blip would multiply exactly the
  fan-out #655 spent its budget cutting. `loadOwnStructure` reports
  `forbidden: true` only for a fresh 403 or a same-day per-Character refusal
  memo; anything else short-circuits to `null` with no roster spend at all.

- **The sweep is sequential and stops at the first success, not parallel.**
  Parallel would need cancellation to actually realize "stop at the first
  success" — without it, every candidate would be asked regardless, which is
  the fan-out this exists to avoid. Sequential also means a candidate that
  already carries its own same-day forbidden memo answers instantly with no
  network call, so the only live ESI calls a sweep spends are on roster
  members being asked about this structure for the first time that day.

- **A roster-wide miss is memoized separately from the per-Character one
  (`rosterForbiddenKey`, global sentinel row, same 24h clock).** Without it, a
  citadel none of the roster can see would be swept again every time a
  _different_ Character happened to hit it first that day — turning one
  forbidden structure into one sweep per Character instead of one sweep for
  the whole roster. A Character new to the roster still gets its own single
  live attempt even after the roster-wide memo is set, since it could be the
  one Character that actually has access; that attempt does not by itself
  re-trigger a full sweep of everyone else.

- **No new gating was added for the roster fallback's own ESI calls.** Every
  call `getUniverseStructure` makes — the asking Character's own, and each
  roster candidate's — already passes through `esi/budget.ts`'s app-wide gate
  from #655 item C. A sweep that meets a spent error budget is spaced or
  refused by that existing circuit exactly like any other ESI call, falling
  back to cache rather than adding to a storm. Building a second, bespoke
  budget check here would duplicate that policy in a second place — the
  thing #655 itself was written to avoid.

- **The shared name row has no TTL of its own.** It is a raw `readCached`/
  `writeCached` pair, not `loadWithCache`, so nothing proactively expires it —
  it is served exactly as stored until some future successful resolution (by
  any Character) overwrites it. Structure names essentially never change, and
  the per-Character path already re-asks on the existing 24h window and
  refreshes the shared row on any success, so there is no gap this leaves
  open.
