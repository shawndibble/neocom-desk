# Scope decisions (round 6)

_Recorded 2026-08-31._

- **Radix is adopted for the primitives the app lacks** — context menu,
  dropdown, select — and only those. Working primitives stay: the native
  `<dialog>` Modal beats a library dialog, and `DESIGN.md` already forbids
  hand-rolled focus traps. Every Radix part is wrapped in `src/components/ui`
  so call sites never import Radix directly.
- **Item Detail reads ESI on open**, plus a small SDE dictionary of attribute
  names and units. Baking attributes into the snapshot would ship megabytes for
  a panel that is rarely opened.
- **Items answer to a context menu** wherever they appear — tree, search
  results, Quickbar, order rows: add to Quickbar, show info, compare, copy
  name, and jump to a Build Plan. A sixth candidate action, re-anchoring the
  Variations table on a chosen row, is dropped: clicking a row already
  replaces the selection, which re-anchors the table as a side effect.
- **Variations are sourced from the SDE variation relation**, resolved by
  `src/engine/market/variations.ts` from `public/data/market/variations.json`
  — the Tech I root plus every Tech II/Faction/Storyline/Officer sibling
  across the item's meta groups. Falls back to Market Group siblings when the
  selected item has no variation data (e.g. plain commodities/minerals).
- Compare ships with four fixed columns, but user-chosen columns are the
  expected direction, so the column set is modelled as a list, not as fixed
  table markup.
