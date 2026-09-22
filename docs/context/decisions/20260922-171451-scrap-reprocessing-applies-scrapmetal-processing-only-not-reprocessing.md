# Scope decisions — Scrap reprocessing applies Scrapmetal Processing only, not Reprocessing skills (issue #1226)

_Recorded 2026-09-22 · issue #1226._

- **Scrap gets Scrapmetal Processing's bonus only — Reprocessing and
  Reprocessing Efficiency never apply to it.** This corrects
  `docs/context/decisions/20260906-180034-reprocessing-v1-models-the-skills-and-states-the.md`,
  which stated one universal formula (`50% × (1 + 0.03 × Reprocessing) × (1 +
0.02 × Reprocessing Efficiency) × (1 + 0.02 × specialisation)`) for every
  item. In EVE, Reprocessing and Reprocessing Efficiency are ore/ice/moon-ore
  skills; scrap (modules, ships, anything without the SDE bake's attribute-790
  `specialisationSkillID`) is bonused by Scrapmetal Processing alone. Scrap's
  formula is `stationRate × (1 + 0.02 × Scrapmetal Processing)`; ore/ice/moon
  ore keeps the original three-skill formula, since its specialisation attribute
  is present and distinguishes it. `reprocessingEfficiency()` in
  `src/engine/industry/reprocessing.ts` branches on the new `isScrap` flag,
  which `resolveReprocessingSkills()` sets from whether a
  `specialisationSkillId` was resolved for the type at all — the same
  attribute-790 presence check `resolveSpecialisationLevel` already used to
  pick which skill to read, extended to also gate which formula applies.
