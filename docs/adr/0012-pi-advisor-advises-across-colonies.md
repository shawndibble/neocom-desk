# 0012 — The PI Advisor advises across a character's colonies, not one planet at a time

## Status

Proposed (2026-09-06). Extends ADR 0011; supersedes none of it.

## Context

ADR 0011 made the Advisor a per-colony surface: `engine/pi/pinBudget.ts` fits
one chain against one Command Center's budget, and `engine/pi/stopTier.ts`
enumerates candidates for one planet. `localChainTargets` gates that
enumeration on **that planet's own P0 closure** — deliberately, because
recommending a P2 whose second input the planet cannot extract is exactly the
confidently-wrong answer the tab exists to avoid.

That gate has a consequence nobody costed. A pilot running four colonies in
one system, each extracting a different P0 and refining it to a different P1,
gets "Keep selling … raw" on all four cards — because no single planet can
reach a P2 by itself, even though the four planets together can reach four of
them. On the reported operation (Efa, four colonies making Bacteria, Reactive
Metals, Water and Plasmoids) every pairwise P2 exists in the payload:
Test Cultures, Water-Cooled CPU, Nanites and Superconductors. At Jita sell
prices one advanced factory turns 40 + 40 P1/hr worth 35–45k ISK into 5 P2/hr
worth 38–56k, a 5–27% uplift the tab was structurally unable to mention.

Two things block saying so, and they are different in kind.

**The chain shape.** `chain.ts` charges customs tax per _planet_ boundary and
takes a `ChainLayout` of `single-planet` or `planet-per-tier`. Neither
expresses what this needs: a P2 made on one planet from one input it refines
itself and one imported from a sibling colony.

**The supply.** A per-colony recommendation treats material as free once the
budget fits. Across colonies it is not: the four colonies above produce 141,
162, 227 and 264 P1/hr, an advanced factory eats 80, and Water is an input to
three of the four best P2s. Powergrid alone would say twenty factories fit
once the surplus basic factories come out; material says nine. Recommending
against budget alone would repeat, one layer up, the defect this tab was just
fixed for — promising capacity that is not there.

## Decision

**A new pure engine module, `engine/pi/network.ts`, not a widened
`stopTier.ts`.** `recommendStopTier` answers "what should _this_ planet do",
and its answer stays valid and unchanged; the network question has a different
input (a colony _set_), a different output (an assignment) and a different
failure mode (supply, not fit). Folding them would make the per-planet answer
depend on colonies the card is not about.

**No new `ChainLayout` value; the marginal accounting falls out of the one
that exists.** `chainCost(p2Chain, { sourcingFloor: 'P1', layout:
'single-planet' })` already computes revenue on the P2, less the market price
of its P1 inputs, less the import tax onto the consuming planet, less the
export tax on the P2. That is _exactly_ the delta against selling the P1s
raw: the export tax each P1 pays leaving its own planet is incurred either
way and cancels, and the market price of a P1 is precisely the opportunity
cost of routing your own instead of selling it. So the accounting is reuse,
not new arithmetic, and the existing tax tables (`CUSTOMS_TAXABLE_VALUE`,
`IMPORT_TAXABLE_FRACTION`, verified against #304) keep their single home.

**Supply is a first-class constraint, allocated greedily by margin per
factory, and the greediness is stated.** Candidates are ranked by ISK/hr per
advanced factory and given supply until an input runs out. This is not
provably optimal — a high-margin candidate can consume an input several
lower-margin ones needed — and the surface says so rather than implying a
solved optimum. An exact solve is a small LP, and is not worth a simplex in
this app for a set that is at most a handful of colonies; if a real case is
found where greedy loses materially, that is the trigger to revisit, and the
module returns enough of its working for such a case to be recognised.

**A host colony must satisfy both constraints, checked in that order.** The
recommendation names which colony hosts the factories, and it must have the
CPU/Powergrid for them — charged the same way "Room for" now charges, one new
link per new pin (`spareCapacity`'s `newLinkCost`, decision file
2026-09-06). A candidate that fits nowhere is reported as such rather than
dropped, because "you need more powergrid for this" is the actionable half.

**Extraction is not re-planned here.** The P1 rates this module allocates are
each colony's own _measured_ output, projected through
`engine/pi/extraction.ts`'s decay curve. Nothing here proposes changing what a
colony extracts; that is `stopTier.ts`'s question, and answering both at once
would produce a recommendation resting on a second recommendation the pilot
has not taken.

## Consequences

- **The Advisor gains a system-level surface** above the per-planet cards.
  The cards keep saying what they say; the new panel says what the colonies
  could do together, and names the routes it depends on.
- **The per-colony "Build up to" line can now contradict it** — it will still
  say "keep selling raw" on a planet the network panel wants to host a P2 —
  and that is a real inconsistency to resolve in the UI copy, not by making
  either engine lie. The per-planet line is true about the planet alone, and
  has to say so.
- **0011's "measured beats estimated" rule carries over unchanged.** Every
  input here is read: pin counts, each program's own decay-curve rate, each
  colony's own Command Center level and its own measured link cost. The only
  projected figure is the margin, which is a price times a measured rate.
- **This does not model routes inside a colony.** ESI reports `routes[]` and
  the app reads them, but which pin feeds which is a placement problem the
  Advisor has never solved and does not start solving here. The
  recommendation is "ship this P1 to that planet", not a pin-by-pin routing
  table.
- **P3 and above are out of scope for the first cut.** A P3 needs three P2s,
  which multiplies the assignment problem by the number of host choices for
  each intermediate, and no reported operation is close to that constraint
  yet. The module's shape does not preclude it.
