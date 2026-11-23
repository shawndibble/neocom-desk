# Scope decisions — Share header Choose permissions hit area is 24px (issue #6670)

_Recorded 2026-11-22 · issue #6670._

- **The Share Link header's "Choose permissions" button pads `py-1` and cancels it with `-my-1`.** The 16px text line becomes a 24px hit area (WCAG 2.5.8) with no change to the header's height, as #6559 did for the corp and alliance links. `min-h-6` is ruled out: it would grow the header 8px. The 4px overhang meets the Log in button's bottom edge at the existing 4px gap and does not overlap it. `plainTextActionClassName` itself is unchanged.
