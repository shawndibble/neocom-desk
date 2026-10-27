# Scope decisions — Market Data table: station name only, and own orders are colour-only

_Recorded 2026-09-08._

- **The Market Data order book's Location column shows the station name and
  nothing else.** It used to trail "· System (0.9)", but an EVE station name
  already contains its system ("Jita IV - Moon 4 - Caldari Navy Assembly
  Plant"), so every row repeated a word the eye had just read. The
  station-filter banner above the tables now names the station the same way.
  This rules out the system and security appearing anywhere in the scanned
  table; the full "Station · System (sec)" form is kept only where a location
  is pasted or exported rather than scanned — `OrderRowContextMenu`'s copy
  action and `orderBookCsv`.

- **An order of mine in that book is marked by its row tint alone.** The
  highlight shipped in #603 also printed "You · undercut 1.2m (4.3%)" under
  the price; that line is gone, along with `engine/market/myOrderGap.ts`,
  which existed only to compute it. A book is scanned by price, and a second
  line on some rows breaks that column. How badly a rival beats an order —
  and what to do about it — is the Open Orders page's job, which has the cost
  basis, the relist floor and the exits to say something actionable. Colour is
  never the sole signal (docs/DESIGN.md §7), so the row still carries an
  `sr-only` "You".
