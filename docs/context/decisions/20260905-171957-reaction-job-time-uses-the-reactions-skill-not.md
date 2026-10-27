# Scope decisions — Reaction job time uses the Reactions skill, not Industry (issue #513)

_Recorded 2026-09-05 · issue #513._

- **The sourcing question #513 was opened to answer is settled, and the answer
  is "both branches".** The ticket offered two mutually exclusive outcomes —
  either no skill reduces reaction time (drop the Industry terms) or one does
  (add it). Both are true at once: Industry/Advanced Industry do not apply to a
  reaction job _and_ the Reactions skill reduces it by 4% per level. Doing only
  the second would have left the original overstated bonus in place, so
  `timeModifier` swaps its skill terms by activity rather than appending one.

- **Sources, cited the same way the rest of the engine is.** everef.net
  ref-data dogma attributes, read from both directions — the attributes on the
  skills, and the descriptions of the attributes themselves. Industry (3380)
  carries only `manufacturingTimeBonus` (440, -4). Advanced Industry (3388)
  carries `advancedIndustrySkillIndustryJobTimeBonus` (1961, -3), type
  description "3% reduction in all manufacturing and research times per skill
  level"; reaction is `industryActivity` 11, neither manufacturing (1) nor
  research. Reactions (45746) carries `reactionTimeBonus` (2660, -4),
  described as "Skill attribute that reduces time for reactions jobs". The EVE
  University wiki "Reactions" §Skills list agrees: Reactions (time), Mass
  Reactions and Advanced Mass Reactions (`reactionSlotBonus` 2661, job slots),
  Remote Reactions (range) — and no Industry skill.

- **Attribute 1961's own description is the one loose thread, and it is
  recorded rather than ignored.** That attribute is described as "A bonus to
  all industry job times", which reads wider than the skill's type
  description. The type description is the narrower and authoritative of the
  two, and CCP shipping a separate `reactionTimeBonus` attribute at all is only
  coherent if the manufacturing attributes do not reach reactions. Both halves
  are written into `types.ts`'s source block so a future pass re-reading the
  attribute description alone does not reopen this.

- **The activity branch touches the skill terms only.** Facility and reactor-rig
  terms were sourced in #460 and are deliberately left shared; the branch is a
  per-activity list of `(skill typeID, percent per level)` pairs multiplied into
  the same modifier, so the range check on a trained level still runs for
  whichever skill the activity actually reads.

- **Nothing outside `time.ts` needed plumbing.** Character skills already reach
  the engine as a full `SkillLevels` map from `loadCorrectedSkills`, so
  Reactions arrives with no new fetch. `makeOrBuy.ts`'s `reactionUnitCost`
  quotes against `FACILITY_PRESETS.athanor`, whose `activity` is `'reaction'`,
  so a reaction sub-input's quote inherits the fix. Material output is
  unaffected — no industry skill has ever touched it.

- **Supersedes the "No skill-bonus carve-out for reactions" bullet in
  `20260905-130600-reactions-as-a-build-plan-activity.md`.** That bullet
  recorded the unconditional Industry/Advanced Industry terms as a deliberate
  hold pending sourcing, with this issue named as the follow-up. The sourcing
  is now done and that bullet no longer describes the code.
