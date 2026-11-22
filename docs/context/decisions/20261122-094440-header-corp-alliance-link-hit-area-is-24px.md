# Scope decisions — Header corp/alliance link hit area is 24px; characters toolbar stays 28px (issue #6559)

_Recorded 2026-11-22 · issue #6559._

- **<Decision>.** <Why, and what it rules out.>

- **The Character header's corp and alliance links pad `py-1` and cancel it with `-my-1`.** The 16px text line becomes a 24px hit area (WCAG 2.5.8) with no change to the row's height. The two links sit side by side on one line and do not overlap.
- **The Characters toolbar stays at 28px.** Its controls are `SelectTrigger size="sm"` (`md:h-7`), the compact tier in DESIGN.md §3, and 28px is above the 24px floor. The 36px tier applies below `md`, where `sm` is already `h-9`. Nothing to change.
