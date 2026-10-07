# Scope decisions — Fitting Add panel rows keep an item menu, with Build Plan and a can't-add triangle

_Recorded 2026-10-06._

- **Every Fitting Add panel row (Modules, Charges, Drones, Cargo) keeps an item menu**: add to the ship, Show info, View in Market, Build Plan, View blueprint in Market. #2700 dropped these as redundant with the row click; owner feedback reversed that. The row still adds on click. Rows inside the panel have no name link, so the menu is the only way to an item's info, market and blueprint, which is why it passes §6c's two-real-actions rule here.
- **A row that can't go on the ship shows a yellow warning triangle (`IconButton tone="warning"`) whose tooltip names every reason**: wrong hull, too much CPU/powergrid/calibration, missing skills, no drone bay room, no free slot. It replaces the old text chips. A drone with no bay room or a module with a full rack is greyed rather than a click that silently does nothing.
