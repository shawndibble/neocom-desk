# Scope decisions — Contract price check shows the buyer's Saving

_Recorded 2026-10-30._

- **The Contract Search and BPC "Is it fair?" panels are buyer-view: the last
  row is a Saving, not a Difference.** The reader there would accept the
  contract, so a figure that reads "how much do I keep" is easier than "how far
  is the ask from market". For an ISK ask the Saving is the old diff turned over
  (`+10.0%` = ask 10% under the hub); for a blueprint copy it is the per-run
  diff turned over; for items for items it is Included against Requested,
  unchanged (more in than out is a gain). The value is green at 0.0% or above
  and red below (`savingTone`), judged on the printed figure, and the note beside
  it says it in a few words: "You save", "You overpay", "You gain", "You lose".
  This supersedes the "neutral colour, never `isk-pos`/`isk-neg`" line of
  `20261020-005242-contract-detail-price-check` for these two panels only.
- **An own contract's price check stays neutral and keeps "Difference".** The
  reader may be the seller, for whom a high ask is the good outcome, so no side
  is assumed (`asBuyer` is off).
