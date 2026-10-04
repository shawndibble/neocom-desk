# Scope decisions — Use all fills every row its Use assets offer would

_Recorded 2026-10-03._

- **"Use all" is every row's own "Use assets" at once.** It fills each material whose per-row offer is showing: detected stock in the selected locations, capped at what the row needs, on a row not already holding that number. That includes a row with a number in it, whether a 0 or a stale typed count. Before this, bulk left any typed value alone, a deliberate 0 included. "Use none" writes 0s, so after it "Use all" did nothing while every row beside it still offered its stock, and on a real plan it read as a dead button. The per-row offer and the bulk button now share one rule (`bulkOwnedStockSuggestions`), on a Build Plan and in a Build Group alike.
- **Both bulk buttons always answer.** On a Build Plan, "Use all" and "Use none" confirm with a toast saying how many materials changed, with an Undo that restores each row's previous Have. When nothing changes, the toast says so ("Nothing to fill", "Nothing to clear") instead of silently doing nothing. The Undo is what protects a number typed on purpose that "Use all" now overwrites.
