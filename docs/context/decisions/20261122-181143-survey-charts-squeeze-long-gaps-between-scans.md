# Scope decisions — Survey charts squeeze long gaps between scans

_Recorded 2026-11-22._

- **A gap of 2 hours or more between scans, and over 3x the survey's usual scan interval, is drawn as one short labelled break.** A survey that spans days would otherwise spend most of its chart on a straight line nobody measured. Shawn chose the 2 hour floor; the 3x rule keeps a slow but steady survey whole. Rules out a fixed "idle" cut-off and any gap that needs a setting.
- **The break says "no scans for N", never "mining stopped".** Nothing was measured across it, so the chart draws no mining rate there and no per-ore pace bar; the net change between the two scans still shows in the scan tooltip and tables.
- **Times stay real everywhere a person reads them.** Only the chart's x positions are squeezed; ticks, tooltips, tables and the scan menu go back through the axis to the real EVE clock. The Overview's small Mining survey chart keeps plain time.
- **The projected run to the finish is not squeezed.** It is an estimate, not a gap between scans.
