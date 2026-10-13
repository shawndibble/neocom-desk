# Scope decisions — Hide a Thera or Turnur way that is more jumps than the gates

_Recorded 2026-10-12._

- **A Via Thera or Via Turnur way with more jumps than gates only is not
  listed.** Route Safety's Ways to fly drop it when its route is longer than
  the gates only route. Nobody flies a wormhole detour that is also longer.
  This is a filter, not a verdict: the listed ways stay side by side, unranked
  (decision `20260912-172628`).

- **Ties stay.** A Via Thera / Via Turnur way with exactly as many jumps as the gates is still
  listed: the hub costs no security, so it can be the safer way of equal length.

- **No gate route means nothing is longer.** When gates cannot fly the leg, a
  Via Thera / Via Turnur way that reaches is kept: it is the only way.

- **The planner never picks a hidden way either.** Hubs are free systems to the
  search, so a biased preference can price a long hole route below a short gate
  one. `gatesOverLongerHoles` flies such a leg without the holes instead
  (known bridges kept). Optimize still orders stops on the costs it saw; the
  leg's route and the optimized order's jump count change.

- **A pin still wins.** A `thera` or `turnur` pin from an older link is flown
  even when its way is longer, and listed as the way in use. A hole pinned by
  name (Thera tab's Route via) is flown as before: the pilot chose it.

- **Every jump count follows the same rule.** The jump basis counts
  (`features/route/jumpBasis.ts`: Assets, Market, Courier and the rest) use
  `engine/route/holeDetour.ts`, as Route Safety does, so a count always
  matches the route Route Safety draws.
