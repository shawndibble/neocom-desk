# Scope decisions — Blueprint cost counts toward Industry profit by default, everywhere

_Recorded 2026-09-11._

- **Blueprint Acquisition's cost (issue #838/#839) was only ever wired into
  `BuildPlanDetail.tsx`, and this was a bug, not a narrower intended scope.**
  The Industry index's Profit column and every Build Group rollup
  (`BuildGroupPanel.tsx` included, since it also prices through the shared
  `useComparedBuildResults.ts` hook) silently excluded the acquisition cost
  line that a plan's own page already counted — a plan needing a blueprint
  copy read as more profitable everywhere except the page that priced it
  correctly. The fix wires the same `blueprintAcquisition`/`acquisitionFor`
  resolution, including the resolved-tier ME/TE override, into
  `useComparedBuildResults.ts` so all three surfaces agree.

- **A pilot can turn the cost back off, but the tier still resolves —
  `useIncludeBlueprintCost` degrades the cost line to `null`, it never
  reverts to the pre-#838 ME-only heuristic.** Some pilots always build off
  an owned/researched BPO and want "what would a copy cost" left out of the
  verdict entirely, the same kind of standing build-philosophy answer
  `assumedMe`/`assumedTe` already give. The setting does not gate whether
  Blueprint Acquisition _runs_ — `acquisitionForLookup`'s cost-minimizing
  tier selection always runs, so material quantities at the resolved
  ME/TE never change — it only zeroes the reported cost, via
  `withoutAcquisitionCost` wrapping the same closure both
  `BuildPlanDetail.tsx` and `useComparedBuildResults.ts` already build. This
  keeps the tier a pilot sees on a plan's Setup panel identical whether the
  toggle is on or off.

- **Default on (cost counted in), matching what the code already did on a
  plan's own page before this fix.** An existing pilot's numbers on
  `BuildPlanDetail.tsx` do not move; only the index/group surfaces that were
  silently wrong now agree with it. This is the same "default reproduces
  today's behavior of the page that already had it right" rule
  `assumedMe.ts`/`assumedTe.ts` followed for their own settings.

- **Synced, not device-local.** "Do I want blueprint cost counted toward
  profit" is an answer about the pilot's own build philosophy, not about one
  machine — the identical reasoning `assumedMe.ts`'s doc comment gives for
  syncing ME/TE assumptions. `sync.industryIncludeBlueprintCost` joins the
  Defaults-panel preference cluster in `syncedSettings.ts`, paying that
  allow-list's standard three-file cost (allow-list, pinned test literal,
  FAQ "What We Store" wording) rather than being scoped down to a
  device-local `useLocalSetting` to avoid it.

- **The Blueprint Acquisition picker/override modal (`BlueprintAcquisitionModal.tsx`)
  is untouched and still shows real ISK.** That modal is where a pilot
  actively chooses which tier to acquire and what it costs — legitimate
  market information regardless of whether the toggle excludes it from the
  profit verdict. Only the profit-facing `acquisitionFor` paths
  (`BuildPlanDetail.tsx`'s results computation, `useComparedBuildResults.ts`)
  read the setting; the picker builds its own tier options directly.
