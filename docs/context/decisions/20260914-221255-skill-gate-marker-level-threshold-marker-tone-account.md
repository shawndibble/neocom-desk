# Scope decisions — skill-gate marker: level threshold, marker tone, account-wide skill source (issue #1015)

_Recorded 2026-09-14 · issue #1015._

- **Every unmet requirement is marked, at any level — no level-I exemption.**
  The ticket flagged this as an open call: 1,642 products gate only on
  scattered level-I science skills that train in about twenty minutes, and
  marking them is honest but may be noise. Resolved to mark all of them —
  none of the acceptance criteria carve out a threshold, and the mockups'
  own unmarked rows (Hulk, Retriever) are unmarked because every requirement
  is met, not because a level-I one was filtered out. This rules out adding
  a second, quieter tier of the marker; there is exactly one gated state.

- **The marker uses the `warning` token, not `text-dim`.** The ticket raised
  `text-dim` as the better register — a missing skill is a fact about the
  pilot, not a fault in the data, and `warning` is usually reserved for
  something that costs ISK. Resolved to `warning` anyway: all three mockup
  artboards and the ticket's own "Key interfaces" section specify it, and a
  blocked job is close enough to "this costs you the chance to run it" to
  keep the app's one existing warning-toned industry marker
  (`MaterialsTable`'s unpriced-material tag) company rather than adding a
  second visual language for "something is wrong with this row."

- **Account-wide skills are a new, general fan-out
  (`useAccountSkillLevels`), not a widening of Active Jobs' existing one.**
  The ticket named Active Jobs' per-character skill fan-out
  (`ActiveJobsPanel.tsx`) as precedent and asked whether to reuse it, hoist
  it to a shared hook, or accept a second one. `jobSlotSkillsFromCharacterSkills`
  is typed to the narrow six-skill `JobSlotSkills` shape job-slot math needs;
  widening it to carry every skill would change a live, tested fan-out's
  contract for a caller it was never written for. `useAccountSkillLevels`
  reuses the same underlying primitives instead (`loadCharacterSkills`,
  `mapWithConcurrencyLimit`, `ESI_FANOUT_CONCURRENCY`) as a new, more general
  consumer of them — one fan-out pattern, two typed views over it, rather
  than one fan-out doing two jobs.

- **`characterId -> active_skill_level`, not `trained_skill_level`.** Whether
  a character can install a job right now is an eligibility check, the same
  question job-slot counts already answer with `active_skill_level` (it can
  read lower than trained under an alpha clone or a lapsed expert system).
  This is the opposite choice from `useIndustryWorkspace`'s own single-
  character `SkillLevels` (job-cost math, which reads `trained_skill_level`
  via `loadCorrectedSkills`) — the two `SkillLevels` values in the app now
  answer different questions and are never interchangeable.

- **A character absent from the account-wide skill map reads as unknown,
  never as "meets nothing."** `evaluateSkillGate` returns `{ gated: false }`
  whenever the map is empty, and only evaluates characters actually present
  in it. This is the same "absent reads as unknown" convention Active Jobs'
  slot header already uses for an uncached character, applied here so a
  page whose account-wide fetch hasn't finished yet never flashes every row
  as blocked.

- **Two surfaces only: Market-Wide Build Opportunities and Build Plan
  detail's sub-build material rows — not the ordinary owned-blueprint
  Build Plan header, and not `BuildGroupPanel`.** The header stays verdict-
  free per the ticket's explicit acceptance criterion (an experienced
  industrialist who opens their own plan already knows their own skills).
  `BuildGroupPanel` never renders the shared `<MaterialsTable>` — it imports
  only its `SourcingInput` for its own materials rollup — so it was never a
  candidate; the ticket's two named surfaces are BuildPlanDetail's use of
  `<MaterialsTable>` and the market-wide panel.
