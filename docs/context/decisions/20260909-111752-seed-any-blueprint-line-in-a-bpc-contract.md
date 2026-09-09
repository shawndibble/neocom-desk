# Scope decisions — Seed any blueprint line in a BPC contract, not just the Offer (issue #638)

_Recorded 2026-09-09 · issue #638._

- **This closes #637's "only the BPC Sourcing search table seeds" deferral.**
  `BpcContractModal`'s contents list now seeds too: `BuildPlanContextMenu`
  takes a `seed` computed per line from `PublicContractItem`, the same prop
  #637 built for `BpcSourcingPanel`'s Offers. `ContractDetailModal` (the
  Character's own contracts) is untouched — `ContractItem` has `runs` but no
  ME/TE at all, so there is nothing to seed from.

- **A new pure helper, `seedFromContractItem`, does the presence check —
  `newBuildPlan`/`Industry.tsx` needed no change.** `Industry.tsx` already
  consumes any seed reaching `/industry` generically (parse, reuse-match,
  name), regardless of source; #637 built that path source-agnostic on
  purpose. The only new logic is turning a `PublicContractItem` into a
  `BuildPlanSeed | null`, which lives in `planSeed.ts` beside the other seed
  helpers rather than in the component.

- **All three of ME/TE/runs must be present, same all-or-nothing rule as
  `parsePlanSeed`, checked against the optional ESI fields instead of a query
  string.** `PublicContractItem.material_efficiency`/`.time_efficiency`/`.runs`
  are "present on blueprint copies only" per ESI's own docs — an Offer's row
  (`BpcContractRow`) is guaranteed all three by construction, but a contract
  line is not. Missing any one means no seed: falling back to the unseeded
  defaults is a truer answer than quoting a copy as ME 0/TE 0, which is what
  a naive `?? 0` would do (and which the contents list's own display badge
  visibly avoids the same way, `material_efficiency ?? 0` there being a
  _display_ fallback, not a seeding one).

- **`seedFromContractItem` takes a structural subset of `PublicContractItem`
  (`is_blueprint_copy`/`material_efficiency`/`time_efficiency`/`runs`), not
  that type itself.** Keeps `planSeed.ts` decoupled from `@/esi/endpoints` —
  it already stayed decoupled from the router by taking a `Pick<URLSearchParams,
'get'>` for the same reason. `is_blueprint_copy` is checked explicitly
  rather than inferred from the three numbers being present, so a future ESI
  quirk that puts stray ME/TE/runs on a non-copy line still can't seed one —
  matching acceptance criterion "a non-blueprint line... never seeded."

- **No range validation in `seedFromContractItem` — `parsePlanSeed` is
  already the gate.** ME 0-10/TE 0-20/runs ≥ 1 are enforced once the seed
  rides through the URL into `/industry`, same as any other seed source; an
  out-of-range ESI value (which should never happen, but ESI has surprised
  this codebase before) is rejected there and falls back to unseeded rather
  than being clamped. Clamping here would only hide the same problem #637
  ruled clamping out for: Industry's create-if-missing effect stops
  re-firing only once the written plan matches its seed, so silently
  adjusting a value on the way in leaves the two disagreeing forever.

- **A requested line (`!is_included`) still seeds when it is a blueprint
  copy with all three numbers.** An item_exchange contract can ask for a
  specific BPC rather than offer one; the REQUESTED badge already existed
  before this ticket to tell such a line apart, and this ticket does not
  change which lines get a menu at all — only whether the menu it already
  had is seeded. Accepted rather than special-cased: `is_included` is a
  display distinction, not a "does this describe a real copy" one, and the
  ME/TE/runs on a requested line are exactly as real as on an offered one.

- **Reuse and naming are inherited, not re-decided.** `matchesPlanSeed` (value
  equality) and the `industry.seededPlanName` composition already used by
  Offers apply unchanged: two bundled copies at different research seed two
  differently-named plans, and right-clicking the same line twice reuses the
  first.
