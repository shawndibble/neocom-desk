# Scope decisions — Certified Plans become ordinary Skill Plans (issue #2392)

_Recorded 2026-09-30 · issue #2392._

- **A Certified Plan is a starting point, not a linked template.** Picking one
  writes an ordinary Skill Plan. Nothing records where it came from, so when
  CCP edits a Certified Plan in a later SDE build, existing plans don't follow.
  That rules out a "this plan is out of date with CCP" badge and any re-sync.
- **CCP's order is kept as is.** The plan's entries are CCP's route,
  prerequisites first. They go through the same append rule as every other
  import, so a level an earlier row already covers is never added twice.
  Levels the Character already has stay in the plan, as they do for any
  import, and show as trained. _(Superseded 2026-10-01: trained levels are
  now dropped — see `20261001-113650-certified-plans-hide-when-trained-and-drop-trained.md`.)_
- **Only skill-level milestones carry over.** CCP's ship milestones ("fly an
  Iteron Mark V") have no skill level, and a Plan Milestone anchors to one, so
  they are dropped at bake time. The rest are named after their skill level
  ("Industry IV") because CCP gives them no name of their own. Anchoring a
  ship milestone to the last level its hull needs was considered and left out
  of this pass.
- **CCP's export is the source, not Fuzzwork.** Fuzzwork's CSV dump carries no
  skill plans, so `scripts/build-sde.mjs` reads `skillPlans.jsonl` (with
  `factions.jsonl` for faction names) from CCP's own JSONL export. It caches
  the zip under its build-numbered name. That export is the only table read
  from CCP directly; everything else stays on Fuzzwork.
- **Hand-written starter plans stay ruled out.** The add-missing-features
  ledger killed a curated template library because hand-authored modules go
  stale on every CCP skill rework. This feature doesn't reverse that: CCP
  writes and maintains these plans, and every SDE rebuild refreshes them.
- **Precached, not lazy.** `certifiedPlans.json` is about 110 KB, in the size
  class of the small precached files rather than the multi-megabyte
  single-feature ones that load on demand.
