# Scope decisions (round 56) — the Advisor recommends a stop tier (issue #426)

_Recorded 2026-09-04 · issue #426._

Round 51 shipped five of the pin-budget algorithm's seven steps and recorded
the other two as deferred. This round ships them: the Advisor now says "build
up to P2 here" on a built colony, which was half the tab's stated purpose.
Round 51's "this round ships five of seven" and its "most of `pinBudget.ts`
therefore ships with no production caller" are both superseded — `planColony`,
`fitColony`, `checkThroughput`, `singleFactoryChain` and `chainBlockPins` are
all reached from the app now, through `engine/pi/stopTier.ts`.

- **Built colonies get a recommendation; unbuilt planets do not, and that is
  the asymmetry #463 created.** Fitting a layout charges every pin against the
  Command Center's budget, and a link's cost depends on the distance between
  the two pins it joins — which only a colony that exists has. #463 made a
  built colony's link draw measurable, so its budget can be reduced by a real
  number before anything is fitted into what is left. An unbuilt planet has no
  links to measure, so the same fit would charge nothing for them and overstate
  what fits by exactly the amount #440 was filed about. **Round 53's "the
  estimate stays out of pin-fitting" therefore still stands for unbuilt cards
  and is lifted only for built ones.** #426's acceptance criteria — written
  before #425's scope round and marked provisional against it — asked for both;
  shipping the unbuilt half would have meant a confident overstatement, so it
  is deliberately not shipped rather than quietly dropped.
- **The residual is stated, not hidden.** A bigger layout needs more links than
  the colony has today, so reserving today's measured link load under-reserves
  for the recommended one. That is the same residual the shipped "room for"
  line already carries — `spareCapacity` prices an extra factory without the
  link it would need — and unlike the pre-#463 state it is bounded by a
  measurement rather than by nothing at all.
- **A candidate is gated on what this planet can actually extract.** Scoring
  is at the P0 sourcing floor, so a P2 needs both its P1s' P0s off this
  planet's own ground. Nothing in `planColony` checks that, and a P2 whose
  second input the planet does not yield would otherwise be recommended on a
  planet that physically cannot supply it. `localChainTargets` keeps only
  products whose whole P0 closure the planet yields. Buying inputs in and
  making a higher tier from them is a real strategy — it is the Plan tab's
  question, which already has the control for it, not this one's.
- **Selling the ore is a candidate, not the absence of one.** `chainCost`
  refuses a floor at or above the target's tier, so "keep extracting and sell
  it" can never come back through it — yet at a 10% customs rate raw P0
  out-earning every made tier is a common and useful answer. Each local P0 is
  its own tier-0 candidate, fitted as repeats of one Extractor Control Unit
  and taxed on its export only. "No tier is profitable" is a much weaker thing
  to tell a pilot than "sell the ore", and this is what makes the second
  reachable.
- **Ties break toward the lower tier, and near-equal counts as tied.** Two
  layouts earning the same ISK an hour are not equally good — the shallower
  one needs fewer factories and fewer links — so the rule is stated rather than
  left to sort order. Margins are floats built from a price, a tax base and a
  block count, so equality is compared with a one-part-in-a-million tolerance;
  exact comparison would let float noise pick the winner, and it picks the
  deeper colony as often as not. **The tolerance is applied against the top
  margin, never inside a sort comparator.** A tolerance is not transitive — A
  can tie B and B tie C while A and C sit a tolerance apart — so a comparator
  built on one is inconsistent, and `Array.prototype.sort` may then return any
  order at all. It does: the same candidates in a different order elected
  different winners, including the deepest tier the rule exists to reject. So
  the maximum is taken first on the raw number, and the tie rule is applied
  only among the candidates level with it.
- **The Advisor says what stopped a recommendation, and never infers it.** When
  no candidate scores, the engine reports a named blocker — the Command Center
  hosts nothing, the hub quotes nothing, everything overflows its buffer,
  everything loses money, or the candidates disagree and no one sentence is
  true. The card spells that out rather than reading it off the entry list,
  which is how the first cut told a pilot whose colony could host nothing that
  their ore was worthless.
- **A recommendation is a whole-colony fit, and says so.** The score is what
  this planet would earn rebuilt at that tier, not what adding a factory would
  add — and it renders directly under the headroom line, which _is_
  incremental. So the card states the framing, and when the colony already
  runs the recommended product it says "already running it" rather than
  telling a pilot to build what is on the ground.
- **Raw and made candidates are not taxed symmetrically on the same ore, and
  that is inherited rather than chosen.** A raw candidate pays its export only,
  which is the one customs boundary extracted-and-sold ore crosses. A made
  chain's P0 is charged an import onto the planet that consumes it, because
  that is what `chainCost` does at the P0 floor — a treatment verified against
  #304's own margin tables (`chain.test.ts` reproduces the 1,920,000 base to
  the ISK), even though `chain.ts`'s header prose reads as though the
  extraction side is untaxed. The gap is 0.25 ISK a unit at a 10% rate and
  always favours making. #426 is the first code to rank the two against each
  other, so it is the first place the asymmetry is visible; it is recorded here
  rather than fixed inside this ticket, since changing it would move every Plan
  tab figure too.
- **The customs rate is derived from the system, not asked for.** The Advisor
  knows exactly which system it is showing, so it reads that system's security
  band and the character's Customs Code Expertise and states the result in a
  header chip with its provenance — the same treatment round 53 gave the
  extraction rate and round 51 gave the Command Center ceiling. The Plan tab
  keeps its own control because it answers for no particular system. An
  unresolved security status falls back to highsec, the only assumption that
  cannot understate what a customs office will charge.
- **Every fit input is read off the colony.** The extraction rate is the mean
  of that colony's own extractor programs off the decay curve — per extractor,
  not per resource, since `chainBlockPins` sizes one ECU against it. The head
  count is its own ECUs' mean. The overhead is the Launchpad and Storage
  Facility it actually has. A colony with no projectable extractor gets a
  refusal, not a default rate.
- **Buffer hours are the one number nobody measures.** The throughput check
  needs a span and no ESI field answers it — how long a pilot leaves a colony
  to fill is a habit. `ADVISOR_BUFFER_HOURS` is a day, named and commented:
  short enough to catch a layout that cannot survive being ignored overnight,
  which is the failure worth flagging, and not so long that it rejects layouts
  that are fine for anyone who logs in daily.
- **`link-capacity-unknown` is not a rejection.** Only `buffer-overflow` and
  `link-capacity` reject a candidate. Link capacity is deliberately never
  guessed (round 51), so treating its absence as a failure would reject every
  candidate on every colony.
- **Prices are one call for the whole payload.** Every P0 and every schematic
  output, about eighty types, fetched once per snapshot rather than per card.
  The set does not grow with the system, the character or the number of
  candidates, which is what keeps the per-card fan-out at zero.
