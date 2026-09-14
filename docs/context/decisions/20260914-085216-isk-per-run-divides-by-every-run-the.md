# Scope decisions — ISK per run divides by every run the ask buys (issue #1017)

_Recorded 2026-09-14 · issue #1017._

- **The denominator is `runs × quantity`, not `runs`.** The ticket says
  "price ÷ runs", but a BPC listing is bought whole: a contract putting three
  ten-run copies up for 30M sells thirty runs for 30M, and a buyer cannot take
  one copy out of it. Dividing by a single copy's runs would print 3M and rank
  that lot below a 1.2M/run single copy — an inversion in exactly the
  comparison the column exists to make. An **Offer** is a contract row, not a
  copy, which two earlier decisions already settled; this one applies that to
  the rate. Rules out mirroring the Price column's "what this contract asks"
  framing in a cell labelled as a rate.

- **A listing stating no copies has no rate, same as a zero-run copy.** One
  guard, unknowable denominators, `null` for both — `courierRates.ts`'s
  convention, which the UI sinks in either sort direction. A BPO's `-1` runs
  answer `null` too, but only as a signature contract: the snapshot is
  narrowed to copies before BPC Sourcing sees it, so no original ever reaches
  the cell. Rules out `Infinity`, a stand-in figure, and dropping the row.

- **The rate lives in `engine/contracts/bpcSearch.ts` beside `effectivePrice`,
  not in a new module.** `courierRates.ts` exists because three courier
  figures were about to be defined in two components; there is one BPC rate
  and one surface that renders it, and it divides the number `effectivePrice`
  already returns. Rules out a `bpcRates.ts` that would hold a single
  function.

- **ISK/run reads the auction price `effectivePrice` gives it, unqualified.**
  On a no-buyout auction that is the starting bid, so the rate is a floor
  rather than a settled price — the same caveat the Price cell beside it
  carries in words. Diverging here (a `null`, or a qualified render) would put
  a number in the ISK/run cell that contradicts the price on the same row.
  Rules out `priceForMaxFilter`'s opposite stance, which answers a different
  question.

- **The column ships hidden and Price keeps the default sort.** It sits after
  Runs and Qty in the column order, the counts it divides by, exactly where
  ISK/jump sits after Jumps on the Courier board. Whether ISK/run should
  become the default sort ahead of listed price is left open — the ticket
  reserved that call for a human, and nothing here settles it.
