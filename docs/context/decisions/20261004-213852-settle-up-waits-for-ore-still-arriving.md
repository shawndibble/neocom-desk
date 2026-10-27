# Scope decisions — Settle up waits for ore still arriving

_Recorded 2026-10-04._

- **Settle up shows one line about ore that may still be on its way, and never blocks.** A pilot who mines, stops and settles straight away may pay before ESI has reported the last of the day's ore. Paying anyway stays possible: a late arrival on a paid entry already flips it to Needs review, so this saves a true-up rather than lost tax.
- **The only signal is a ledger total that grew between two fetches.** ESI's ledger has no timestamps, just running totals per (character, EVE day, system, ore type). Each entry's last total, and the time of the fetch that first saw it grow, are kept on this device (`miningTaxOreArrivals`, local, not synced). An entry missing from the previous fetch counts as growth only if that fetch was made during the entry's own EVE day.
- **One hour is the window**, ESI's longest ledger lag:
  - An entry that grew within the hour gives the yellow line _"Ore still arriving · wait ~N min"_, or _"N entries still receiving ore · wait ~N min"_ when only some ticked entries are growing.
  - An entry that could still grow but hasn't in the last hour gives small print _"ESI can lag up to 1 h"_.
  - An entry whose EVE day ended more than an hour ago can't grow, and gets no line at all.
- **Only the ticked entries count.** Ore arriving for another Payee or system doesn't hold this settlement up.
- **Settle up pulls the ledger fresh as it opens, and again every 10 minutes (ESI's cache window) while it stays open.** This only happens when an entry on offer could still grow. The line reads _"Checking ESI…"_ while a pull runs, and _"Couldn't check ESI · it can lag up to 1 h"_ when it didn't reach a character's ledger. The countdown ticks each minute, so a pilot waiting in the dialog sees it clear on its own.
- **Deliberately terse.** The copy is meant to be understood in a skim; a longer note gets ignored.
