# 0011 — PI Advisor: CPU/Powergrid as the real pin cap, a build-time infrastructure payload, and throughput as a second budget

## Status

Accepted (2026-09-04). Supersedes ADR 0005 in part — see Consequences for
which parts of 0005 stand.

## Context

ADR 0005 scoped Planetary Industry v1 to "colony health only": idle/expiry
warnings computed solely from `expiry_time`, with storage-fullness readouts,
chain-input-starvation warnings and a routed production-chain graph all
deferred as needing ESI's untrustworthy `contents[].amount`/`last_cycle_start`
fields, or a UI too large for a v1 about which colony needs attention. It also
recorded "No new SDE payload": factory and extractor product names resolved
live, zero bytes added to `public/data/`.

Since then, Planetary Industry gained a third peer tab, **Advisor**
(CONTEXT.md round 51), which answers a question neither Colonies nor Plan
does: in _this_ system, on _these_ planets, what fits. That question turned
out to be a CPU/Powergrid question — the game caps a colony by a **budget**,
not by any pin-count limit — plus a materials-flow question, and both needed
data 0005 explicitly said would not be added.

## Decision

**A CPU/Powergrid pin-budget engine, not a pin-count limit.**
`engine/pi/pinBudget.ts` fits a colony's pins arithmetically against two
independent ceilings — CPU and Powergrid — and reports which one binds
(`fitColony`, `spareCapacity`). A colony's own budget comes from its Command
Center's `upgrade_level`, read per colony off ESI; the pilot's Command Center
Upgrades skill is only the _ceiling_ on how far any one colony may be
upgraded, never the budget itself (`features/pi/colonyBudget.ts`,
`docs/research/pi-cpu-power-mechanics.md` §2).

**`pi.json` gains an `infrastructure` block and a planet-type map.**
Per-pin CPU/Powergrid cost and storage capacity, the Command Center's base
output, extractor-head cost, each pin's planet-type restriction, and the
schematic-to-pin-kind map are all derived from the SDE dump at build time
(`scripts/build-sde.mjs`) — the same "no new SDE payload" discipline 0005
asked for, just no longer honoured as "zero payload". The one exception,
flagged the same loud way `P0_PLANET_TYPES` already was, is the Command
Center Upgrades table above level 0: skill type 2505 carries no dogma effect
that scales a deployed Command Center, so levels 1-5 are hand-maintained from
EVE University's wiki and only the level-0 row is asserted against the
dump at build time.

**Throughput is modelled as a second, independent budget.** `checkThroughput`
answers a question CPU/Powergrid says nothing about: does the material flow
fit through a link, and does a buffer cycle fit the Launchpad and Storage
Facility. A colony's whole flow is compared against a single link's capacity,
deliberately over-reporting pressure — a real colony spreads flow over many
links the app never sees placed. This shipped **without** the fields 0005
deferred it over: the inputs are pin counts, each pin's static capacity, and
each extractor's own sustained rate off its decay curve — never
`contents[].amount` or `last_cycle_start`.

## Consequences

- **0005's "No new SDE payload" is superseded.** `pi.json` now carries the
  `infrastructure` block and planet-type map described above. The tradeoff
  0005 named — a later iteration needing more payload if the question turned
  out to matter — is the tradeoff that was taken.
- **0005's throughput deferral is superseded, but not the way it predicted.**
  0005 said a future throughput/chain feature "will need the untrustworthy
  fields it was deliberately kept away from here, or a different data
  source". Neither happened: throughput is a flow-vs-capacity comparison over
  measured, install-fixed data, not over the recalculated-on-view fields 0005
  was protecting against.
- **0005's staleness discipline survives untouched.** The pin budget and
  throughput check still draw only on pin counts and install-fixed fields
  (`extractor_details.heads`, `qty_per_cycle`, `cycle_time`, projected through
  `engine/pi/extraction.ts`'s decay curve) — never `contents[].amount` or
  `last_cycle_start`. Storage-fullness readouts and chain-input-starvation
  warnings, the two things 0005 named as needing those fields, remain out of
  scope; this ADR expands what "colony health" data-sources into, not what
  it's willing to trust.
- **0005's consent-wording decision is untouched.** The scope's consent-screen
  wording and no-writes disclosure are a separate concern from what data v1
  reads, and nothing here changes either.
- The Advisor's own remaining gaps — a rank-order resource-richness input for
  unbuilt planets, and scoring a candidate stop tier by margin/hour — are
  tracked as GitHub issues #425 and #426, not recorded here: they are missing
  _inputs_ to this engine, not a different architectural decision about what
  the engine should be.
