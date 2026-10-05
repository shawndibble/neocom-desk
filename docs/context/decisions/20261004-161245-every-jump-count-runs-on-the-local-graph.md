# Scope decisions — Every jump count runs on the local graph under Route Safety's settings

_Recorded 2026-10-04._

- **One jump basis for every count.** Assets, Market, BPC Sourcing, Contract
  Search, Courier and the order detail all count jumps on the local stargate
  graph (`features/route/jumpBasis.ts`) under the pilot's Travel Settings _and_
  Route Safety's saved wormhole (Thera / Turnur) and Ansiblex settings, so a
  number always matches the route its "View route" link opens. This rules out
  asking ESI's `/route/` for a count (it treats Avoided Systems as a wall, the
  graph as a cost — Assets showed 31 where Route Safety showed 29) and rules
  out the earlier "only Route Safety counts hole jumps" split: a count can now
  change as a hole opens or closes, and a Jump Range (within N jumps) includes
  those shortcuts. Settings → Travel offers every one of these rules, through
  the same controls as Route Safety's sidebar.
