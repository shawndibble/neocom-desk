# Scope decisions (round 51) — the Planetary Industry Advisor tab

_Recorded 2026-09-04._

- **Planetary Industry gains a third peer tab, Advisor** (`?tab=advisor`,
  `?tab=advisor&system=30002187`), beside Colonies and Plan. It is a third
  tab rather than more of either because it answers a question neither does:
  Colonies reports what is already running, Plan works backwards from a
  product and is deliberately planet-agnostic, and neither says "in _this_
  system, on _these_ planets, what fits". That last question is a Pin Budget
  question, so the Advisor is the surface for it.
- **Every number on the Advisor is measured; the estimate is deliberately
  absent.** A built colony's pins are read off ESI, its extraction rates come
  from each program's own decay curve, and its budget from the colony's own
  Command Center `upgrade_level` — also read off ESI, not assumed from the
  pilot's trained skill. The header's own ceiling stat is the one figure that
  does read the trained skill, since it answers a different question ("how
  far could a colony here go") — see the last bullet below. An unbuilt planet
  gets its type and the P0 resources that type yields, and stops there — no
  ISK figure, no yield.
- **The rank-order richness input is not built, and this is a deferral with a
  reason, not an omission.** ESI carries no per-planet resource richness at
  all (already recorded in `engine/pi/chain.ts`'s own header), and the in-game
  scan overlay shows a colour map rather than a number, so the only honest
  user input is a best-to-worst _ordering_ per planet. That ordering is
  **Editable Data** — it needs a Dexie table and sync wiring, keyed per
  planet and per resource — and whether it is per-Character or fans out
  account-wide is exactly the question round 7 settled for **Station Pins**
  and must be settled here too rather than picked silently. Until it exists,
  an unbuilt card says so instead of showing a number sized off an assumed
  average.
- **The system picker offers only systems the character already has a colony
  in**, not an arbitrary system search. Without the rank-order input above, a
  never-colonised system would render nothing but unmeasurable cards, so the
  search would be a control that cannot pay off yet. The planet list within a
  chosen system still comes from `/universe/systems/{id}`, so unbuilt planets
  in a system the character is already in do appear — which is where the
  useful comparison sits anyway.
- **The measured path never goes through the hypothetical one.** Sizing a
  ratio block derives an extractor count from chain demand and one assumed
  yield rate, which is right for a colony that does not exist and wrong for
  one that can simply be read. A built colony's pins are a fact, and so is
  each extractor's own head count — `extractor_details.heads` is per-pin, so
  a colony with a ten-head and a three-head extractor is charged for
  thirteen heads rather than for an average neither has.
- **CPU/Powergrid headroom is reported per pin kind, not as one percentage.**
  One number says a colony is 87% full; six say it has room for three more
  factories and no extractor at all, which is the actionable form. The kinds
  are independent alternatives, not a plan — two of one and one of another
  may well not fit together. A hypothetical extra extractor is costed with a
  full ten heads, since a head-light ECU reaches less and quoting the cheap
  end would promise room for an extractor nobody would build.
- **`pi.json` grows an `infrastructure` block and a planet-type map, both
  derived from the SDE dump at build time** — pin CPU/Powergrid from dogma
  `powerLoad`/`cpuLoad`, capacity from `invTypes.capacity`, the Command
  Center's base output from `powerOutput`/`cpuOutput`, extractor-head cost
  from attributes 1690/1691, each pin's planet type from `planetRestriction`,
  and which factory runs a schematic from `planetSchematicsPinMap`. That last
  one matters: the facility is **not** inferred from the schematic's tier,
  even though the two agree across the current recipe set, because the
  mapping is in the dump and agreement is a fact about today's recipes rather
  than a rule. Pin costs are read across all eight planet-type variants and
  asserted to agree, so "one representative per kind" is a checked conclusion.
- **Two tables in this feature are hand-maintained rather than dump-derived,
  and only one is checked at build time.** The Command Center's own
  per-upgrade-level CPU/Powergrid output (indexed by the colony's own
  `upgrade_level`, not the pilot's skill — see the Pin Budget glossary entry)
  has no dogma effect to derive it from, since skill type 2505 carries none.
  It is hand-maintained in `scripts/build-sde.mjs` with the same loud
  not-from-the-dump banner `P0_PLANET_TYPES` carries, and the build asserts
  its level-0 row against the dump's own Command Center output — so a dump
  whose base numbers move fails the build rather than shipping a table that
  disagrees with its own first row. Levels 1-5 remain secondary-source (EVE
  University) and are flagged as such in
  `docs/research/pi-cpu-power-mechanics.md`. `EXTRACTOR_HEADS_MAX`
  (`engine/pi/pinBudget.ts`) is the second hand-maintained, EVE-University-
  sourced constant — no dogma attribute states an Extractor Control Unit's
  head cap either — but unlike the Command Center table it has **no
  build-time assertion behind it at all**; the only guard on it is
  `fitColony` throwing at runtime on an out-of-range head count, which
  validates a caller's input, not the constant itself against a source.
- **Link capacity is a parameter with `null` as a first-class value.** A basic
  link moves 1,250 m3/hr and each upgrade level doubles it to 40,000 at V,
  but whether that upgrade axis is the _same_ skill as the Pin Budget table
  is not confirmed, so the engine never picks a level: an unsupplied capacity
  yields an explicit `link-capacity-unknown` verdict rather than a guess.
  Same treatment `chain.ts` already gives `extractionRate`.
- **A colony's whole flow is compared against a single link's capacity,
  deliberately over-reporting pressure.** A real colony spreads that flow
  over many links, but which pin sits where is a placement the app never
  sees. Over-reporting flags a layout to look at; under-reporting would
  quietly pass one that cannot move its own output.
- **An assumed budget is never shown as a measured one.** A character who has
  never trained Command Center Upgrades and one whose `/skills` has never
  loaded both get the level-0 budget, and only the first may be presented as
  fact — the same distinction `customsRateSource` draws for the customs rate
  and the colony `unknown` state draws for health. The chip says "(assumed)"
  and its tooltip says every card below understates its headroom.
- **The designed pin-budget algorithm has seven steps; this round ships five.**
  1. budget from the colony's own upgrade level, 2) fixed overhead, 3) ratio
     block from the recipe graph, 4) scale against both ceilings, 5) throughput
     check — all shipped, tested, reachable from the Advisor. 6) score each
     candidate stop tier by margin/hour through the existing `chainCost()`, and
  2. pick the best that also clears step 5 — neither shipped. So the Advisor
     reports what a planet is doing and what it has room for, but never "build up
     to P2 here", which was part of the tab's own stated purpose. Tracked as
     #426, blocked by #425. The block is real, not just deferred effort: scoring
     needs a price per candidate product, and the candidate _set_ for an unbuilt
     planet depends on the same deferred richness ordering the rank-order bullet
     above already accounts for. What that bullet does not account for is a
     _built_ colony — it already has a measured sustained rate and could be
     scored today; what stops it is the same missing price wiring, and whether
     shipping tier advice on built cards alone is worth doing ahead of #425 is
     #426's own open triage question, not a settled no.
- **Most of `pinBudget.ts` therefore ships with no production caller.**
  `planColony`, `fitColony`, `checkThroughput`, `singleFactoryChain` and
  `chainBlockPins` are reached only by their own tests; the app reaches just
  `pinsLoad` (`features/pi/adapters.ts`) and `spareCapacity`
  (`AdvisorPanel.tsx`). That is the honest cost of shipping steps 1-5 ahead of
  6-7 rather than a sign anything is wrong today — but if #426 is ever closed
  as wontfix, that unused surface should be deleted rather than left in place.
