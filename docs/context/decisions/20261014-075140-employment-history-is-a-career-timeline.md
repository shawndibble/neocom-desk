# Scope decisions — Employment History is a career timeline

_Recorded 2026-10-14._

- **The Employment History page and the Public Info modal's Employment tab drop the table for one shared career timeline.** Summary figures on top (time in game, distinct corporations, current tenure, longest stay), then one card per stint down a rail. The data is unchanged: corporation, start date and the derived tenure. Everything else (`returned`, `shortStay`, `tenureRatio`, the summary) is derived from those in `employmentHistory.ts`. Sortable columns go away; the history is a story read newest-first, and the CSV export (rows only) stays on the panel's menu.
- **A stint's date range shows once.** On the page at `md` and up it sits in the gutter beside the rail dot; below `md` it sits under the corporation name. The modal is always narrow, so it has no gutter and always shows it under the name.
- **Tags are words.** CURRENT (success), RETURNED (neutral, the pilot was in this corporation in an earlier record) and SHORT STAY (warning, under 14 days). Colour is never the only signal. CURRENT keeps the page's rule from `20261005-211423`: only an ongoing row that matches the character's own corporation gets it; the modal, which has no character record, gives it to the ongoing row.
- **Neutral bars and dots, no accent.** Accent means clickable (§6c), so the tenure bar and rail dots use `line-bright`; only the current dot is `success`. The tenure is always printed beside the bar.
- **Tenure reads "2y 3mo", not "730d 4h 12m".** `formatTenure` (`src/lib/duration.ts`): days under two months, whole months under a year, then years and months. `formatDuration` stays for timers.
