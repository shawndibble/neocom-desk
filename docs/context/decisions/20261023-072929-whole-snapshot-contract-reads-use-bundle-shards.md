# Scope decisions — Whole-snapshot contract reads use bundle shards

_Recorded 2026-10-23._

- **Per-type objects stay; bundle shards sit beside them.** A search for one
  item still reads only that type's objects (ADR 0019). A read that needs every
  type — Below market, or an Item search with only a region or price filter —
  read all ~11.6k type objects, and BPC Sourcing read all ~3.1k blueprint
  types. At six in flight that took minutes. The writer now also publishes the
  same rows as a few ~8 MB (≈1 MB gzipped) shards, grouped `blueprints` and
  `others`, and `index.json` names them under an additive `bundles` field.
- **Blueprint type = a type with any row that is a copy or carries ME/TE.** All
  of that type's rows go in the `blueprints` group, so BPC Sourcing reads one
  group and still narrows it to the SDE's blueprints as before.
- **Shards are optional to readers.** An index without `bundles` (published
  before this, or after a failed shard upload) falls back to the per-type
  objects. A failed shard upload never holds the index back; the run logs a
  warning instead.
- **Shards skip the service worker cache.** They change nearly every publish
  and would crowd the 400-entry cache; the browser HTTP cache keeps them.
- **Smaller wins in the same change.** R2 reads run 24 at once (one HTTP/2
  connection), BPC Sourcing serves its last snapshot while the next is read
  (`allowStaleServe`), and Fuzzwork price batches run four at a time.
