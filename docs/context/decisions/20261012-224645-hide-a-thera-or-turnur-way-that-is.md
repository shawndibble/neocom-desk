# Scope decisions — Hide a Thera or Turnur way that is more jumps than the gates

_Recorded 2026-10-12._

- **A hub way with more jumps than Gates only is not listed.** Route Safety's
  Ways to fly drop a Through Thera or Through Turnur way whose route is longer
  than the gate route. Nobody flies a wormhole detour that is also longer.
  This is a filter, not a verdict: the listed ways stay side by side, unranked
  (decision `20260912-172628`).

- **Ties stay.** A hub way with exactly as many jumps as the gates is still
  listed: the hub costs no security, so it can be the safer way of equal length.

- **No gate route means nothing is longer.** When gates cannot fly the leg, a
  hub way that reaches is kept: it is the only way.

- **The planner never picks a hidden way either.** Hubs are free systems to the
  search, so a biased preference can price a long hole route below a short gate
  one. `gatesOverLongerHoles` flies such a leg by the gate route instead.
  Optimize still orders stops on the costs it saw; only the leg's route changes.

- **A pin still wins.** A `thera` or `turnur` pin from an older link is flown
  even when its way is longer, and listed as the way in use. A pinned hole is
  flown as before.

- **Only Route Safety.** Jump counts outside Route Safety are untouched.
