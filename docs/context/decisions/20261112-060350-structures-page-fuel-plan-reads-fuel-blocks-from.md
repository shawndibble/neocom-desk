# Scope decisions — Structures page fuel plan reads fuel blocks from corporation assets (issue #6093)

_Recorded 2026-11-12 · issue #6093._

- **Blocks in the bay are corporation assets flagged `StructureFuel` at the structure**, summed over the four fuel block types (`FUEL_BLOCK_TYPE_IDS`). Only a Director's assets read opens them (`canReadAssets`), one reader per corporation. A corporation without that access, or whose read failed or came back truncated, shows **No access** in the Fuel blocks column and a dash for Needed — time left still shows. Never a guessed number.
- **The burn rate is the one the bay and the expiry imply**: blocks ÷ time from the assets read to `fuel_expires`. Not worked out from fitted service modules. No rate for an empty bay, a dry structure, fuel running out within an hour, or a bay and expiry read more than an hour apart (not one refresh).
- **"Fuel until" means the end of that EVE (UTC) day**, so a structure stays fuelled through the whole date. Default 30 days from today, saved per device; the stored value is the date the pilot picked, and an untouched page keeps sliding 30 days ahead. A structure whose fuel already lasts past it needs 0, with or without a bay reading.
- **Needed is rounded up per structure.** The footer total is the sum of the visible rows (filters apply), plus the m³ at 5 m³ a block, and names how many visible structures have no known need. **Copy list** copies the visible rows that need blocks — `Structure (System): N fuel blocks` — and a total line.
