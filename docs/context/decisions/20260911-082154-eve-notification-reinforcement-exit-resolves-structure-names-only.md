# Scope decisions — EVE notification reinforcement-exit resolves structure names only for in-horizon entries

_Recorded 2026-09-11._

- **`eveNotificationDomain`'s projection (`pollDomains.ts`) resolves structure
  names only for entries whose reinforcement-exit instant falls inside the
  72-hour projection horizon**, via the new pure
  `engine/projection.ts#reinforcementExitStructureIds`, rather than resolving
  every allow-listed/enabled entry's structure id up front. Sentry flagged an
  N+1 fan-out of `GET /universe/structures/{id}` on `/skills` navigation
  (issue transaction span evidence, 2026-09-10): most eligible entries are
  outside the horizon and `projectEveNotificationReinforcementExit` produces
  no row for them, so their names were being resolved and then discarded.
  `reinforcementExitStructureIds` runs the identical `reinforcementExitMs` +
  horizon gate the projector runs, so this can only remove lookups whose
  results were never used — callers must pass the projection's own `nowMs` to
  both, not a fresh clock read, or the two can disagree on which entries
  survive.
- **No bulk fix at the ESI layer is possible for this call.** `POST
/universe/names`'s documented `category` enum
  (`src/esi/endpoints.ts`, `UniverseName`) covers alliance, character,
  constellation, corporation, inventory_type, region, solar_system, station,
  and faction — no `structure` category exists, because player-owned
  structures are ACL-gated per character rather than public data CCP can
  batch-resolve. `GET /universe/structures/{id}` stays one call per structure
  per character; `features/character/structures.ts`'s per-character and
  roster-wide forbidden memos are the mitigation that already exists for that
  shape of cost, and this decision doesn't change them.
- **The "hundreds of structures" case in the Sentry ticket is a different call
  site**, already addressed: the notifications endpoint this domain reads
  caps at roughly 50 entries per character, so `eveNotificationDomain` can
  never itself produce hundreds of lookups. A roster or corp with hundreds of
  distinct structures shows up through Assets/Corp Assets instead, which
  `structures.ts`'s memos already bound.
