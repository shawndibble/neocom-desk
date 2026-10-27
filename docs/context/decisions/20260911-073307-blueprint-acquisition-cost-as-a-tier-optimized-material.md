# Scope decisions — Blueprint acquisition cost as a tier-optimized material line (issue #838)

_Recorded 2026-09-11 · issue #838._

- **The absence of an owned BPO/BPC becomes a real material line, not a
  separate cost bucket.** A Build Plan already understates its own cost when
  the Character owns no means to build it — the plan silently assumed a free
  blueprint. **Blueprint Acquisition** fixes this as an ordinary row in the
  materials table, keyed to the blueprint's own type ID (a real, distinct
  item, never the product's) rather than a parallel line in the "Costs &
  revenue" ledger. This was picked over a distinct cost line specifically so
  it inherits the existing per-material `overridePrice` field
  (`engine/industry/sourcing.ts`) for free — a pilot who sources a copy
  outside anything the app can see (private contract, in-person trade)
  overrides the number the same way they already override any material's
  price, with no new UI required for that path.

- **Tier selection is a cost-minimization, not "prefer the best ME/TE" or
  "prefer an owned BPO."** `findOwnedBlueprint`
  (`features/industry/data.ts`) today picks an owned BPO outright if one
  exists, else the highest-ME owned BPC — a simple heuristic, never
  cost-aware. This decision replaces that rule: for every ME/TE tier the
  Character owns any runs at, plus the cheapest purchasable tier (see price
  cascade below), compute that tier's total plan cost — material cost at
  that tier's ME, plus whatever it costs to buy any run shortfall at the
  same tier — and pick whichever is cheapest overall. A tier never mixes
  ME/TE within one buildable node: `plan.me`/`plan.te` (or a sub-build's
  equivalent) is a single value, so a node locks to one tier's worth of
  runs rather than splitting across levels. An owned BPO still always fully
  covers any run count (infinite runs) and competes on cost at its own
  tier like anything else — it no longer wins automatically over a
  cheaper-overall BPC tier. Whichever tier wins reseeds the node's own
  `me`/`te`, the same way opening a **Seeded Build Plan** already reseeds
  from a BPC Sourcing **Offer**.

- **This is recursive: every buildable node in the tree gets its own
  acquisition line and its own tier selection, independently of every other
  node's.** `materialEfficiencyFor` (`features/industry/recipes.ts`) already
  threads `ownedBlueprints` through every recursive sub-build for ME
  prefill — this decision reuses that threading, it does not add it. What's
  new is that a sub-build missing its own BPO/BPC now prices that gap too,
  instead of only the top-level product doing so. A deep multi-level plan
  can therefore carry several independent Blueprint Acquisition rows, one
  per node that needs one.

- **Reaction nodes only ever consider a BPO.** Reaction formulas cannot be
  copied in EVE at all, so a reaction-activity node's acquisition line never
  searches **BPC Sourcing** — its only acquisition target, owned or bought,
  is the BPO itself.

- **Price cascade: BPC Sourcing at the node's own Trade Hub, then that
  BPO's ordinary sell price at the same hub.** A BPC is mechanically never
  sold via ordinary market orders in EVE — only via player contracts, which
  is exactly what **BPC Sourcing** already crawls (a shared 30-minute
  snapshot of EVE Ref's public-contracts data). Regular BPOs, by contrast,
  are often marketable the normal way. Trying BPC Sourcing first keeps the
  lookup mechanically honest for what's actually being priced (a copy);
  falling back to the BPO's sell price keeps most T1 plans priceable even
  when no contract offer is currently listed, rather than reporting
  unpriceable for something that's actually easy to buy.

- **Shortfall purchases use whole-copy math, never a fractional-copy price
  or a credit for unused runs.** A BPC Sourcing offer lists a real copy at
  its own run count and price; buying enough runs to cover a shortfall
  means buying whatever discrete copies are actually listed, which can
  overshoot the exact need (need 2 more runs, cheapest listing is 10 runs).
  The full listed price is charged regardless — this app already holds
  itself to the real mechanic elsewhere (Order Slots, Sustained Extraction
  Rate), and the point of this feature is the real ISK a pilot would
  actually spend, not a smoothed approximation.

- **`Plan Setup`'s ME/TE fields are removed for the top-level plan.** Once
  the resolved tier is the source of truth for `plan.me`/`plan.te`, a
  separate pilot-editable field in Setup would be a second, conflicting
  opinion about the same two numbers. The escape hatch for a copy the app
  genuinely cannot see (private contract, in-person trade) moves to the
  picker/override modal in the follow-up ticket (#839), not back into
  Setup.

- **Corp-owned BPC/BPO is out of scope here — it needs new plumbing, not a
  reused toggle.** Corp _assets_ already feed materials-ownership detection
  (issue #798's "Corp Assets" toggle, `features/industry/corpOwnedStock.ts`),
  but personal blueprint ownership has always read a distinct dedicated
  endpoint (`GET /characters/{character_id}/blueprints`), and this
  codebase has no `GET /corporations/{corporation_id}/blueprints` read at
  all. Treating "reuse the corp assets toggle" as sufficient would have
  been wrong — corp blueprints need their own endpoint, scope, Corp
  Capability, and Director/Factory_Manager role gate, tracked as a fast-follow
  in #839 rather than blocking this feature's core correctness fix.

- **No separate "read personal blueprints" ticket was needed.**
  `getCharacterBlueprints` (`esi/endpoints.ts`), `findOwnedBlueprint`
  (`features/industry/data.ts`), and the recursive `ownedBlueprints`
  threading through `materialEfficiencyFor` all already existed before this
  decision — confirmed by reading the code rather than assumed. This
  feature only replaces the _selection rule_ inside that existing plumbing
  and adds the pricing/UI on top; it does not need to build ownership
  access from scratch.
