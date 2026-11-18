# Scope decisions — Engineering rigs apply per product scope (issue #6392)

_Recorded 2026-11-18 · issue #6392._

- **A rig only boosts the products its rig group covers.** Standup engineering rigs share one set of numbers (ME 2 / 2.4, TE 20 / 24, security 1 / 1.9 / 2.1); only scope differs, so the defect was scope, not magnitude. A rig kind is now `<line><tier>:<rig group>` (e.g. `meT2:basCapComp`), stacked with the 1 / 0.869 / 0.571 penalty only against rigs that reach the same product.
- **The old `meT1`..`teT2` kinds stay and mean "applies to every product".** Saved plans, Facility Defaults and synced records keep their value untouched (additive, no migration; dev and prod share Firestore).
- **Product -> scope is hand curated, and the bake pins the dogma text.** CCP ties each rig effect to one structure attribute but nothing ties an attribute to product groups; only the attribute `description` states the scope. `scripts/lib/rigScope.mjs` holds the curated map and the pinned descriptions (15 material attributes); `bakeIndustry` fails if one changes, and bakes `rigScope` into `blueprints.json`. A product no rig covers (mutaplasmids, filaments, sovereignty upgrades) gets none, so only an unscoped rig reaches it.
- **M, L and XL are one choice.** Size does not change the bonus; the XL rigs are coarser groups (`xlConsumable`, `xlShip`, `xlComponent`), so they are rig groups of their own rather than a size field.
- **Out of scope:** a separate location per product category, and Thukker/faction rig variants (different security multipliers; listed, not modelled).
