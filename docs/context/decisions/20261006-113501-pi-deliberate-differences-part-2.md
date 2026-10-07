# Scope decisions — PI deliberate differences, part 2 (issue #2767)

_Recorded 2026-10-06 · issue #2767. From the PI final review, round 2. Follows [part 1](20261005-210436-pi-design-refs-deliberate-differences-not-built.md)._

Shawn decided these four stay as built; none is a gap to close.

- **No extractor-speed sparkline on an expanded Colonies row.** The mock draws a small decay chart per extractor. `ColonyExpanded.tsx` shows the yield as numbers instead (banked so far, "Reset now" gain). A chart of the real decay curve (`extractorCycleYields` / `fractionOfPeak`) costs more than it informs: the decision it supports is "reset or not", and the reset gain already answers it.
- **"Reset now" stays in units a day, with no ISK figure.** `resetGainPerDay` is raw P0 units, labelled "units/day". An ISK figure would need a price basis for raw P0 (sell the raw, or value it by what it makes), and either choice would be a guess shown as a fact. No basis is picked.
- **The explainer stays a non-modal slide-over: no scrim, an outside click does not close it.** `PiExplainer.tsx` uses `SlideOver`, which is non-modal by contract (`docs/DESIGN.md` §4: an outside click never closes it), and §6c's tap-outside rule names menus, popovers and sheets, not slide-overs. No opt-in modal `SlideOver` is added for it.
- **The 1920 docked Map panel keeps the bare "Details" hint when nothing is traced.** `PlanMap.tsx`'s docked panel shows the hint until a product is traced or linked; the mock's "Best use of your planets" content is not built there. The picks strip above the map already carries it.

Do not list these as "differences from the mock" in reviews, and do not build them without a new decision.
