# Scope decisions — Market item panel drops the location-kind filter and its Data Age badge

_Recorded 2026-09-05._

- **The Market Browser's item panel no longer offers the All / NPC Stations /
  Structures chips (issue #412), at the product owner's request.** The order
  book now always shows every order in scope; only the order-row context
  menu's "filter to this station" still narrows it. This rules out the chips
  as a standing control above the tables.
- **That panel also drops its Data Age badge, at the product owner's request,
  narrowing CONTEXT.md's "Data Age: timestamp shown on every API-derived
  view".** The Market Browser item panel is now the single exception; every
  other API-derived view keeps its badge, and the rule stands everywhere
  else.
- **The mobile back arrow moved from the panel header's right edge to the left
  of the item name,** via a new `leading` slot on `Panel`. "Back" refers to
  the item, so it reads against the item's name; on the far right it sat
  where panel-wide actions live.
