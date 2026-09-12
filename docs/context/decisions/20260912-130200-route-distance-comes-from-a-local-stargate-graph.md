# Scope decisions — Route distance comes from a local stargate graph, not one ESI request per pair (issue #942)

_Recorded 2026-09-12 · issue #942._

- **The jump graph ships as an SDE snapshot, which makes round 14's "needs no
  local pathfinding graph" stale rather than wrong.** That round was decided
  for the Assets page, where a distance is wanted one station at a time and
  `/route/` answers it in one request — there a local graph genuinely bought
  nothing. The cost only became load-bearing once a distance was wanted for
  _every row of a table_: fifty rows meant fifty requests before the table
  could sort, which is why ISK/jump kept being pushed into a per-opened-row
  detail view. Stargate adjacency is static map data of the same kind
  `systems.json` and `stations.json` already carry, so shipping it turns a
  distance into arithmetic. Rules out reading round 14 as a standing
  prohibition, and rules out a per-row `/route/` fan-out as the alternative.

- **`market/jumps.json` holds a key for every solar system, including the
  gateless ones.** Emitting keys only where a gate exists made "absent from the
  graph" carry two incompatible meanings at once: J-space (a real system with
  no stargates) and a garbage id (not a system at all). That collapsed a
  same-system haul in any of the 3,222 gateless systems — every wormhole among
  them — into `no-route`, where the true answer is zero jumps. An explicit `[]`
  makes membership mean "is this a solar system", the same discriminating role
  `stations.json`'s completeness already plays for "station or player
  structure". Costs ~48 KB. Rules out inferring "has no gates" from absence.

- **The two biased preferences weight, they do not filter.** `prefer-highsec`
  makes a non-highsec system expensive rather than impassable, so a nullsec
  delivery still resolves. A hard highsec-only filter would answer "no route"
  for every haul into null — a false statement about the game rather than a
  conservative one, and a hauler who prefers highsec still wants to know how
  far the job is. Rules out implementing the preferences as edge filters.

- **A system whose security the snapshot does not state is treated as not
  highsec.** A `prefer-highsec` route must never claim safety for a system it
  cannot vouch for, so the unknown case falls to the expensive side. Rules out
  defaulting an unstated security to highsec for convenience.

- **Three outcomes stay distinct all the way to the consumable API: a route,
  `no-route`, and `unknown`.** `no-route` is a fact about New Eden; `unknown`
  means a snapshot could not be read (offline first visit — these files sit
  outside the install precache). Collapsing them would let an offline first
  visit report "no gate route exists" for every haul in the game. This is why
  the jump-count helper does not reuse `engine/jumpsAway.ts`'s
  `JumpsAwayResult`, whose two reasons are the Assets page's own and cannot
  express `unknown`.

- **A distance for many rows is one sweep from the origin, not one search per
  row.** `jumpDistancesFrom` runs Dijkstra to exhaustion and answers every
  reachable system at once; measured on the shipped graph, that costs about
  what two single-pair lookups do, so 500 rows across 5 hub origins is ~9 ms
  against ~420 ms of unbroken main-thread work done pairwise. The pair API
  stays for a single opened row. This matters because the ESI resolver being
  replaced _does_ cache each pair, so a per-row local search would have made
  the local path the slower of the two.

- **The Assets page keeps its ESI `/route/` resolver.** Migrating existing
  callers onto the local graph is its own change with its own regression
  surface; this ships the graph, not a migration. Rules out touching
  `features/character/routeDistance.ts` here.

  Two seams are left open by that deferral, recorded so they are decided
  rather than rediscovered:

  - **Result shape.** `JumpsAwayResult` is two-valued (`known` | `unknown`);
    `LocalJumpsResult` is three-valued, and the bullet above argues the
    three-valued one is the honest shape. Migrating means deciding whether the
    ESI path gains `no-route` or the local path loses it.
  - **Preference vocabulary.** Three now describe one concept:
    `RoutePreference` (`shortest`/`safest`, a persisted device-local setting),
    `RoutePreferenceKind` (the engine's three), and ESI's own
    `shortest`/`secure`/`insecure` behind `routeFlagFor`. The engine's is the
    superset. Unifying is cheap today and becomes a stored-value migration
    once a second persisted preference control ships, so it should happen
    before that, not after.
