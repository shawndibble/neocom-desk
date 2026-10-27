# Scope decisions — Route Safety jump legs: skills at V, Short is half range (issue #3147)

_Recorded 2026-10-09 · issue #3147._

- **The jump drive uses the hull's baked base drive with Jump Drive Calibration and Jump Fuel Conservation assumed at V.** Range is +20% a level and fuel -10% a level (SDE attribute 870 and CCP's skill text), so a hull's baked range doubles and its fuel halves. Reading the active Character's real levels is a follow-up; until then the Route rules hint says what is assumed, and the figures are a ceiling on range and a floor on fuel. Fatigue is hull-driven only (see `20261008-192155`).
- **"Short" caps a single jump at half the hull's range; "Max" is the full range.** The ticket named the two choices without a number for Short. Half range keeps each hop's fatigue growth lower at the cost of more hops.
- **A jump costs 1.5 gate hops plus 0.05 per light year, beside the system it lands in.** Without a flat cost every route would collapse into the longest jumps; this makes a jump pay only where it saves about two gates. It is a tuning constant, not a game rule, and the Jump drive way is always listed beside the gate way as a fact, never ranked.
- **The Jump drive way is searched over stargates and jump hops only**, not holes or bridges, like Via Ansiblex. The client's autopilot cannot fly a jump, so Set waypoints cuts at the jump's entrance like a hole or bridge.
