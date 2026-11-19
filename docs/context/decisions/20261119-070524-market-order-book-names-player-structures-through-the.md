# Scope decisions — Market order book names player structures through the structure lookup

_Recorded 2026-11-19._

- **A player structure in the order book is named by `/universe/structures/{id}`, resolved for the signed-in Character with no roster sweep.** The SDE holds only NPC stations, so a public structure's orders read "Unknown Structure". The book's distinct ids at or above `UPWELL_STRUCTURE_ID_FLOOR` are asked through `loadStructureNameNoRoster` (cache-first, refusals memoised), and the system comes from the order's own `system_id`.
- **A structure the Character cannot see keeps "Unknown Structure".** ESI is ACL-checked, so a 403 is a normal outcome, and a signed-out visitor has no token to ask with.
