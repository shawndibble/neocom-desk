# Scope decisions — Market-wide Opportunities table: Blueprint, Time and Depth start hidden (issue #3071)

_Recorded 2026-10-08 · issue #3071._

- **The What's-profitable table starts with Blueprint source, Time and Depth unticked in its Columns menu.** At 1024px the table was 133px wider than its panel, which pushed PLAN (the row's main action) off-screen. Measured, those three columns are 105 + 71 + ~70px. A non-default source (anything but the NPC market) still shows as a dim note beside the product name, and a pilot's own Columns choice wins. CSV export keeps every column.
- **A skill gate shared by most rows becomes a quiet lock icon, not a chip.** The "N skills short" chip stays on rows whose gate differs from the page's most common one (shared by at least 3 rows and over half the gated rows); the page footer already states the rule. The icon still opens the same popover.
- **Row menu parity reuses the app-wide item menu.** Market-wide rows carry the same ⋮ menu as Ranked builds (item menu plus Price history). The menu's order was not rearranged to the mockup's three-first order: it is shared across the app.
