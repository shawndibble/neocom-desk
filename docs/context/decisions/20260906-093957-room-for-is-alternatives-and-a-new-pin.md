# Scope decisions — Room for is alternatives, and a new pin pays for its link

_Recorded 2026-09-06._

- **The Advisor's "Room for" row states in words that its counts are
  alternatives.** They always were — `spareCapacity` prices each pin kind
  against the whole leftover budget independently — but the six counts were
  joined with `·` into one sentence, and a pilot read
  "1x basic factory · 1x advanced factory · 2x high-tech plant · 1x storage ·
  1x launchpad" as five things they could add. Every count was arithmetically
  right (Efa II: 13,755 tf and 845 MW free, powergrid binding every one of
  them); the sentence was the defect. The row now says "Any one of those, not
  all of them" whenever more than one kind is offered, and prints the CPU and
  Powergrid remainder the counts came out of so the arithmetic is checkable on
  the card. This rules out the alternative fix of picking one combined layout
  to recommend: which pins a planner wants is a preference, and the six
  alternatives are the input to it.

- **A pin the colony has not built is charged for the link it will need.**
  Nothing on a planet is reachable without a link, so quoting a pin at its
  unlinked price promises room that is not there — on one reported colony,
  448 MW free against a 400 MW High-Tech plant whose link cost 54 MW. The
  engine takes the figure as a parameter (`spareCapacity`'s `newLinkCost`)
  and the feature layer supplies it from that colony's _own_ measured links
  (`colonyPinLoad`'s `newLinkLoad`), because a link's cost is distance-based
  and varies by two orders of magnitude between planets — a shared constant is
  ruled out for the same reason #440 ruled one out for the links a colony
  already has. **The colony's longest existing hop, priced at link level 0.**
  Where a pin would go is the pilot's choice and unknowable here, so the
  statistic is a policy rather than a measurement, and `colonyBudget.ts` states
  which way that policy has to fall: a mean is under the true cost for roughly
  half of all placements, and the longest hop makes the headroom count a floor
  — what will fit — instead of a coin flip. Level 0 because a link you have not
  built is un-upgraded; carrying in the level modifiers of existing links would
  quote a price no new link pays, through the one term `linkCost.ts` flags as
  unverified.

- **A colony with no link to average gets a stated ceiling, not a free one.**
  Omitting `newLinkCost` means _unpriced_, never zero: the card says "These
  are ceilings" rather than quoting a count it knows is optimistic. Same rule
  as the unresolved-radius refusal that shipped with #440.

- **The Advisor states the pilot's colony allowance, separately from the
  system's planet count.** The header's "N / M planets" chip counts
  colonisable planets in the system on screen, and with no other slot-shaped
  number on the tab it was read as the character's allowance. The cap is
  Interplanetary Consolidation, it is per character rather than per system,
  and `features/pi/planetSlots.ts` already computed it for the Plan tab. Both
  chips now sit side by side, the colonised one gains a tooltip saying which
  question it answers, and an unbuilt planet's card says so when there is no
  slot free to build it in. An assumed cap is marked assumed, the same way the
  Command Center ceiling is.

- **A built colony whose Command Center is behind the pilot's own skill says
  so.** Powergrid binds nearly every colony, and a pilot at Command Center
  Upgrades V running level-4 Command Centers has 2,000 MW per colony sitting
  behind an ISK purchase the tab never mentioned. Said only off a _trained_
  ceiling: pushing an upgrade at a pilot whose `/skills` never loaded would be
  advice derived from missing data.
