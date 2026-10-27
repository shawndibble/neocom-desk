# Scope decisions — phoneHidden is off-by-default on a phone when the table has a Columns menu (issue #2994)

_Recorded 2026-10-08 · issue #2994._

- **On a table with a Columns menu, a phone-compact column is a default, not a lock.** `phoneHidden` (CSS `max-sm:hidden`) hid a column whatever the menu said, leaving a ticked box with no column. Those tables drop `phoneHidden` and list the columns in `useColumnVisibility`'s `phoneOffByDefault`: with no stored selection a phone starts them unticked, ticking shows them, and a stored selection is read exactly as saved at every width. `phoneHidden` itself stays, with its old meaning, for tables with no Columns menu; card layouts are unchanged.
