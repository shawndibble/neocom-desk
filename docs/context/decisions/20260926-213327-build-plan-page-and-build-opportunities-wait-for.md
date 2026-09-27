# Scope decisions — Build Plan page and Build Opportunities wait for the pricing-settings hydration gate (issue #2054)

_Recorded 2026-09-26 · issue #2054._

- **The Build Plan page and Build Opportunities now wait for `pricingInputs.hydrated`
  before pricing, the same gate Build Plan Compare, the Industry index and
  Group Rollups already honor.** Rules out the alternative floated in the
  issue ("a brief pre-hydration pass is acceptable there") — consistency
  across every pricing surface beats saving the one Dexie read's worth of
  latency, and `hydratedPricingInputs`'s own fallback (settingStore.ts's
  `reread` always applies the default and flips `hydrated: true` on failure)
  means the wait can never hang or block navigation. The gate is applied by
  not rendering the pricing surface until it clears — `IndustryPlanPage.tsx`
  extends its existing `!catalog` spinner branch to `!catalog ||
!pricingInputs.hydrated`, and `Industry.tsx` shows the same spinner in
  place of `OpportunitiesPanel` alone (not the whole Opportunities tab, and
  not other tabs) until then — rather than adding a second, bespoke loading
  state inside either component. `useOpportunities`/`OpportunitiesPanel`
  themselves are unchanged: not mounting them until ready is enough to stop
  the first-pass fetch/price at the default settings, without needing to
  thread a `pricingReady` flag into the hook the way
  `useComparedBuildResults` does for its batched, already-mounted fetch.
