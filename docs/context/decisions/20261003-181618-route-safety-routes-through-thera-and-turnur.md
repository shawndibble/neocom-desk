# Scope decisions — Route Safety routes through Thera and Turnur (issue #2476)

_Recorded 2026-10-03 · issue #2476._

- **With the switch on, the hole jumps and the hub itself carry no security
  cost (Shawn's decision).** Each hole jump counts as one jump, and entering
  the hub costs one jump's worth whatever its security. The entrance and exit
  systems are charged normally by the Route Preference and the avoids. Thera
  is -0.99 and Turnur 0.39, so strict costing would almost never pick a hole
  under the default Prefer safer. The engine knows nothing about Thera: the
  caller passes the hole edges and the free systems
  (`engine/route/routeHoles.ts` → `FindJumpRouteOptions.extraConnections` /
  `freeSystems`). Only a hub with at least one usable hole is free, so with no
  usable holes the gate route is exactly what it was. A free hub stays free
  however it is entered, which means Turnur entered by gate also costs one
  jump while the switch is on. That is the rule as given, and it is recorded
  here so it isn't mistaken for a bug. An Avoided System is still avoided,
  hub or not: only the security cost is waived.

- **Route Safety only, never Travel Settings or `routeRules`.** The four
  settings (the switch, My ship fits, Skip holes with under N h left, Hubs)
  are Route Safety's own synced defaults, each overridable in the link
  (`wh`, `whsize`, `whlife`, `whhub`). They sit in a third Route rules group
  rather than in Settings → Travel. Assets and market order jumps come from
  ESI's `/route/`, which cannot take a wormhole, and a hole closes within
  hours, so no other page's jump count may change with one. Changing one in
  the panel saves the default and drops that link override.

- **EVE-Scout is asked only while the switch is on.** While the list loads,
  the gate route shows with "Checking Thera / Turnur connections…". If
  EVE-Scout can't be reached, the route is gates only and the page says so.
  The option is never dropped silently. The trip is planned again only when
  the set of usable holes changes, not on every tick of their remaining life.

- **A hole jump is shown, not judged.** It gets its own row: where to warp,
  the signature on the side being flown from, the wormhole type, size, life
  left and the age of EVE-Scout's list. The row also has Copy, and the strip
  shows the jump as a hatched cell. The facts line adds "N by gate · M through
  wormholes". A J-space system's ESI figures stay unknown ("—", "ESI doesn't
  report wormhole space"), and zKillboard still lists it. Both systems beside
  a hole jump never fold into a quiet stretch. The age shown is when the list
  was read, because the feed parser keeps no per-hole update time.
