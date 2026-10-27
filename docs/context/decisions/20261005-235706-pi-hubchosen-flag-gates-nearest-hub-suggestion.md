# Scope decisions — PI hubChosen flag gates nearest-hub suggestion (issue #2705)

_Recorded 2026-10-05 · issue #2705._

- **<Decision>.** <Why, and what it rules out.>

- The PI strip suggests the nearest trade hub (fewest gate jumps; ties to fewer lowsec jumps, then the current hub) only until the pilot has chosen. `piSettings.hubChosen` records that: set by picking a hub or buyback, or "Keep <hub>"; a stored non-default hub or buyback reads as chosen.
- Suggest, never auto-apply. A pilot who picked Jita before this flag existed sees the hint once and can dismiss it.
