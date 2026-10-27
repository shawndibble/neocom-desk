# Scope decisions — context menu discoverability hint reuses each panel's title bar

_Recorded 2026-09-08._

- **A right-click/long-press `ContextMenu` gets exactly one visible affordance:
  a "?" in its panel's existing title-bar action cluster, not a per-row icon.**
  Nothing in the app signalled that a row's `ContextMenu` existed at all — no
  kebab, no hint, right-click or touch-and-hold only. A per-row kebab
  (`IconButton` beside every row) was ruled out: roughly half of the twelve
  surfaces already have something at the row's trailing edge (the Materials
  table's build/buy toggle, Skills' `SkillBar` + SP text, Contacts' standing
  badges, the Coming Up Rail's response chip), so a kebab would mean a
  real layout decision per surface rather than a drop-in. A page-level hint
  banner was also ruled out as too generic to say which rows are actionable.
  `ContextMenuHint` (`src/components/ui/ContextMenuHint.tsx`) is the
  cheaper, established pattern instead: it wraps the existing `InfoTooltip` +
  `common.aboutLabel` convention already used for header tooltips elsewhere
  (`StatChip`, `PlanResults`, `OrderDetailModal`), so it reads as "About
  <Section>" and explains right-click/press-and-hold on focus.
- **Wired into every surface that already has a title-bar action cluster;
  none gained a new one just to host this.** Active Jobs, Industry
  Materials, Market's Sell/Buy sub-headers and Variations table, Assets,
  Corp Assets, Corp Members, Contacts, Skills, the Corp Ops Board's four
  kind cards, and the Coming Up Rail all had an existing `Panel`/`PageHeader`
  `actions` slot (or, for Market's Sell/Buy, a plain header row) to drop the
  hint into. The Market Browser tree is the one context-menu surface left
  out: its `Panel` renders no title/actions row at all today, and adding one
  solely to carry this hint is a bigger, separate layout change — not a v1
  goal here. A future pass can revisit it if the tree turns out to need a
  header for other reasons too.
- **The hint is gated on there being a row to right-click, not shown
  unconditionally.** The Coming Up Rail and the Corp Ops Board's kind cards
  hide it when their list is empty (`items.length > 0`), since "right-click a
  row" is false when there is no row. The other nine surfaces don't repeat
  that check explicitly, but land at the same place two different ways: the
  Variations table returns `null` outright before its header renders at all
  when `rows.length === 0`, and the rest (Assets, Contacts, Corp Members,
  Corp Assets, Skills, Active Jobs, Industry Materials, Market's Sell/Buy)
  keep their whole toolbar — refresh, export, now this — visible over an
  empty table the same way they already did before this change, rather than
  collapsing the header on empty data.
