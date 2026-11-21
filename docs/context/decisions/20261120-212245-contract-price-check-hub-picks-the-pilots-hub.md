# Scope decisions — Contract price check hub picks the pilot's hub

_Recorded 2026-11-20._

- **The hub named in a contract price check's heading opens the trade hub
  list, and a pick writes the hub in force (`useMarketHub`: the active
  Character's hub, else the default).** It is the same setting the panel
  already prices from, and the same one the Fittings Price section and the LP
  Store change in place, so the next contract opens at the hub just chosen
  rather than snapping back. A panel-only override was ruled out: two hub
  settings that disagree is what #5593 untangled. The BPC per-run check has no
  hub (copies are judged against other contracts), so it offers no menu.
