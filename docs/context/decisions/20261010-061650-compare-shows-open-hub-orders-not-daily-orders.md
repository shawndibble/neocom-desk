# Scope decisions — Compare shows open hub orders, not daily orders

_Recorded 2026-10-10._

- **Build Plan Compare's hub column is the hub station's open buy-order count (Fuzzwork), not orders per day.** ESI's market history `order_count` is per region and counts traded orders, so it can't answer "this hub". Fuzzwork's per-station aggregate is the only per-hub source, and it is a live snapshot. The column, its sell-side and unit-volume siblings, and a hub picker (each plan's own hub, or one hub for every row) are fetched only while a hub column is ticked. Rules out a per-hub "per day" figure until a per-station history source exists.
