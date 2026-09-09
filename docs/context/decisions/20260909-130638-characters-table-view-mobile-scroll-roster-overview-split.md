# Scope decisions — characters table view — mobile scroll, roster/overview split, open-jobs slot math

_Recorded 2026-09-09._

- **Characters owns the roster-wide table; Overview stays single-character.**
  Grilling session settled this after the first proposal (growing Overview
  with a table view) turned out to duplicate what Characters.tsx already had
  — grouping, starring, search, sort, live refresh. Overview answers "what
  needs my attention on the character I'm on"; Characters answers "how is my
  whole roster doing." A future agent tempted to add a cross-character table
  to Overview should read this first: the roster fan-out already lives in
  `features/character/roster.ts` / `rosterAttention.ts`, and Characters is
  where it's rendered.

- **The table view scrolls horizontally on mobile instead of collapsing to
  stacked cards — a deliberate deviation from `DataTable`'s own guidance.**
  `components/ui/DataTable.tsx`'s `responsive` prop doc says `'table'` is
  "only right for a table narrow enough to fit a 390px screen unaided," which
  this table (up to 10 columns) is not. The user asked for it anyway, by
  name, aware of the tradeoff: a literal, comparable table matters more here
  than the stacked-card layout every other `DataTable` in the app uses below
  `sm`. Do not "fix" this back to `responsive="stack"` — it's the ask, not an
  oversight. Card view (the default) is unaffected; only the table view
  deviates, wrapped in `overflow-x-auto`.

- **Card/table view and the column picker are device-local, not synced.** A
  phone and a desktop reasonably want different defaults (screen width), so
  this preference follows the device rather than the pilot — unlike the two
  SP-extraction settings below, which are judgement calls about the pilot
  and do sync.

- **SP-extraction "ready" is extractable SP above the 5,000,000 floor, not
  bare total SP.** (support.eveonline.com "Skill Extractors and Skill
  Injectors": a character can never be extracted below 5,000,000 SP, and one
  extractor pulls a fixed 500,000 SP chunk.) A naive `totalSp >= threshold`
  check on the 500k default flags every character within days of creation —
  caught in review before it shipped. `engine/spExtraction.ts`'s
  `extractableSp` subtracts the floor first; `isSpExtractionReady` is the
  only entry point that should ever gate this, in the UI column and in the
  poll domain alike.

- **The open-jobs column shows real slot capacity, not just running-job
  counts.** The user's own worked example ("manufacturing jobs 11/11,
  science jobs 9/11, reactions 0/5") is EVE's real per-category job-slot
  math: one free slot per category (manufacturing, science, reaction) plus
  one more per level of a basic skill and its "Advanced" counterpart (Mass
  Production/Advanced, Laboratory Operation/Advanced, Mass Reactions/
  Advanced — 5+5, 11 max each). "Science" is the umbrella EVE itself uses
  for research (TE/ME), copying, and invention — they draw from the same
  laboratory slots, not four separate pools. `engine/industry/jobSlots.ts`
  owns the numbers; `features/character/jobSlotSkills.ts` is the ESI-skill-id
  adapter. Verified against EVE Ref and support.eveonline.com before
  shipping — get the skill ids or the base-slot count wrong and the whole
  column lies confidently.

- **SP extraction's alert fires once per crossing, not once per poll —
  including the first poll after opt-in, if the pilot is already past
  threshold.** Edge-triggered the same way `characterNotTraining`
  (`engine/notificationDiffs.ts`) is, with one deliberate difference:
  `characterNotTraining`'s `if (!prev) return []` guard exists because
  training state flaps constantly, so a first-poll fire would flood.
  SP-ready takes months to cross, and the first poll after a pilot turns
  monitoring on _is_ their request to be told if they already qualify — so
  `diffSpExtractionReady` treats a missing baseline as "not ready before",
  not "skip this poll". Every Notification Event seam this touched —
  `events.ts`'s catalog, `pollDomains.ts`'s registry, `occurrenceKey.ts`'s
  two exhaustive switches, `notificationOptions.ts`'s route table,
  `alertGroups.ts`'s severity map — is load-bearing, not incidental; a future
  Notification Event needs all of them too, not a subset that happens to
  compile.

- **The `spReady` column reads raw `total_sp`, not `correctedTotalSp`.**
  Every other SP figure on this table (`spTotal`) shows `correctedTotalSp`
  (queue-gain-adjusted, `roster.ts`) to agree with the per-skill numbers
  shown elsewhere. `spReady` deliberately doesn't: it must agree instead
  with `pollDomains.ts`'s `spExtractionDomain`, which also reads raw
  `total_sp` — so the table's "ready" badge and the alert that fires never
  disagree about the same character. `Characters.tsx`'s `totalSpMap` is the
  one place that distinction is made; don't "fix" it back to
  `row.stats.skillPoints`.

- **Open Jobs is three columns (Mfg/Sci/Rxn), each showing _free_ slots
  (`max - running`), coloured red→yellow→plain as more of them sit idle.**
  Not one combined column: `DataTable` sorts one `sortValue` per column, and
  a pilot who wants "who's out of reaction slots specifically" can't ask that
  of a merged cell. The number is deliberately the inverse of the running-job
  count — "Open jobs" names spare capacity, and red means "slots sit empty,
  go queue something", not "slots are full" (the two read as opposite
  problems, so getting this backwards is worse than showing nothing).
  `Characters.tsx`'s `openJobsColumn` is the one place this math and the
  tone thresholds live.

- **Training and PI both show a live countdown (`formatDuration`) with an
  exact-timestamp tooltip (`formatTimestamp` + `useTimeZone`), not just the
  categorical state/attention label.** Neither is a new data source: the
  training finish time already lived in `RosterEntry.queue.data`
  (`classifySkillQueue`'s own `'training'` row), and the PI expiry already
  lived in `engine/pi/colonyStatus.ts`'s `ColonyStatus.soonestExpiryMs` —
  `rosterAttention.ts`'s `worstAttention` computed it and threw it away. Both
  columns fall back to the plain label when there's nothing to count down to
  (paused/idle training, a colony with no extractor running) — the countdown
  replaces the label, it doesn't hide it.
