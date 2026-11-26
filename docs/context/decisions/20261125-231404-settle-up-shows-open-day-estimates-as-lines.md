# Scope decisions — Settle up shows open-day estimates as lines; credit only beyond them

_Recorded 2026-11-25._

- **A day line in the Settle up breakdown is the date and the amount the payment puts on it, nothing else.** The "· paid" and "· X still owed" suffixes are gone; what the payment leaves owed is the single "Still owed after it" row. Rules out per-day status words in the breakdown.
- **An open (not yet Billable) day the suggested amount includes gets its own row, noted "Estimate until the day closes".** The figures are the Corp Tax Book overlay's `estimate` rows for that Miner, summed per day (`BookMinerRunningAccount.estimateDays`). "Until the day closes", not "until end of day", because an estimate also stands for a day that has ended but is not billed yet.
- **Credit shows only for money beyond the billed days and the open-day estimates.** The Miner's running account only knows billed days, so `previewPayment` reports open-day money as credit; `coverOpenDays` moves it onto the estimate rows first, oldest day first. Rules out the old duplicate where the open day's figure appeared both as credit and in the sync note.
- **The pay dialog no longer repeats "N ISK of it is <day>, billed after …".** The estimate row in the breakdown is its one place; the sync note in the dialog keeps only the Safe-to-pay status.
- **The account to donate into is a row of the To/Amount/Reason box**, with the other divisions the book counts as its dim note, and Paid on and Record payment sit together in the dialog's footer. Nothing new is offered: the same facts and actions, regrouped.
- **The suggested amount stays `owes + estimate`.** Money a preview puts on a day the book already closed within tolerance is an engine matter, fixed separately in `MinerRunningAccount`, not worked around in the dialog.
