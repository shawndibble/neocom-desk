# Scope decisions — Mining Yield tracker counts gas cloud harvesting, via its own allowlist (issue #880)

_Recorded 2026-09-11 · issue #880._

- **Gas cloud types get their own baked allowlist (`gasCloudTypeIds.json`),
  not a widening of `oreAndIceTypeIds.json`.** Gas does not live under the Ore
  market-group root the ore/ice walk is anchored to (1031) — it sits under
  "Gas Clouds Materials" (1032), a child of "Materials" — so this is a second,
  independently-rooted traversal in `scripts/build-sde.mjs`, not a name added
  to `ORE_AND_ICE_ROOT_GROUP_NAMES`. Keeping it a separate file is also what
  keeps the blast radius to the one surface the ticket asks for: widening
  `oreAndIceTypeIds` would silently change the Moon Mining Tax ledger's
  "unclassified ore" split and the `compressedOreTypeIds` name-match pass,
  neither of which #880 asked to touch. The traversal keeps the whole subtree,
  compressed gas included, exactly as the ore/ice walk keeps "Compressed " ore:
  those ~25 ids are inert (compression is a separate industry job, so no ledger
  row ever carries one) and excluding them would mean special-casing a child
  out of an otherwise clean tree walk for no behaviour difference.

- **The Moon Mining Tax tab's "unclassified ore" behaviour is unchanged: a
  gas type_id still flags there.** Tempting to also teach the Tax tab that gas
  is "recognized, just not moon ore," but that changes Tax tab behaviour for
  exactly the population this ticket serves. The banner's existing "Ignore"
  hatch (`typeOverrides.ts`) mechanically covers a gas harvester who wants it
  quiet, its ore-centric name notwithstanding — it is not being redefined here,
  and **Manual Ore Tag**'s glossary meaning is untouched. `ledger.test.ts` pins
  this boundary with an explicit test so a later change is a deliberate one,
  not a drift.

- **Harvested gas prices as itself, not via its Compressed counterpart.**
  Ore/ice price through `compressedOreTypeIds` (`20260906-081307-…`) because a
  corp valuing mined ore prices the more liquid compressed order book. Gas is
  left out of that map: raw Fullerites and serocins are what Reaction formulas
  actually consume and are liquid in their own right, and `pricingTypeId`
  already falls back to the raw id for any type with no compressed entry — so
  this needs no code, only the deliberate absence of one.

- **The Pricing badge reads "Partial" for any day that includes a gas line.**
  Gas has no reprocessing path at all (confirmed against the baked
  `reprocessing.json`: 0 of the 25 raw gas types carry an entry), and
  `valueMiningYield` flips `pricedAll` false for a line with no reprocessing
  data. Accepted as-is rather than special-cased: #880 scopes the existing
  value math as unchanged, and the alternative — "no reprocessing entry stops
  meaning incomplete" — changes documented, tested semantics for ore too.
  Worth revisiting as its own ticket.
