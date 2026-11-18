# Scope decisions — BPC Sourcing vs peers column (issue #6358)

_Recorded 2026-11-17 · issue #6358._

- **BPC Sourcing has an optional, sortable "vs peers" column and nothing more.** It is the percent of a contract copy's per-run price from the median of similar copies (same blueprint, ME within 2, TE within 4), the same figure the contract detail panel prints, from the same `bpcPerRunCheck`. Hidden by default; blank with fewer than three similar copies, for a bundle or barter, and for non-contract sources. Neutral text, never gain/loss colours: the reader's side is unknown (`20261020-005242`). The CSV export carries it too, rounded to one decimal.
- **The pool is every listed copy, not the filtered board** (`20261020-005242`), so a tight ME, price or region filter never changes a row's percent. The pool is grouped by blueprint once and each answer remembered, so sorting the whole board stays linear in the copies of a blueprint per row.
- **No cross-blueprint "deals" lens and no filter.** An unfiltered sort on this value surfaces trolls and three-copy pools where a median means nothing; a pilot who sets a minimum ME or runs gets the lens by sorting. History does not sharpen the figure either: the board is already a ~28-day pooled sample (ledger kill-test 51).
