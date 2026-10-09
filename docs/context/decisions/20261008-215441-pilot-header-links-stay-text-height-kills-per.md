# Scope decisions — Pilot header links stay text height; kills per month leads Where they kill

_Recorded 2026-10-08._

- **The pilot profile's header links (corporation, alliance, zKillboard) are text height on a phone again.** #2520 gave the corporation and alliance links a 44px box; in the compact header, three tight lines beside a portrait, those boxes spread the lines apart and cost more than they helped a thumb. This is a deliberate exception to the touch tier (docs/DESIGN.md "Touch tier"), for that header only, never for a link in a table row or a button. It reverses the 44px part of #2520; the kill-row party-name line from the same ticket stays.
- **The three meters share a row when their container is about 32rem wide,** one column below that (a container query, `@lg`, not a viewport breakpoint). They were three only from `lg`, which left Kills vs losses alone on a second row on a tablet; a viewport breakpoint would also have crammed three into the narrower Show Info modal.
- **"Kills per month" leads "Where they kill".** The folded chart toggle sits above the four space boxes instead of under them, so the section opens with the month-by-month picture and the 30-day boxes follow.
