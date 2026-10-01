# Scope decisions — Certificates tab grades the combat groups only (issue #2390)

_Recorded 2026-09-30 · issue #2390._

- **Only the nine combat groups.** The tab covers Gunnery, Missiles, Drones,
  Shields, Armor, Targeting, Navigation, Engineering and Electronic Systems,
  68 certificates in all. The build filters them by group id, not by name.
  Production, Science, Trade, Resource Processing, Planet Management, Social,
  Corporation Management, Scanning and Fleet Support are left out:
  - Industry readiness is a per-blueprint question, and the skill-gate marker
    on Build Plans already answers it.
  - The 38 Science certificates are per-race bundles that only add bulk.
- **No "lagging area" audit rule.** The hostile review cut a hand-typed rule
  (two grades below the group median, or below Standard in support groups).
  It would be our opinion in code with no data to check it against, and it
  would flag most rows. The default sort, lowest grade first, puts weak areas
  at the top instead.
- **Read from CCP's export, not Fuzzwork's `certCerts.csv`.** The ticket
  suggested the Fuzzwork file. The bake reads `certificates.jsonl` and
  `groups.jsonl` from CCP's JSONL export instead, the same zip Certified Plans
  already come from. That gives names, descriptions and group names from one
  build. Ship masteries still come from Fuzzwork's `certMasteries.csv` and
  `certSkills.csv`, so this change doesn't touch them.
- **CCP's grade keys are mapped by name.** Each skill's `basic`, `standard`,
  `improved`, `advanced` and `elite` levels arrive with their keys in
  alphabetical order, so the grade order comes from a fixed list, never from
  the object. A level of 0 means "not needed at this grade" and is dropped.
- **One grading rule with Mastery.** A certificate's grade is the highest
  level whose skills, and every lower level's, are trained. This is the
  Mastery rule, now shared as `engine/tierLadder.ts`. That rule stops at an
  empty tier, so the build fails if any certificate has an empty grade.
- **Grades use trained levels, matching Mastery.** Grades read the
  queue-corrected trained levels the Skill Plan editor and the Mastery tab
  use. They don't read effective (min of trained and Alpha cap) levels. An
  Alpha Character sees the cap separately: a grade blocked by it shows
  "Omega only" and names the capped skills, and Omega Characters never see
  the marker. The missing-skills list and Add are built from trained levels,
  so a lapsed Omega is never told to retrain a level it already has.
- **The grade label is a caption.** Each row leads with the missing skills
  and the time to the next grade, because CCP's grades are coarse (EVEMon
  Certificates Enhanced exists to re-grade them). Re-grading CCP's
  certificates our own way is out of scope.
- **The group filter is a select, not chips.** The ticket sketched chips.
  Ten group chips wrapped to five lines on a phone before a single
  certificate showed, so the group is a `Select` ("All groups" plus the
  nine). "Hide Elite" stays a chip.
- **Precached.** `certificates.json` is about 100 KB, the same size class as
  `certifiedPlans.json`.
- **Out of scope:** certificate grades in Skill Compare, curated starter
  plans, and the industry groups listed above.
