# Scope decisions — Rename Craft Sweep to Auto Build, Sweep Strategy to Build Strategy

_Recorded 2026-09-10._

- **"Craft Sweep" is renamed "Auto Build" and "Sweep Strategy" is renamed
  "Build Strategy," everywhere — display text, i18n keys, component/file
  names (`CraftSweepControl.tsx` → `AutoBuildControl.tsx`,
  `BuildPlanCraftSweepControl.tsx` → `BuildPlanAutoBuildControl.tsx`,
  `craftSweepShared.tsx` → `autoBuildShared.tsx`, `craftSweepGroup.ts` →
  `autoBuildGroup.ts`), the `SweepStrategy` engine type → `BuildStrategy`,
  and every identifier built from either phrase (`craftSweepMaxDepth` →
  `autoBuildMaxDepth`, `onCraftSweep` → `onAutoBuild`, `sweepDepthContext` →
  `autoBuildDepthContext`, and so on).** On direct instruction — "Sweep
  Strategy" was judged meaningless to a pilot with no reason to know the
  internal mechanism's own name for itself. "Craft Scope" is unchanged: it
  is judged a distinct, still-meaningful concept (which production methods
  an Auto Build pass may mark buildable), not a stray "Sweep" word.

- **"Sweep Depth" is retired outright, not renamed** — the depth _choice_ it
  named was already removed from every surface
  (`20260910-220447-build-group-craft-sweep-drop-sweep-depth-choice.md`), so
  there is no remaining concept for a new name to attach to. Where prose
  still needed to talk about tree depth as a plain measurement (`maxDepth`,
  `maxAutoBuildDepth`'s own doc comment), it now reads as ordinary lowercase
  "depth" rather than a capitalized term of art.

- **Build Opportunities' own "Auto Build Depth" control (issue #652: a
  player-facing 0–3 depth setting on the ranking) is removed as unused,
  immediately before this rename lands** — not merely hidden, and not kept
  configurable at a fixed value: the UI control, the `autoBuildDepth`
  plumbing through `useOpportunities`/`opportunitiesCacheKey`, and the
  now-always-empty `buildHere` margin-column badge are all deleted, so every
  Opportunities row now prices with nothing auto-built (the underlying
  `computeOpportunityRow`/`autoBuildHere` capability this used is
  unchanged — it is simply never called with a non-zero depth from this
  surface anymore). This was a precondition for the rename above, not an
  independent cleanup: the removed control's own display label was the
  literal string "Auto build," and reusing that name for the renamed Craft
  Sweep feature while Opportunities' own unrelated "Auto build" picker still
  existed would have meant two different things on the same page answering
  to the same word. `MAX_AUTO_BUILD_DEPTH` (the removed control's UI-sizing
  constant) is deleted from `autoMakeOrBuy.ts` alongside it; the CONTEXT.md
  glossary's own "Auto Build Depth" entry is replaced by the new "Auto
  Build" entry rather than kept as a second, now-stale term.
