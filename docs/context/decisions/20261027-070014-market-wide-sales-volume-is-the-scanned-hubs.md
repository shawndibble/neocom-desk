# Scope decisions — Market-wide sales volume is the scanned hub's region, not five hubs summed

_Recorded 2026-10-27._

- **Units a day, for "rarely sold" and ISK/day, is the scanned hub's own region over about 30 days — not the five Trade Hub regions summed.** Supersedes the "summed over the five trade-hub regions" half of `20260929-055141`. The row is priced at one hub, so that hub's sales are what a builder can sell there; the sum credited Amarr with Jita's volume, overstating ISK/day and hiding thin markets at the smaller hubs. The region's figure is one published `lp-store-volume/<regionId>.json` object (see `20261025-084327`), reused for 30 minutes; ESI history for that one region is the fallback. The "fewer than 5 a day" threshold and the 10% share are unchanged, so rows at a smaller hub drop out of "rarely sold" more often.
