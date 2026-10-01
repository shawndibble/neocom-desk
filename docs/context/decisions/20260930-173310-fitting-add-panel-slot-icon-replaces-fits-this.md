# Scope decisions — Fitting Add panel: slot icon replaces Fits this slot chip

_Recorded 2026-09-30._

- **The Add panel's "Fits this slot" text chip becomes an icon toggle showing the picked rack's in-game fitting-window icon**, beside the hull/resource/skill filter icons (`20260927-104252-fitting-add-panel-hull-resource-skill-filter-icons.md`). Same sourcing: CCP's art copied from the EVE University wiki (`Icon_hi_slot.png`, `Icon_mid_slot.png`, `Icon_low_slot.png`, `Icon_rigs.png`) into `public/images/fitting/slot-{high,medium,low,rig}.png`, credited under the Data credit. The wiki only has them at 64×64; they render at 16px, so that's enough.
- **Subsystem slots keep the text chip.** The wiki has no subsystem rack icon (only a rotated text label for its fitting template), and the in-game window doesn't draw one, so inventing a glyph would say something the client doesn't.
- **The toggle still appears only while a slot is the Add target** — never with no target, a drone or a cargo target. The accessible name and tooltip stay "Fits this slot"; the icon says which rack.
