# Scope decisions — Right-click an item name to start a Build Plan

_Recorded 2026-09-08._

- **A Build Plan started from a blueprint targets the blueprint's product, not
  the blueprint.** `/industry?product=` resolves through the catalog's
  `byProductTypeID`, so handing it a blueprint typeID silently creates no plan
  and clears the param. Every BPC search row is a blueprint, so without the
  translation the action would appear to do nothing. Rules out passing a row's
  own `typeId` straight through.
- **The menu also reads a plain item as itself.** Contract line items are
  arbitrary types, so one rule covers both surfaces: a blueprint means "build
  what it makes", anything a blueprint produces means "build this", and
  anything else is a disabled row saying so. Rules out a menu that only
  appears on blueprints, and rules out silently rendering nothing for an item
  the game can't build — the disabled row answers the question.
- **One action, one label: the three menu strings moved to
  `industry.contextMenu.*` and the Market Browser's `ItemContextMenu` now
  reads them too.** Both menus offer the same action with the same
  `/industry?product=` destination, so "Build Plan" / "Build Plan (checking…)"
  / "No blueprint options" cannot be allowed to drift into two vocabularies
  depending on which page the user right-clicked. Rules out a second set of
  keys under `market.contextMenu.*` saying the same thing; the visible English
  is unchanged.
- **The plan is not seeded with the contracted copy's ME/TE/runs.** Starting a
  plan from a BPC listing uses the same defaults as every other entry point
  (owned blueprint's ME/TE, one run). Seeding from the listing is a genuinely
  useful follow-up — "what would this specific copy earn me?" — but it needs
  new URL params and a change to Industry's `createPlan`, so it is its own
  piece of work rather than a side effect of adding a menu.
- **The menu goes on every list that names an item in a contract**: the BPC
  search table, `BpcContractModal`'s contents list, and the character
  `ContractDetailModal`'s Included/Requested tables. A buyer reading a bundle
  asks "can I build this?" of any line, not just the blueprint the row was
  found by. Rules out putting it only on the search table.
- **`blueprints.json` is fetched on first right-click, not on mount.** It is
  1.4MB (the reason `ItemContextMenu` makes its call sites thread
  `blueprintTypeID` down instead of loading it), and a contract detail modal
  that paid for it on every open would charge every user for a menu most never
  use. The label shows a "checking…" state for that first open, the same
  three-state treatment `ItemContextMenu` documents.
