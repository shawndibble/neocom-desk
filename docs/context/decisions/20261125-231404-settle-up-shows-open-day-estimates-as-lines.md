# Scope decisions — Settle up shows open-day estimates as lines; credit only beyond them

_Recorded 2026-11-25._

- **A day line in the Settle up breakdown is the date and the amount the payment puts on it, nothing else.** The "· paid" and "· X still owed" suffixes are gone; what the payment leaves owed is the single "Still owed after it" row. Rules out per-day status words in the breakdown.
- **An open day (**Today's mining**, not yet **Billable**) the suggested amount includes gets its own row, noted "Estimate until the day closes".** The figures are the Corp Tax Book overlay's `estimate` rows for that Miner, summed per day (`BookMinerRunningAccount.estimateDays`). "Until the day closes", not "until end of day", because an estimate also stands for a day that has ended but is not billed yet.
- **Credit shows only for money beyond the billed days and the open-day estimates.** The Miner's running account only knows billed days, so `previewPayment` reports open-day money as credit; `coverOpenDays` moves it onto the estimate rows first, oldest day first. Rules out the old duplicate where the open day's figure appeared both as credit and in the sync note.
- **The Reason names the open days the amount covers too**, after the billed days, so it lists the same days as the breakdown. It is informational for officers; nothing parses dates out of it.
- **The pay dialog no longer repeats "N ISK of it is <day>, billed after …".** The estimate row in the breakdown is its one place; the sync note in the dialog keeps only the Safe-to-pay status.
- **The account to donate into is a row of the To/Amount/Reason box**, with the other divisions the book counts as its dim note, and Paid on and Record payment sit together in the dialog's `Modal` footer (with the save error and the Dismiss confirm step, so they show beside the buttons); DESIGN.md's footer rule now allows the fields an action records. Nothing new is offered: the same facts and actions, regrouped.
- **The suggested amount stays `owes + estimate`.** Money a preview puts on a day the book already closed within tolerance is an engine matter, fixed separately in `MinerRunningAccount`, not worked around in the dialog.
