# Scope decisions — Build Opportunities table gets a Columns picker; Blueprint, Time and Depth start hidden (issue #3223)

_Recorded 2026-10-09 · issue #3223._

- **The Ranked / All-owned Build Opportunities table gets the same Columns picker as "What's profitable", with Blueprint, Time and Depth unticked by default.** At 1024px the table was 849px in a 743px scroller, hiding Depth and the row menu and wrapping cells. This extends #3071's scope to the owned table; a pilot's own choice wins, CSV export keeps every column, and the phone card list is unchanged.
