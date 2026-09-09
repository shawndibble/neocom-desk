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

- **SP extraction's alert fires once per crossing, not once per poll.**
  Mirrors the existing `characterNotTraining` event's edge-triggered shape
  (`engine/notificationDiffs.ts`) rather than inventing a new firing rule: a
  persistent true condition renotifies only on the transition into it, never
  while it stays true. Every Notification Event seam this touched —
  `events.ts`'s catalog, `pollDomains.ts`'s registry, `occurrenceKey.ts`'s
  two exhaustive switches, `notificationOptions.ts`'s route table,
  `alertGroups.ts`'s severity map — is load-bearing, not incidental; a future
  Notification Event needs all of them too, not a subset that happens to
  compile.
