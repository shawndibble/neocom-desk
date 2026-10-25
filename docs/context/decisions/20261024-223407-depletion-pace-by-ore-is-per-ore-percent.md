# Scope decisions — Depletion pace-by-ore is per-ore percent lines, not stacked m3/s

_Recorded 2026-10-24. Amends [Depletion by ore ends with the pace-by-ore chart](20261024-215425-depletion-by-ore-ends-with-the-pace-by.md)._

- **The pace chart under Depletion by ore draws one line per ore, in percent of that ore's starting total mined per scan interval, not a stack of m³/s.** The point is to see, scan to scan, which ore was mined and how fast relative to that ore's own size, so an early burst on the valuable ore and a late burst on a cheap one both show as peaks and a small ore never vanishes under a big one. The earlier decision's "stacked by ore (m³/s)" no longer holds; its other points (two charts, same time axis, `h-32` slot, no toggle, none with one scan) stand. Total pace on Ore left stays m³/s.
- **The denominator is each ore's starting total** (`startVolume`, what the depletion lines use: its first showing plus any that later came into range). The unit is per scan interval, not per hour, and gaps are not normalised; the tooltip gives the interval's length so a long gap explains a tall peak.
- **An ore's line breaks in an interval where none of it was mined,** so idle ores draw nothing. The Y axis fits the data (not 0 to 100), with headroom above the tallest peak.
