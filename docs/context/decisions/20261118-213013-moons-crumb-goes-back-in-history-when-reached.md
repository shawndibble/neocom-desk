# Scope decisions — Moons crumb goes back in history when reached in-app

_Recorded 2026-11-18._

- **On a Moons drill-down page (Extraction, Miner, Refinery, Moon owner) the top-left crumb steps back one history entry when the page was opened by an in-app click, and reads "Back".** Shawn found "‹ Extractions" and "‹ Miners" dropped him on the full list instead of the refinery or page he came from. A first load (deep link, new tab) and a Ctrl/Cmd/Shift/middle click keep the link's own destination and its list label. This overrides DESIGN.md's Origin crumb line ("not a second Back") for the Moons crumb only; it rules out a per-origin label, which would need every entry point to pass route state.
- **A refinery Extraction with miners but no billed tax reads "Not billed yet", not "—".** The page still shows only the tax Late notices froze (`frozenTax`); it does not load ledger rows, so it cannot show the running figure the Extraction's own page shows.
