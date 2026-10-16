# Scope decisions — Journal range is a select; presets are relative and gated on local history (issue #3933)

_Recorded 2026-10-16 · issue #3933._

- **The Wallet Journal's range control is one select box beside the search box, not buttons.** Owner's call; it supersedes the buttons bullet of `20261016-093013-wallet-journal-and-transactions-kept-a-year-on.md`. The "History since" line keeps only the reach and gaps.
- **Options: Last 7 days, Last 30 days and All history always; Last 3 months, 6 months and year only once the local archive reaches that far.** Hidden, not disabled. The preset in the URL stays on offer while archive info loads, so it never flashes "Custom".
- **A preset is stored relative (`journal.range=7|30|90|180|365`) and resolved to a start day at read time.** A bookmark or a tab open past midnight UTC stays "last N days". Each preset counts today as day one (7 days = today + 6), like the Mining Yield ranges. Editing From/To, or the chips, drops it; All history clears range and dates; hand-set dates read "Custom".
- **The corp journal has the select too, with 7 days, 30 days and All history only.** It has no local archive.
