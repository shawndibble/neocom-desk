# Scope decisions (round 32) — accelerator-inflated attribute sheets

_Recorded 2026-09-02._

- **ESI reports effective attributes, and that includes a cerebral
  accelerator.** `GET /characters/{id}/attributes` folds in every modifier on
  the character. Round-1 code already subtracted fitted implants (the
  "Savings: 0m" fix); nothing subtracted an accelerator, because no ESI
  endpoint says one is running. A reported +12 therefore landed in the base
  sheet, and the same +12 landed again from the What-If Booster control — the
  double count behind a plan costed at 74.5 SP/min against the game's 56.5.
- **An out-of-budget base sheet is what silently zeroed the optimizer.** The
  user's sheet derived to 159 points against EVE's 99. `bestAttributes` can
  only offer allocations inside 17..27/99, so every one of them was slower
  than the character's own numbers, and `placeRemaps` — correctly, by its own
  contract that it never returns a plan slower than not remapping — kept them
  and reported zero savings. There is no bug in `src/engine/optimizer/`; a
  characterization block in `placeRemaps.test.ts` pins that down so nobody
  "fixes" it there. The fix belongs where the sheet is derived.
- **The accelerator is recovered by arithmetic, not by a table of known
  boosters.** A cerebral accelerator adds the _same_ bonus to all five
  attributes and a base sheet always totals 99, so the bonus is
  `(total - 99) / 5` — which covers every tier CCP has shipped or will ship,
  where a lookup of item names would need editing for each new one.
- **The recovery is accepted only when it verifies, and there is no third
  branch.** `deriveAttributeBaseline` takes the decomposition only if the
  bonus is a whole positive number _and_ all five attributes land back inside
  17..27. Anything else is reported as **impossible** and carries no
  attributes at all — the scheduler falls back to the same placeholder spread
  it already uses when ESI cannot be read, and the pane says so. A
  proportional or clamped approximation was considered and rejected: a wrong
  baseline is what caused this bug, and a wrong baseline derived more
  cleverly would be worse, because it would look right. `17..27` per attribute
  is not enough on its own either — clamping 29/38/34/29/29 gives 135, still
  over budget and still unbeatable.
- **A legal sheet is a total no-op.** No accelerator, no notice, no prefill,
  no changed number — that is the state almost every character is in almost
  all the time, and it is tested as its own case rather than as a corollary.
- **A detected accelerator is modelled as a Booster, prefilled and editable —
  never frozen into the base sheet.** It goes through the same `Booster`
  `computeSchedule` already splits a step at, so a bonus with a fortnight left
  stops paying after that fortnight instead of speeding up all 200 days of a
  long plan. Prefilling the control the user already knows is what makes the
  correction legible rather than magic; it seeds only while the control is
  untouched, and is theirs to change or clear afterwards. (Round 33 restates
  "untouched" as "the plan has stored no Booster", now that it stores one.)
- **The expiry is left blank on purpose, and called out.** No ESI endpoint
  exposes active boosters, so the app can read the accelerator's _size_ and
  not its _life_. Inventing one would be the same class of error as assuming
  it lasts forever. A blank expiry means no Booster is applied at all, so the
  plan is costed as if there were none — pessimistic, honest, and stated in
  the pane rather than left for the user to discover as an unexplained
  slowdown.
- **`AttributeChips` still reads `base = effective - implants`, one term short
  of the derivation.** On an accelerated sheet the chips show base plus the
  accelerator. Left as it is deliberately: it is the character's _reported_
  sheet, shown on three surfaces across two routes with their own data
  loading, and the Booster note beside it in the planner names the difference.
  Folding the accelerator in there is a display change for a later round, not a
  correctness one.
