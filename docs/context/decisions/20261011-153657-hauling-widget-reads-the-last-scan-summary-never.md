# Scope decisions — Hauling widget reads the last scan summary, never scans (issue #3579)

_Recorded 2026-10-11 · issue #3579._

- **The Hauling widget only reads a stored summary; it never runs a scan.** The Hauling tab saves the best haul per lane (top 3, default filters applied) to the `haulingLastScan` setting when a scan lands; the widget shows it with the scan's own age, plus stargate jump counts from the local graph. A scan is hundreds of market calls, so the Overview must not start one, and an in-memory scan cache (5 min) cannot survive a reload. Rules out a widget-side Refresh that scans: the way to refresh is the Hauling tab (the empty state and the title link go there). The summary holds whichever route and category the pilot scanned last.
