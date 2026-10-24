# Scope decisions — Market Trend widget reads the Quickbar at the Market hub, daily averages only (issue #5002)

_Recorded 2026-10-24 · issue #5002._

- **The widget plots the first six Quickbar items of the active Character.** The Quickbar is per Character and has no per-widget selection, so independent item lists per instance, and Gallery presets (Minerals, Ore, PLEX, Large Skill Injector), wait on a per-widget `items` setting.
- **The hub is the pilot's Market hub**; an item with a global market (PLEX) is read at its own region and ignores the hub. A per-widget hub setting is deferred.
- **Daily averages only** (ESI's `average`), the series Price History's "average" choice draws, not the open buy/sell lines. The chart indexes each line to 0% at the start of the range so a 5 ISK mineral and a 5M ISK PLEX share a scale; the table's 7 and 30 day changes compare the newest row with the last row on or before that many days earlier.
- **The range is the widget's 7, 30 or 90 days.** 1 year waits on widening `WidgetRange`.
- **The chart is its own inline-SVG `lines` kind**, not the Price History chart: that one is Recharts, which the Overview never imports.
