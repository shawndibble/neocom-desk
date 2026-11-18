# Scope decisions — Copy-only blueprints are never assumed to have an original (issue #6394)

_Recorded 2026-11-18 · issue #6394._

- **A short hand-listed set of blueprints (53032, 53033, 53034, 33196) is copy-only.** Their originals do not exist, so Blueprint Acquisition drops the hub BPO price and every original offer for them and, with no copy owned or offered, quotes ME 0 flagged `copyOnly` ("copy-only, none owned"). Owned copies and copy offers work as before. The list is a TS module (`src/engine/industry/copyOnlyBlueprints.ts`), not a baked field, because the app reads it at runtime and a test checks each id against the baked SDE.
- **76376 (Mutadaptive Construction Component) is left out.** Nothing confirms it has no original; it keeps the ordinary assumption until confirmed.
- **"No market group" is not used as a signal.** 2,351 published blueprints lack one.
