# Scope decisions (round 27) — Industry materials context menu

_Recorded 2026-09-02._

- **The item context menu (round 6) reaches the Build Plan materials table.**
  A material is an item like any other, so it answers to the same
  `ItemContextMenu` the Market Browser, Assets and Variations rows use — add
  to Quickbar, show info, add to Compare, view in Market, copy name, jump to
  a Build Plan. No Industry-specific menu, and no new strings: a seventh
  surface for the existing one.
- **"Build Plan" on a material means the material's own plan, not a nested
  sub-build.** The action takes the same `?product=<typeId>` round trip the
  Market Browser's does, landing back on `/industry` to create-or-select a
  plan for whatever blueprint manufactures that material. That answers
  "should I build this component instead of buying it" by putting two plans
  side by side in the list, which the round-25 layout already supports. A
  Bill-of-Materials rollup — one plan absorbing its components' costs
  recursively — is a different feature and stays out: `BuildPlanRecord` is
  one blueprint per plan, and v1 industry scope is manufacturing only.
- **Industry never shows the "Build Plan (checking…)" label.** Market and
  Assets load the blueprint catalog lazily when their menu opens, so they
  pass `undefined` while it is in flight; Industry already holds the catalog
  to render a plan at all, so its lookup is synchronous and the action
  resolves straight to "Build Plan" or "No blueprint options".
- **The Quickbar's Dexie write lives in one hook** (`useQuickbar`), not
  copied per page. Three surfaces now offer "Add to Quickbar", and the write
  is a `db.quickbars.put` plus an `isSyncConfigured()`-guarded sync schedule
  that a fourth surface could easily get half-right.
