# Scope decisions — Active Jobs: slot chip moves to actions, tooltip reads used/max

_Recorded 2026-09-10._

- **The job-slot capacity chip (issue #679) moved from the panel's `meta`
  (beside the title) into its `actions` group, grouped with `DataAgeBadge`
  rather than appended after the caret.** Parked next to "N running · N done"
  it read as another fact about what's currently running, when it is actually
  free _capacity_ — unrelated to whether anything is running at all. A user
  report against a screenshot where the chip read `11/11/5` right beside "0
  running · 1 done" is what surfaced this; the two numbers looked like they
  described the same thing. Landing anywhere in `actions` — the header's only
  group right of `meta` — answers that. Where inside `actions` took a second
  pass: the first attempt put it last (literal outer-right edge), but that
  bumped the expand/collapse caret — this panel's primary affordance, and the
  one control a pilot's muscle memory expects at the terminal position — one
  slot inward for no reason. `DataAgeBadge` is this same toolbar's existing
  precedent for "passive, hover/glance-only info lives in `actions`, not
  `meta`"; the new chip is the same kind of thing (nothing to click, a
  tooltip on hover/focus), so it groups with that badge instead of
  interleaving with the three actionable buttons that follow. Rules out ever
  parking a read-only capacity/count badge in `meta` next to a "what's
  happening now" summary in this panel again, and rules out treating "far
  right" as "last, full stop" when a more important actionable control
  already holds that slot.
- **The chip's tooltip and the shared `industry.jobSlotBreakdown` i18n string
  now read `used/max` per category, not `open/max`.** `used = max - open`,
  computed locally in `ActiveJobsPanel.tsx` — `aggregateJobSlotSummary`
  (`src/engine/industry/jobSlots.ts`) still returns `{ open, max }` unchanged,
  since `Characters.tsx`'s `openJobsColumn` also depends on it and that
  column's own number (not just its tooltip) is deliberately `open`, per its
  own doc comment. `used/max` matches the wording `Characters.tsx`'s
  `openJobsTooltip` already established (`"{{used}}/{{max}} slots used"`) —
  used, not open, is the numerator a reader expects under a fraction, and it
  stays legible when open happens to equal max (`0/11`, not the
  doubled-looking `11/11`). The visible chip's own numbers (`entry.open`) and
  its per-category tone logic are unchanged — only the tooltip's numerator and
  the chip's new "Free slots" label changed, so the tone rule ("more open
  reads as more urgent") still applies to what's actually displayed. Rules out
  reusing `open`-numerator copy anywhere else this engine function's tooltip
  gets reused without re-deriving `used` the same way.
- **Active Jobs' activity and status chips became two `DropdownMenu` +
  `DropdownMenuCheckboxItem` menus ("Activity", "Status") instead of a
  `FilterChip` row**, following `CalendarKindFilterMenu`'s precedent
  (`DropdownMenu` at every width, `onSelect={(e) => e.preventDefault()}` to
  keep the menu open across a multi-toggle) rather than `FilterBar` — that
  component is built for a page-level filter row with a search box and a
  narrow-viewport Apply/Cancel sheet, which is the wrong weight for two small
  checkbox lists with no draft to commit. Both filters stayed plain
  `ReadonlySet` state with "empty = no filter" (the row's original
  `FilterChip` convention), not the shared `MultiSelectFilter`/
  `toggleFilterMember` pair: that pair's `'all'` sentinel is built for a
  picker that starts fully selected and narrows by _unchecking_ members
  (`CharacterFilterControl`'s "This character" → "All characters" flow).
  These two menus start with nothing checked and narrow by _checking_ which
  activities/statuses to include, so `'all'`-as-initial-state inverts the
  first click (confirmed by a failing test before this was caught: checking
  "Manufacturing" first narrowed the list to every _other_ activity). Rules
  out reaching for `toggleFilterMember` on a filter that starts empty rather
  than starting fully selected.
- **"Status" only offers "Completing soon" and "Done"**, not ESI's raw
  `status` enum (`paused`/`ready`/`reverted`/…) — the request asked for
  "completing soon and done and any other status we have," which this app
  already surfaces as exactly those two derived states (`isCompletingSoon`,
  `isJobDone`); nothing else is currently rendered as a distinct status
  anywhere in this panel. Rules out expanding this menu to raw ESI job status
  without a separate ask for it.
- **A job that's done gets the same treatment "completing soon" already had**:
  a success-tone badge on the blueprint cell, a success-tone left border
  stripe, a success-tone row tint (`bg-success/10`), success-tone "Ends in"
  text, and a green progress bar — mirroring the existing warning-tone
  treatment exactly, plus the collapsed header strip's own done-is-green bar
  (which the full table's progress column had never matched until now).
