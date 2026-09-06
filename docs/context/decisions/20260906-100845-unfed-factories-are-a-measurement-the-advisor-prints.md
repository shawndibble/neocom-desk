# Scope decisions — Unfed factories are a measurement the Advisor prints

_Recorded 2026-09-06._

- **The Advisor measures whether a colony's factories have anything to eat,
  and says how many do not.** "How much does this colony extract" and "how
  much do these factories draw" both sat on the card and were never compared.
  On the reported operation four colonies ran thirty-one Basic Industry
  Facilities against enough extraction for twenty-two — nine pins holding
  7,200 MW on planets whose Powergrid was the stated reason nothing else would
  fit. `engine/pi/factoryBalance.ts` is the comparison; it takes pin counts
  and each colony's own decay-curve extraction rate and returns fed and
  surplus pins per schematic.

- **The answer is a count of pins, not a duty cycle.** "These factories run at
  44%" is true and unusable: the pilot's move is to delete pins, so the only
  actionable form is how many. `fedPins` rounds the fractional figure **up** —
  3.53 factories' worth of ore keeps four pins busy, because the shortfall is
  smoothed by the colony's buffer rather than starving a fourth outright.
  Checked rather than assumed: simulating CCP's decay curve cycle by cycle
  against the reported colony's real storage and launchpad shows four pins
  process 100% of a 2-day program where three leave 153,635 units in the
  ground, and where five through eight add nothing.

- **An input the colony neither extracts nor makes is imported, and its
  factories are not surplus.** A colony routing material in from a sibling
  planet is the whole point of a network. Treating an absent supply as zero
  would tell a pilot to delete the factories their imports feed, so those
  lines come back `inputs-not-local`. The same refusal covers an extractor
  whose program carries no install-time baseline: `advisorModel` reports its
  rate as `null` and leaves the resource out of the map, and out is not zero.

- **One input shared by two schematics is split in proportion to what each
  asked for.** A stated convention, not a measurement — ESI's `routes[]`
  carries the real per-pin split, and reading it would mean modelling pin
  placement, which the Advisor has never done. The convention is exact in the
  only case reported so far (one schematic on one input) and neutral rather
  than optimistic otherwise.

- **What the unfed pins free is priced, and paired with what that would then
  hold.** The line answers "remove x" and "add y" together, because the
  freed figure is only interesting as a means to something: four Basic
  factories are 3,200 MW, which is four more Advanced factories on a colony
  whose Powergrid binds. The freed figure counts pins only, never the links
  those pins also release — the conservative direction, and which link a given
  pin owns is a placement question this app does not answer.
