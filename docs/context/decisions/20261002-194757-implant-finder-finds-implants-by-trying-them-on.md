# Scope decisions — Implant Finder finds implants by trying them on the Fitting

_Recorded 2026-10-02._

- **Nothing records which implant does what; the fitting engine is asked.**
  Every implant family's best grade is run on the open Fitting, against its
  slot left empty, and a goal lists only the families that change it — so a
  goal nothing on the Fitting uses (no turrets, no drones) is simply not
  offered, and a family already in the set keeps its Remove and lower grades.
  A hand-kept table of implant effects was the alternative and was rejected:
  it goes stale with every balance pass and can't see stacking or what this
  particular Fitting carries. Running ~500 families costs about a second or
  two on open, shown as progress.
- **Each grade is its own row, named by its code (EE-601 … EE-606).** Abstract
  1–6% buttons were tried in the mockup and read as a setting, not a choice
  of item to buy; the codes are what the market and the game call them.
- **Slots come from the "Implant Slot NN" market groups.** The baked SDE has no
  slot attribute, and every implant sits under one of those groups. Adding an
  implant replaces whatever is in its slot — the engine doesn't enforce one
  per slot, so the finder does.
- **Prices are the default Trade Hub, picked with the shared `PriceHubSelect`.**
  Changing it in the window changes the synced default, the same as the
  Fitting's Price section, since that's the price the Fitting is shown at.
  When that hub has no sellers the cheapest other hub is used and marked as
  not at your Trade Hub; "not for sale" when none sells it.
- **Fixes are the cheapest one-per-slot combinations that bring the Fitting
  under budget, confirmed by the engine.** The search sums each implant's own
  headroom (fast, no engine), the cheapest dozen are re-run whole because
  stacking can sink an estimate, and only then is a dearer option dropped
  unless it leaves more headroom than every cheaper one.
- **It always adds to the set the Fitting carries**, whichever implants the
  page's own numbers use; on "My clone" the window says so.
- **Out of scope here, deliberately:** LP store offers (with LP balances and
  required tags), a market-derived LP Value — which would reverse the
  **LP Value** entry's "the app never guesses a rate" and needs its own
  decision — and boosters, which have no slot and aren't searched yet.
