# Scope decisions — Build Opportunities prices owned blueprints as free, with real standings and skills (issue #2055)

_Recorded 2026-09-26 · issue #2055._

- **Build Opportunities prices each candidate through the same broker-fee
  standing and skills a Build Plan would use, resolved per the candidate's own
  owning Character, not one active Character.** `computeOpportunityRow` now
  takes an optional `standing` and always resolves the top-level product as
  owned/free (`blueprintAcquisition: { line: null }`), the same shape
  `resolveBuildPlan` gives a Build Plan. Rules out one shared `modifiers`/zero
  standings for the whole batch (issue #642's original, since #1238 gave Build
  Plans real standings and this never followed).
- **Owned blueprints are free at the top level, unconditionally — the Include
  Blueprint Cost setting has no effect on an Opportunities row.** Every
  candidate is, by construction, an owned copy (`buildOpportunityCandidates`
  only enumerates blueprints the owning Character already holds), so there is
  never a real acquisition gap to price at the top level. This is a
  deliberately different rule from a hand-made Build Plan's own acquisition
  resolution (which prices the gap when nothing is owned) — Opportunities
  never reuses `acquisitionForLookup`'s cost-minimizing tier search for the
  top-level product.
- **Each candidate prices at the Trade Hub its owning Character's most
  recently updated Build Plan uses (`hubForCharacter`), not a hard-coded
  default — batched per hub, not per row.** `groupCandidatesByHub` groups the
  batch by resolved hub so `useOpportunities` fetches one market snapshot per
  distinct hub, not per candidate. "Add to Compare" stamps the same resolved
  hub onto the seeded plan (`planForOpportunityCandidate`'s `hub` parameter),
  so re-pricing it as a real Build Plan matches the row that justified picking
  it.
- **Out of scope, left for later tickets:** corp-owned blueprint support in
  Opportunities (#839 — a candidate is always a personally-owned blueprint
  today), unowned/assumed-ME candidate pricing (candidates are never unowned
  by construction), and BPC Sourcing offers (no acquisition gap exists at the
  top level to source, per the point above).
