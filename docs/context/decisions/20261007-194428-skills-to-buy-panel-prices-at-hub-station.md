# Scope decisions — Skills to buy panel prices at hub station, falling back to hub region (issue #2825)

_Recorded 2026-10-07 · issue #2825._

- **Each row is priced at the hub station's lowest sell, falling back to the hub's region when the station has none.** NPC-seeded skill books often have no sell orders at the station itself, so a station-only price would leave most rows blank. A row with neither shows "No sell orders" and is left out of the total (counted separately), never priced at 0 ISK.
- **"Not owned" means not in the character's trained skills (any level).** Shown only once trained skills have loaded. NPC base price is not shown in v1.
