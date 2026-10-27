# Scope decisions — Moon Mining: price compressed ore at Jita buy, to match corp billing (issue #523)

_Recorded 2026-09-06 · issue #523._

- **Moon Mining now values ore at the highest Jita _buy_ order, of the ore's
  _Compressed_ counterpart when one exists, instead of the raw type's own
  lowest _sell_ order.** Direct user report: comparing our figures against
  their corp's actual billing ledger for the same mining-ledger entries
  (same date, same system, same ore lines) found ours running ~19% high, and
  investigation (live Fuzzwork pulls for Zeolites/Bitumens and their
  Compressed pairs) pinned it to two compounding causes, not one:
  - Raw ore vs. compressed ore are separate market items with independent
    order books. The corp's ledger prices `Compressed Zeolites`
    (type 62463), not raw `Zeolites` (type 45490) — even though the
    personal mining ledger (`GET /characters/{id}/mining/`) only ever
    reports the raw type, since compression is a separate industry job ESI
    has no way to fold into that endpoint.
  - The corp's own column is labeled "Jita buy/unit" — they value at the
    highest buy order (what the ore is worth if sold right now), not the
    lowest sell order (what it costs to buy more).
  - Both push the same direction, which is why the gap looked like one
    consistent ~19% overcount rather than two smaller, opposite-signed ones.
- **This is a deliberate divergence from Industry's own pricing convention**
  (lowest Jita sell, ADR 0002's stated need, `pricing.ts`'s prior doc
  comment calling that "the conventional meaning of an unqualified Jita
  price") — that convention was only ever Industry's, this ticket just
  inherited it as a default without confirming Moon Mining should share it.
  ADR 0002 itself isn't amended: it decided the _data source_
  (Fuzzwork primary), not sell-vs-buy, and stays accurate for Industry.
- **The raw-typeId → Compressed-typeId mapping is derived at build time**
  (`scripts/build-sde.mjs`, `compressedOreTypeIds.json`), by name (`types.get(id).name`
  vs. a `"Compressed " + name` lookup across every published invType), not by
  market-group id — the "Moon Ores" tree happens to nest both forms together,
  but nothing guarantees that for every ore/ice category, and matching by
  name works everywhere the SDE's own naming convention holds. 187 of 442
  tracked ore/ice types resolved a pair on this build; a raw type with none
  (rare) prices as itself, unchanged from before.
- **`pricing.ts`'s `loadJitaUnitPrices` still returns a `Map` keyed by the raw
  typeId** the caller asked about, so every existing call site
  (`reconcile.ts`, `AssignDialog.tsx`, `MoonMiningTax.tsx`) needed zero
  changes — the compressed-vs-raw substitution and buy-vs-sell switch are
  both internal to this one function.
