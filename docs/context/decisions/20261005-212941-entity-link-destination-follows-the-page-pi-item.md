# Scope decisions — Entity link destination follows the page; PI item links open PI detail (issue #2728)

_Recorded 2026-10-05 · issue #2728._ The rule lives in `docs/DESIGN.md` §6c
"Entities".

- **The per-entity table is a default, not a hard rule.** A fixed destination
  answers the wrong question on a page whose job isn't the default's:
  Planetary Industry asks "should I build this?", and Market answers "what
  does it cost?". A page may override the default with whatever answers its
  own question. `20261005-114622` "Item → Market" still stands as the
  default everywhere no override is recorded.
- **Guardrails stay hard.** Same cue and a real URL; the destinations not
  picked stay one step away (⋮, or the detail where the row has no ⋮); one
  destination per entity type per page; every override recorded, naming the
  page; when unsure, the default. The point is predictability: a pilot can't
  guess a destination that changes silently or row by row.
- **A displaced destination counts toward the ⋮.** The restraint rule doesn't
  count Show info or View in Market as real actions because the name link
  usually gives them. Once a page overrides the link, they're no longer one
  tap away, so they count.
- **First override: Planetary Industry (Plan, Map, Colonies).** Every item or
  product name opens the PI product detail: the Map drawer, URL-backed, so
  the name stays a real link. Market and Show info move to the row or tile ⋮,
  or into the drawer where a row has no ⋮. Implementation is #2726; until it
  lands, PI names still open Market.
