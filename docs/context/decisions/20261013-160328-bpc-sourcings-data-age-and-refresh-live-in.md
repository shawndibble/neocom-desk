# Scope decisions — BPC Sourcing's data age and Refresh live in the Industry page header, and its settings hold the market hub

_Recorded 2026-10-13._

- **The BPC Sourcing card has no title bar.** It held only the data-age badge and two icon buttons. The badge now sits beside the "Industry" title (the slot Opportunities already uses) and Refresh sits beside the settings gear, both reported up from the panel (`onHeaderChange`). Refresh is named "Refresh BPC Sourcing" because the page already has Active Jobs' own Refresh.
- **Export keeps its place on the search row, at the same size as the column picker and funnel.** It was `sm` beside `md` neighbours.
- **BPC Sourcing's settings hold the market hub.** It is the same synced Default trade hub as Settings → Market defaults, not a second preference: the hub market BPOs are checked in and LP offers priced at.
- **The Cheapest by region strip is two lines a cell, and narrower, so it fits one row beside the Market and Contract BPO cards.** Price and offer count share a line.
