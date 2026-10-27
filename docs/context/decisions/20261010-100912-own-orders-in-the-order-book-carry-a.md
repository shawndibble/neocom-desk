# Scope decisions — Own orders in the Order Book carry a visible glyph (issue #3350)

_Recorded 2026-10-10 · issue #3350._

- **An order of mine in the Order Book carries a visible glyph left of its
  price, besides the row tint.** Supersedes the second bullet of
  `20260908-130202-market-data-table-station-name-only-and-own.md`, which
  left the tint as the only visible mark. A faint wash is about 1.2:1 against
  the row, so a sighted pilot who cannot see it had no cue (WCAG 1.4.1); the
  word "You" was screen-reader-only. The glyph (`Icon.MyOrder`) is named
  "You" (`market.myOrder`), sits before `BaitFlag` and the price on one
  line, so the price column stays aligned and no row grows a second line —
  the reason the old decision gave. It has no tooltip and is not a tab stop:
  the tint plus its name already say it, and a tooltip in a clickable row
  fights docs/DESIGN.md §6c. The `row-mine` tint stays. Still ruled out: the
  undercut-gap line under the price.
