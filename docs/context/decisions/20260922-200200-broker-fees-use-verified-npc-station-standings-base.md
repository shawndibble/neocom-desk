# Scope decisions — Broker fees use verified NPC-station standings, base grant (issue #1238)

_Recorded 2026-09-22 · issue #1238._

- **The broker fee uses _unmodified_ (base) standing, not effective
  standing.** Verified against EVE University's "Trading" wiki page (which
  cites CCP's own Broker Fee and Sales Tax support article — that page itself
  returned HTTP 403 to a direct fetch, so the wiki is the primary source on
  record here), 2026-09-22: "Note that the unmodified standing is used for
  the calculation so skills that increase standings have no effect on
  broker's fees." Connections, Diplomacy and Criminal Connections — which
  raise _effective_ standing — therefore need no representation anywhere in
  this feature; `src/engine/industry/fees.ts` already only accepted raw
  `factionStanding`/`corpStanding` numbers, so nothing about its shape
  changed.
- **The per-point rates already in `fees.ts` (0.03%/faction point,
  0.02%/corp point) are confirmed correct** against the same source, so the
  constants (`FACTION_STANDING_PCT_PER_POINT`, `CORP_STANDING_PCT_PER_POINT`)
  are unchanged — this ticket wires real values into existing, already-correct
  math rather than fixing the math itself.
- **`esi-characters.read_standings.v1` goes in the base grant**, alongside
  `read_contacts`/`read_loyalty`, not a new opt-in `ScopeGroup` — same
  reasoning as `docs/context/decisions/20260921-003049-add-calendar-rsvp-write-scope-to-base-grant.md`:
  standings feed a calculation nearly every character's Build Plan/Open
  Orders/LP-store flows already touch, so gating it behind an opt-in step
  would be pure friction.
- **This scope degrades silently — deliberately unlike the calendar-RSVP
  precedent above.** RSVP's precedent (and `organize_mail` before it) is:
  attempt the call, and on a 401/403 call `emitEsiAuthFailure` so the shared
  `AuthFailureNotice` banner offers a one-click reconnect. Standings does the
  opposite on purpose: `src/features/character/standings.ts`'s
  `loadCharacterStandings` passes `detectAuthFailure: () => false` to
  `loadWithCache`, so a token that predates this scope (a 403) is treated as
  an ordinary "nothing cached, fall back" case — no banner, no reconnect
  nudge. The acceptance criterion is explicit that a missing scope must fall
  back to zero standings ("today's behaviour") without blocking anything;
  RSVP and mail-organize are actions the character asked for and that
  silently no-op-ing would hide as a bug, where a broker fee that is merely
  slightly higher than it could be is not something worth interrupting every
  pre-existing character's session to fix.
- **Standings apply only to NPC stations, never to player structures.**
  `src/features/market/locationStandings.ts`'s `resolveLocationStandings`
  gates on `lookupNpcStation`: a `null` result (a known player structure) or
  `undefined` (the SDE snapshot itself could not be read, so the location's
  kind is unknown) both fall back to zero standings without spending a
  request — matching the ticket's "player-structure orders are unchanged"
  criterion and the same three-valued discriminator `stations.ts` already
  uses for names.
- **The station owner's corporation and faction are resolved live via ESI,
  not by extending the SDE snapshot.** `staStations.csv` (the source behind
  `public/data/market/stations.json`) has no owning-corporation column, so
  adding one would mean ingesting a new CSV into `scripts/build-sde.mjs` and
  regenerating the snapshot — a much larger change for a value ESI already
  serves per-station (`GET /universe/stations/{id}`'s `owner` field) and
  caches indefinitely (`STALE_AFTER.static`, same as the rest of
  `stations.ts`). `loadPublicCorporationInfo` (already used for
  `PublicInfoModal`) supplies the corporation's `faction_id`, so no new ESI
  endpoint was needed for that half.
- **`GET /characters/{character_id}/standings/` is assumed to return base
  (unmodified) standing, not effective standing.** ESI's own documentation
  does not say this explicitly either way; the assumption rests on this
  being the same value EVE's character sheet and the in-game standings list
  show, which every other consumer of this endpoint (third-party trading
  tools, the wiki source above) treats as base standing. If this ever proves
  wrong, `resolveLocationStandings`/`resolveOwnerStandings` are the only two
  functions that would need to change — everything else here is indifferent
  to which kind of standing the numbers represent.
- **Known gap: a Production Run's realized profit uses the plan's Trade Hub
  standing, not the watched sell order's actual station.**
  `ProductionOrderWatchRecord` (`src/db`) carries only an `orderId`, no
  `location_id`, so `productionRunSummary.ts`'s `summarizeProductionRun` has
  no way to resolve the order's real location and falls back to the plan's
  configured Trade Hub. This is a knowing departure from "player-structure
  orders are unchanged": a watched order actually sitting in a player
  structure would get non-zero NPC standings applied here. Fixing it
  properly needs `location_id` added to the watch record (a schema change
  out of scope for this ticket) or a live per-order ESI lookup keyed by
  `orderId` alone; either is follow-up work, not blocking, since realized
  profit already only ever _estimates_ — the "confirmed sale" framing in
  `realizedProfit.ts`'s own module doc already accepts this class of
  approximation for `brokerFeeableRevenue`.
- **`resolveOwnerStandings` (`src/engine/market/standings.ts`) matches a
  standings row by `from_id` alone, ignoring `from_type`.** ESI's exact enum
  spelling for an NPC-corporation standings row was not confirmed against a
  live fetch during this work; EVE's id ranges for agents, NPC corporations
  and factions never overlap, so matching by id alone means a wrong or
  differently-spelled `from_type` string can never silently zero a real
  standing.
