# 0005 — Planetary scope consent wording, and PI v1 scope

## Status

Accepted (2026-09-01). Superseded in part by ADR 0011 (2026-09-04): the "No
new SDE payload" and throughput-deferral decisions below no longer hold. The
consent-wording and colony-health-only staleness discipline are unaffected —
see ADR 0011's Consequences for exactly which parts stand.

## Context

`esi-planets.manage_planets.v1` is the only scope CCP publishes for planetary
industry data, and it grants exactly two GETs
(`/characters/{id}/planets`, `/characters/{id}/planets/{planet_id}`) with no
write operations in the current ESI surface. CONTEXT.md's "Read-only" scope
decision holds at the behaviour level, but EVE's own consent screen renders
the scope's name as "manage your planetary installations" to a user of an app
that otherwise advertises itself as read-only — a wording Neocom Desk does
not control and cannot change.

Separately, the full per-planet ESI response mixes two kinds of data: fields
fixed at pin install (`expiry_time`, `extractor_details.cycle_time`,
`qty_per_cycle`, `heads`) and fields ESI's own spec says are "only
recalculated when the colony is viewed through the client" (stored
`contents[].amount`, `last_cycle_start`). A dashboard that used the second
group would confidently display numbers that can be arbitrarily out of date.

## Decision

**Consent wording.** State the scope's literal consent-screen wording and the
no-writes claim plainly at the point of login, rather than softening or
omitting it. This already ships as `login.permissionsHint`
(`src/i18n/locales/en.json`): "EVE's consent screen lists the planetary scope
as 'manage your planetary installations' — Neocom Desk only reads that data
and never writes to it." The honesty is in the disclosure, not in trying to
make the scope name say something CCP didn't write.

**PI v1 scope: colony health only.** Ship the colony list and each colony's
pins, with idle/expiry warnings computed _only_ from `expiry_time`
(`engine/pi/colonyStatus.ts`). Never derive a warning from `contents[].amount`
or `last_cycle_start`. The UI states the staleness rule directly
(`pi.stalenessHint`/`pi.stalenessTooltip`) rather than leaving a user to infer
why a number looks wrong. Storage-fullness readouts, chain-input-starvation
warnings and the routed production-chain graph (`links`/`routes`) are
deferred — all three would need the untrustworthy fields, or add a
significantly larger UI (a node graph) for a v1 whose value is "which colony
needs attention."

**No new SDE payload.** Extractor product names and factory schematic names
are resolved live via the existing type-name cache
(`features/character/typeNames.ts`) and a new public
`GET /universe/schematics/{schematic_id}` wrapper (`features/pi/names.ts`),
not baked into a build-time snapshot. `GET /universe/schematics/{id}` returns
only `{schematic_name, cycle_time}` — no inputs/outputs/quantities — so it
cannot answer "what does this factory consume", but it is sufficient to
identify what a factory pin is running, which is all v1 shows. Measured
impact: **zero bytes** added to `public/data/` — confirmed by `npm run
build`, no new `FILES` entries in `scripts/build-sde.mjs`. The tradeoff is
explicit: showing factory _inputs/outputs_ would need the SDE's
`planetSchematicsTypeMap` table and is left to a later iteration if the
"what does this consume" question turns out to matter to users.

## Consequences

- A character that revoked the planetary scope out-of-band sees the same
  runtime re-auth banner every other single-scope gated route uses
  (`app/routeScopes.ts` `/planetary-industry` entry) — no special-cased UX.
- The colony list's own `last_update` (when CCP last recalculated it) and
  Neocom's `DataAgeBadge` (when we last fetched from ESI) are two distinct
  staleness signals shown side by side, per `docs/plans/feature-parity/briefs/G-newscope-views.md`'s
  investigation of this endpoint — collapsing them into one would misstate
  which staleness a user is looking at.
- If a future iteration adds throughput/chain visualization, it will need the
  untrustworthy fields it was deliberately kept away from here, or a
  different data source (e.g. the user manually opening colonies in-client
  more often). That is a new decision, not a reversal of this one.
