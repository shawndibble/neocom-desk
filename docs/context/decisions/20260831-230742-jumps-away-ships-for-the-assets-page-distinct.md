# Scope decisions (round 14)

_Recorded 2026-08-31._

- **Jumps-away ships for the Assets page**, distinct from round 9's "no
  jumps-away column" call for the Market Browser's order book. That decision
  was about a large, always-rendered order-book table, where computing a route
  per row does not scale. The Assets page computes it lazily — only for
  pinned and currently visible/expanded stations, loaded after the rest of the
  page renders — via ESI's `/route/{origin}/{destination}/`, which resolves
  server-side and needs no local pathfinding graph. The two pages' call
  volumes and rendering models differ enough that this is not a reversal of
  the round 9 decision, just a narrower case it didn't rule out.
