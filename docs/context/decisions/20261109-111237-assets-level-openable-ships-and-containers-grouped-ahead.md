# Scope decisions — Assets level: openable ships and containers grouped ahead of items; item columns sortable

_Recorded 2026-11-09._

- **A station or container level lists its ships, containers and bays first, under "Ships and containers", then the plain items under "Items".** The two read differently (you open one, you scan the other); the headings only show when both exist. Containers keep their name order.
- **The item column labels (Name, Qty, m³, Value) sort the items only, via the shared `DataTable` toggle rule** (numbers start high to low, a second click flips). The sort is per visit and not remembered, like the min-value box; the flat search list keeps its own persisted Sort select.
- **A ship's row menu gets Open in Fittings,** the same entry a search result for a ship already had.
