# Scope decisions — Active Fit leads the Fittings Start list

_Recorded 2026-11-06._

- **The Active Fit leads the Fittings Start list and is the first pick.** It sits under its own "Active fit" heading above the hull groups, so on a desktop page the preview opens on the ship the pilot flies, not whichever saved or In-game Fitting sorts first by hull. A search can still hide it. Rules out sorting it into its hull's group, where A–Z would bury it.
- **The lag note sits in the list, under the row, not in the preview.** A phone has no preview pane, and the note must reach it too. One sentence: its modules can be up to an hour behind the game (ESI caches assets about hourly).
- **No grant banner.** Without `esi-location.read_ship_type.v1` and `esi-assets.read_assets.v1` the row is simply absent; nothing asks the pilot to log in again for it.
- **A pod is never an Active Fit.** A Capsule (group 29) has nothing to fit, so the row is left out and the assets are not read.
- **Opens as an In-game Fitting does** (`openLoaded`, source `in-game`), since the Compare picker has no other way in. Save to EVE, Rename and Delete stay saved-only; it is never shared to a Community.
